import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { storeEncryptedIdentityDoc } from "@/lib/adapters/identity-doc-storage";
import { extractClientIp, getRateLimiter } from "@/lib/security/rate-limit";
import {
  authenticateSession,
  extractSessionTokenFromRequest,
  verifyMutationOrigin,
} from "@/lib/security/session";

const UploadSchema = z.object({
  idType: z.enum(["nin_slip", "international_passport", "drivers_licence", "pvc"]),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  base64Content: z.string().min(8),
  retentionDaysOverride: z.number().int().min(1).max(1825).optional(),
});

export async function POST(req: NextRequest) {
  if (!verifyMutationOrigin(req.headers)) {
    return NextResponse.json({ error: "Cross-origin upload rejected." }, { status: 403 });
  }

  const ip = extractClientIp(req.headers);
  const limit = getRateLimiter().check(`id_doc_upload:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many document uploads. Please wait a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const token = extractSessionTokenFromRequest(req.headers);
  const auth = await authenticateSession(token);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Active partner or staff authentication required.", code: auth.code },
      { status: auth.code === "ACCOUNT_SUSPENDED" ? 403 : 401 }
    );
  }

  const parsed = UploadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid identity document payload." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(parsed.data.base64Content, "base64");
    const metadata = await storeEncryptedIdentityDoc({
      partnerUid: auth.session.uid,
      idType: parsed.data.idType,
      mimeType: parsed.data.mimeType,
      buffer,
      retentionDaysOverride: parsed.data.retentionDaysOverride,
    });

    // Never return a public URL or storage path
    return NextResponse.json({
      storedPrivately: true,
      encryptedAtRest: "AES-256-GCM",
      docId: metadata.docId,
      retainUntilIso: metadata.retainUntilIso,
      byteSize: metadata.byteSize,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not store identity document." },
      { status: 400 }
    );
  }
}
