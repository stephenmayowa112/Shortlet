import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { otpService } from "@/lib/adapters/otp-provider";

const VerifySchema = z.object({
  challengeId: z.string().min(6).max(120),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = VerifySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid verification input." },
        { status: 400 }
      );
    }

    const outcome = otpService.verifyOtp(parsed.data);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: 401 });
    }

    return NextResponse.json({
      verified: true,
      session: outcome.session,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OTP verification failed." },
      { status: 500 }
    );
  }
}
