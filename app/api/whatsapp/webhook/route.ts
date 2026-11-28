import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyMetaWhatsAppSignature } from "@/lib/adapters/whatsapp-cloud";
import { whatsappAdapter } from "@/lib/adapters/whatsapp-provider";
import { getRepositories } from "@/lib/repositories";
import { extractClientIp, getRateLimiter } from "@/lib/security/rate-limit";
import { logInfo, logWarn } from "@/lib/security/logger";
import type { EnquiryTicket } from "@/lib/types";

const seenWhatsAppMessageIds = new Set<string>();
let roundRobinCursor = -1;

function getVerifyToken(): string {
  const configured = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (configured && !configured.includes("replace_with")) return configured;
  return process.env.NODE_ENV !== "production" ? "dev_whatsapp_verify_token_local" : "";
}

function getAppSecret(): string {
  const configured = process.env.WHATSAPP_APP_SECRET?.trim();
  if (configured && !configured.includes("replace_with")) return configured;
  return process.env.NODE_ENV !== "production" ? "dev_whatsapp_app_secret_local" : "";
}

/**
 * Meta WhatsApp Cloud API Webhook Challenge Verification (GET).
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = req.nextUrl.searchParams.get("hub.challenge") ?? "";

  const expected = getVerifyToken();
  if (!expected || mode !== "subscribe" || !challenge) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid verify token." }, { status: 403 });
  }

  // Return strictly as text/plain to prevent reflected HTML/XSS
  return new NextResponse(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

interface MetaWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Meta WhatsApp Cloud API Inbound Message Webhook (POST).
 * - Verifies `X-Hub-Signature-256` (HMAC-SHA256 over raw body, constant-time compare).
 * - Deduplicates provider message IDs cleanly.
 * - Parses optional listing ID from text (flags manual lookup if edited/omitted).
 * - Assigns single owner via round-robin.
 */
export async function POST(req: NextRequest) {
  const ip = extractClientIp(req.headers);
  const limit = getRateLimiter().check(`whatsapp_webhook:${ip}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = getAppSecret();

  if (!verifyMetaWhatsAppSignature(rawBody, signature, appSecret)) {
    logWarn("whatsapp.webhook.rejected_signature");
    return NextResponse.json({ error: "Invalid WhatsApp webhook signature." }, { status: 401 });
  }

  let parsed: MetaWebhookBody;
  try {
    parsed = JSON.parse(rawBody) as MetaWebhookBody;
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
  }

  const repos = getRepositories();
  const createdTicketRefs: string[] = [];
  let duplicatesIgnored = 0;

  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const contacts = value?.contacts ?? [];
      for (const msg of value?.messages ?? []) {
        const providerMsgId = msg.id?.trim();
        if (!providerMsgId) continue;

        if (seenWhatsAppMessageIds.has(providerMsgId)) {
          duplicatesIgnored++;
          continue;
        }
        seenWhatsAppMessageIds.add(providerMsgId);

        const bodyText = msg.text?.body?.trim() ?? "[Non-text WhatsApp message]";
        const senderPhone = msg.from?.trim() ?? "unknown";
        const senderName =
          contacts.find((c) => c.wa_id === senderPhone)?.profile?.name?.trim() ||
          "WhatsApp Guest";

        const hint = whatsappAdapter.parseListingIdFromText(bodyText);
        const rr = whatsappAdapter.pickNextRoundRobinAdmin(
          ["ops_admin_01", "ops_admin_02"],
          roundRobinCursor
        );
        roundRobinCursor = rr.nextIndex;

        const nowIso = new Date().toISOString();
        const ticketRef = `TKT-WA-${Date.now().toString(36).toUpperCase()}-${crypto
          .randomBytes(2)
          .toString("hex")
          .toUpperCase()}`;

        const ticket: EnquiryTicket = {
          ticketRef,
          listingId: hint.detectedListingId,
          listingTitle: hint.needsManualLookup
            ? "Unlinked enquiry (manual lookup required)"
            : hint.detectedListingId,
          customerContact: senderPhone,
          customerName: senderName,
          assignedAdminUid: rr.adminUid ?? "ops_admin_01",
          status: "open",
          lastMessageText: bodyText.slice(0, 500),
          internalNotes: hint.needsManualLookup
            ? "Customer edited or omitted prefilled listing context; use manual ticket lookup."
            : "",
          messages: [
            {
              messageId: `MSG-${crypto.randomBytes(4).toString("hex")}`,
              providerMessageId: providerMsgId,
              sender: "customer",
              senderName,
              body: bodyText.slice(0, 2000),
              atIso: nowIso,
            },
          ],
          providerMessageIds: [providerMsgId],
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await repos.tickets.saveTicket(ticket);
        createdTicketRefs.push(ticketRef);
      }
    }
  }

  logInfo("whatsapp.webhook.processed", {
    createdCount: createdTicketRefs.length,
    duplicatesIgnored,
  });

  return NextResponse.json({
    received: true,
    createdTicketRefs,
    duplicatesIgnored,
  });
}
