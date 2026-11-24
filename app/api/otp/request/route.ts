import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { otpService } from "@/lib/adapters/otp-provider";

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

    const result = otpService.requestOtp(parsed.data);
    return NextResponse.json({
      challengeId: result.challengeId,
      expiresAtIso: result.expiresAtIso,
      // Sandbox preview code shown for offline testing; production delivers via SMS/email adapter
      sandboxPreviewCode: result.sandboxPreviewCode,
      channelNotice:
        parsed.data.purpose === "partner_verification"
          ? "One-time code proves control of this channel only, not identity or authority to list."
          : "One-time code expires in 5 minutes and can only be used once.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not issue OTP." },
      { status: 429 }
    );
  }
}
