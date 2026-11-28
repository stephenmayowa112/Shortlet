import { logInfo, logWarn } from "@/lib/security/logger";

export interface OtpDeliveryResult {
  delivered: boolean;
  provider: "termii" | "resend" | "sandbox";
  error?: string;
}

const TERMII_SMS_ENDPOINT = "https://v3.api.termii.com/api/sms/send";
const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

/**
 * Dispatches one-time verification codes via configured production adapters:
 * - SMS: Termii Nigeria DND transactional route (`TERMII_API_KEY`)
 * - Email: Resend transactional API (`RESEND_API_KEY`)
 *
 * In non-production without keys, safely runs in sandbox mode.
 * In production without keys, fails closed (`delivered: false`) so codes are never silently dropped.
 */
export async function deliverOtpCode(params: {
  contact: string;
  channel: "sms" | "email";
  code: string;
  purpose: "customer_bookings" | "partner_verification";
}): Promise<OtpDeliveryResult> {
  const purposeText =
    params.purpose === "partner_verification"
      ? "verify control of your partner contact channel on Shortlet Connect"
      : "view your Shortlet Connect bookings and receipts";

  if (params.channel === "sms") {
    const apiKey = process.env.TERMII_API_KEY?.trim();
    if (apiKey && !apiKey.includes("replace_with")) {
      const senderId = process.env.TERMII_SENDER_ID?.trim() || "ShortletCon";
      try {
        const res = await fetch(TERMII_SMS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: params.contact.replace(/[^\d+]/g, ""),
            from: senderId,
            sms: `Your Shortlet Connect verification code is ${params.code}. It expires in 5 minutes and is single-use. Never share this code.`,
            type: "plain",
            channel: "dnd",
            api_key: apiKey,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          logWarn("otp.delivery.termii_failed", { status: res.status });
          return { delivered: false, provider: "termii", error: "SMS gateway delivery failed." };
        }
        logInfo("otp.delivery.termii_sent", { channel: "sms" });
        return { delivered: true, provider: "termii" };
      } catch {
        logWarn("otp.delivery.termii_network_error");
        return { delivered: false, provider: "termii", error: "SMS gateway unreachable." };
      }
    }
  } else {
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey && !resendKey.includes("replace_with")) {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL?.trim() || "Shortlet Connect <no-reply@shortletconnect.ng>";
      try {
        const res = await fetch(RESEND_EMAIL_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [params.contact],
            subject: "Your Shortlet Connect verification code",
            text: `Use verification code ${params.code} to ${purposeText}. This code expires in 5 minutes and can only be used once. If you did not request this, you can safely ignore this email.`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          logWarn("otp.delivery.resend_failed", { status: res.status });
          return { delivered: false, provider: "resend", error: "Email gateway delivery failed." };
        }
        logInfo("otp.delivery.resend_sent", { channel: "email" });
        return { delivered: true, provider: "resend" };
      } catch {
        logWarn("otp.delivery.resend_network_error");
        return { delivered: false, provider: "resend", error: "Email gateway unreachable." };
      }
    }
  }

  // Fail closed in production when real OTP provider credentials are missing
  if (process.env.NODE_ENV === "production") {
    logWarn("otp.delivery.unconfigured_in_production", { channel: params.channel });
    return {
      delivered: false,
      provider: "sandbox",
      error: `OTP ${params.channel.toUpperCase()} delivery provider is not configured for production.`,
    };
  }

  return { delivered: true, provider: "sandbox" };
}
