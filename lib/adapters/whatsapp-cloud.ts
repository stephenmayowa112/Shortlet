import crypto from "node:crypto";

/**
 * Verifies Meta WhatsApp Cloud API `X-Hub-Signature-256` HMAC-SHA256 header over raw body
 * using constant-time comparison. Server-only (uses `node:crypto`).
 */
export function verifyMetaWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const trimmed = signatureHeader.trim();
  if (!trimmed.startsWith("sha256=")) return false;
  const suppliedHex = trimmed.slice("sha256=".length).toLowerCase();
  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(suppliedHex, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Sends a text reply through Meta WhatsApp Cloud API when configured
 * (must only be called within the active 24-hour customer service window).
 */
export async function sendWhatsAppCloudReply(params: {
  toPhoneDigits: string;
  bodyText: string;
}): Promise<{ sent: boolean; provider: "meta_cloud" | "sandbox"; messageId?: string }> {
  const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId || token.includes("replace_with")) {
    return { sent: false, provider: "sandbox" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.toPhoneDigits.replace(/\D/g, ""),
        type: "text",
        text: { body: params.bodyText.slice(0, 4096) },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    return { sent: false, provider: "meta_cloud" };
  }
  const json = (await res.json()) as { messages?: Array<{ id?: string }> };
  return {
    sent: true,
    provider: "meta_cloud",
    messageId: json.messages?.[0]?.id,
  };
}
