import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { otpService } from "@/lib/adapters/otp-provider";
import { deliverOtpCode } from "@/lib/adapters/otp-delivery";
import { extractClientIp } from "@/lib/security/rate-limit";

const RequestSchema = z.object({
  contact: z.string().min(5).max(254),
  channel: z.enum(["email", "sms"]),
  purpose: z.enum(["customer_bookings", "partner_verification"]),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email address or phone number." },
        { status: 400 }
      );
    }

    const clientIp = extractClientIp(req.headers);
    const result = otpService.requestOtp({
      ...parsed.data,
      clientIp,
    });

    const delivery = await deliverOtpCode({
      contact: parsed.data.contact,
      channel: parsed.data.channel,
      code: result.sandboxPreviewCode,
      purpose: parsed.data.purpose,
    });

    if (!delivery.delivered) {
      return NextResponse.json(
        {
          error:
            delivery.error ??
            "Verification delivery service is temporarily unavailable. Please try again later.",
        },
        { status: 503 }
      );
    }

    // Non-enumerating response: identical structure whether contact has existing bookings/accounts or not
    const responseBody: Record<string, unknown> = {
      challengeId: result.challengeId,
      expiresAtIso: result.expiresAtIso,
      deliveryProvider: delivery.provider,
      message: "If this contact is eligible, a 6-digit verification code has been issued.",
      channelNotice:
        parsed.data.purpose === "partner_verification"
          ? "One-time code proves control of this channel only, not identity or authority to list."
          : "One-time code expires in 5 minutes and can only be used once.",
    };

    // Never expose preview code in production or when delivered through a real gateway
    if (process.env.NODE_ENV !== "production" && delivery.provider === "sandbox") {
      responseBody.sandboxPreviewCode = result.sandboxPreviewCode;
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not issue OTP." },
      { status: 429 }
    );
  }
}
