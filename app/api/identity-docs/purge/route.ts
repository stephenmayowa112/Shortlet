import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredIdentityDocs } from "@/lib/adapters/identity-doc-storage";
import { requireSuperAdminWithMfa } from "@/lib/security/session";

function verifyCronSecret(req: NextRequest): boolean {
  const configured =
    process.env.RECONCILIATION_CRON_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "dev_reconciliation_cron_secret_local" : "");
  if (!configured) return false;
  const auth = req.headers.get("authorization");
  const supplied =
    req.headers.get("x-cron-secret")?.trim() ??
    (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (!supplied) return false;
  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let actorUid = "system_retention_job";
  if (!verifyCronSecret(req)) {
    const guard = await requireSuperAdminWithMfa(req.headers);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
    }
    actorUid = guard.session.uid;
  }

  const body = (await req.json().catch(() => ({}))) as { nowIso?: string };
  const result = await purgeExpiredIdentityDocs(actorUid, body.nowIso);
  return NextResponse.json(result);
}
