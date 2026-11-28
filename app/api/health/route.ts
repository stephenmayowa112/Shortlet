import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateProductionReadiness } from "@/lib/config/env";
import { requireSuperAdminWithMfa } from "@/lib/security/session";

function verifyCronSecret(req: NextRequest): boolean {
  const configured = process.env.RECONCILIATION_CRON_SECRET?.trim() ?? "";
  if (!configured || configured.includes("replace_with")) return false;
  const auth = req.headers.get("authorization");
  const supplied =
    req.headers.get("x-cron-secret")?.trim() ??
    (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (!supplied) return false;
  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Production Liveness & Readiness Probe (`GET /api/health`).
 * - Default public response returns minimal non-sensitive liveness status for load balancers.
 * - `?detailed=true` requires either MFA-verified Super Admin session or valid cron secret
 *   and returns boolean readiness flags (never exposes actual secrets).
 */
export async function GET(req: NextRequest) {
  const wantDetailed = req.nextUrl.searchParams.get("detailed") === "true";

  if (!wantDetailed) {
    return NextResponse.json(
      {
        status: "ok",
        service: "shortlet-connect-v1",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const authorizedByCron = verifyCronSecret(req);
  if (!authorizedByCron) {
    const superAdmin = await requireSuperAdminWithMfa(req.headers);
    if (!superAdmin.ok) {
      return NextResponse.json(
        { error: "Detailed readiness diagnostics require Super Admin MFA or cron secret." },
        { status: superAdmin.status }
      );
    }
  }

  const report = validateProductionReadiness();
  return NextResponse.json(
    {
      status: report.readyForLiveMoney ? "ready" : "degraded_missing_config",
      service: "shortlet-connect-v1",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      ...report,
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
