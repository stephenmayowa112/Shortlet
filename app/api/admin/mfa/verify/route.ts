import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import { verifyTotpCode } from "@/lib/security/mfa";
import { extractClientIp, getRateLimiter } from "@/lib/security/rate-limit";
import {
  authenticateSession,
  extractSessionTokenFromRequest,
  markSessionMfaVerified,
} from "@/lib/security/session";

const MfaVerifySchema = z.object({
  totpCode: z.string().regex(/^\d{6}$/, "Enter the 6-digit authenticator code."),
});

export async function POST(req: NextRequest) {
  const ip = extractClientIp(req.headers);
  const rate = getRateLimiter().check(`mfa_verify:${ip}`, 5, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many MFA attempts. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const token = extractSessionTokenFromRequest(req.headers);
  const auth = await authenticateSession(token);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Authentication required.", code: auth.code },
      { status: auth.code === "ACCOUNT_SUSPENDED" ? 403 : 401 }
    );
  }

  if (auth.session.role !== "super_admin") {
    return NextResponse.json(
      { error: "MFA verification endpoint is for Super Admin accounts." },
      { status: 403 }
    );
  }

  const parsed = MfaVerifySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid 6-digit TOTP code." },
      { status: 400 }
    );
  }

  const repos = getRepositories();
  const user = await repos.users.getUser(auth.session.uid);
  if (!user || user.status !== "active" || !user.totpSecretBase32) {
    return NextResponse.json(
      { error: "Super Admin MFA secret is not enrolled or account is inactive." },
      { status: 403 }
    );
  }

  const valid = verifyTotpCode(user.totpSecretBase32, parsed.data.totpCode);
  if (!valid) {
    await repos.audit.append({
      actorUid: auth.session.uid,
      actorRole: "super_admin",
      action: "SUPER_ADMIN_MFA_FAILED",
      targetType: "user",
      targetId: auth.session.uid,
      reason: "Invalid TOTP authenticator code supplied.",
    });
    return NextResponse.json({ error: "Invalid authenticator code." }, { status: 401 });
  }

  const updated = markSessionMfaVerified(token!);
  if (!updated) {
    return NextResponse.json({ error: "Session could not be upgraded." }, { status: 401 });
  }

  await repos.audit.append({
    actorUid: auth.session.uid,
    actorRole: "super_admin",
    action: "SUPER_ADMIN_MFA_VERIFIED",
    targetType: "user",
    targetId: auth.session.uid,
    reason: "Super Admin TOTP second factor verified.",
  });

  return NextResponse.json({
    mfaVerified: true,
    uid: updated.uid,
    role: updated.role,
  });
}
