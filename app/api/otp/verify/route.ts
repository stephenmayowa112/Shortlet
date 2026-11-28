import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { otpService } from "@/lib/adapters/otp-provider";
import { extractClientIp, getRateLimiter } from "@/lib/security/rate-limit";
import { buildSessionSetCookieHeader, createServerSession } from "@/lib/security/session";

const VerifySchema = z.object({
  challengeId: z.string().min(6).max(120),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
  contact: z.string().min(5).max(254).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req.headers);
    const limit = getRateLimiter().check(`otp_verify:${ip}`, 15, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts from this network. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

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

    // Issue short-lived signed server session in HttpOnly, Secure, SameSite=None, Partitioned cookie
    const serverSess = createServerSession({
      uid: `otp_${outcome.session.contact}`,
      role: outcome.session.purpose === "partner_verification" ? "partner" : "customer",
      verifiedContact: outcome.session.contact,
      mfaVerified: false,
      ttlMs: 2 * 60 * 60 * 1000, // 2 hours
    });

    const response = NextResponse.json({
      verified: true,
      session: {
        contact: outcome.session.contact,
        purpose: outcome.session.purpose,
        verifiedAtIso: outcome.session.verifiedAtIso,
        expiresAtIso: outcome.session.expiresAtIso,
      },
    });

    response.headers.set("Set-Cookie", buildSessionSetCookieHeader(serverSess.token, 7200));
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OTP verification failed." },
      { status: 500 }
    );
  }
}
