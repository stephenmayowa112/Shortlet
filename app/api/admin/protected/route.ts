import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminWithMfa } from "@/lib/security/session";
import { getRepositories } from "@/lib/repositories";

/**
 * Protected Super Admin governance route (Task 5 #4 & #5).
 * Strictly rejects any session lacking Super Admin role, verified TOTP MFA, or active status.
 */
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdminWithMfa(req.headers);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  const repos = getRepositories();
  const config = await repos.config.getConfig();
  return NextResponse.json({
    authorized: true,
    superAdminUid: guard.session.uid,
    mfaVerified: guard.session.mfaVerified,
    config,
  });
}
