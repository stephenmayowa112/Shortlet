import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import { extractClientIp, getRateLimiter } from "@/lib/security/rate-limit";
import type { EnquiryTicket } from "@/lib/types";

const EnquirySchema = z.object({
  listingId: z.string().min(3).max(64),
  listingTitle: z.string().min(2).max(160),
  category: z.enum(["apartment", "car", "boat"]),
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(6).max(30),
  requestedStartIso: z.string().optional(),
  requestedEndIso: z.string().optional(),
  providerMessageId: z.string().min(3).max(120).optional(),
  assignedAdminUid: z.string().min(2).max(80).default("adm-ops-1"),
});

const processedProviderMessageIds = new Set<string>();

export async function POST(req: NextRequest) {
  const ip = extractClientIp(req.headers);
  const limit = getRateLimiter().check(`enquiry_create:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many enquiry requests. Please wait a minute before trying again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const parsed = EnquirySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid enquiry payload." },
      { status: 400 }
    );
  }

  // Deduplicate repeated provider message IDs (Task 7: MSG-03 / WhatsApp webhook replay)
  if (parsed.data.providerMessageId) {
    if (processedProviderMessageIds.has(parsed.data.providerMessageId)) {
      return NextResponse.json({
        accepted: true,
        duplicateMessageIgnored: true,
        providerMessageId: parsed.data.providerMessageId,
      });
    }
    processedProviderMessageIds.add(parsed.data.providerMessageId);
  }

  const nowIso = new Date().toISOString();
  const ticketRef = `TKT-${Date.now().toString(36).toUpperCase()}`;
  const ticket: EnquiryTicket = {
    ticketRef,
    listingId: parsed.data.listingId,
    listingTitle: parsed.data.listingTitle,
    customerName: parsed.data.customerName,
    customerContact: parsed.data.customerPhone,
    assignedAdminUid: parsed.data.assignedAdminUid,
    status: "open",
    lastMessageText: `Enquiry for ${parsed.data.listingTitle} (${parsed.data.category})`,
    internalNotes: "",
    messages: [
      {
        messageId: `MSG-${Date.now().toString(36).toUpperCase()}`,
        providerMessageId: parsed.data.providerMessageId,
        sender: "customer",
        senderName: parsed.data.customerName,
        body: `Enquiry for ${parsed.data.listingTitle}`,
        atIso: nowIso,
      },
    ],
    providerMessageIds: parsed.data.providerMessageId ? [parsed.data.providerMessageId] : [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await getRepositories().tickets.saveTicket(ticket);

  return NextResponse.json({
    accepted: true,
    duplicateMessageIgnored: false,
    ticket,
  });
}

export async function GET(req: NextRequest) {
  const ticketRef = req.nextUrl.searchParams.get("ticketRef")?.trim();
  if (!ticketRef) {
    return NextResponse.json({ error: "Provide ticketRef query parameter." }, { status: 400 });
  }
  const ticket = await getRepositories().tickets.getTicket(ticketRef);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}
