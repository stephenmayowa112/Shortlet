import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActivePaymentProvider } from "@/lib/adapters/payment-provider";
import { getRepositories } from "@/lib/repositories";
import { requireSuperAdminWithMfa } from "@/lib/security/session";

interface ReconciliationMismatch {
  type: "missing_in_ledger" | "missing_in_gateway" | "amount_mismatch" | "gateway_failed";
  paystackReference: string;
  bookingRef: string;
  gatewayAmountKobo?: number;
  ledgerGrossCollectedKobo?: number;
  detail: string;
}

interface DailyReconciliationReport {
  triggeredBy: "scheduled_cron" | "super_admin_manual";
  checkedGatewayCount: number;
  checkedLedgerRefsCount: number;
  matchedCount: number;
  mismatches: ReconciliationMismatch[];
  reconciledAtIso: string;
}

function verifyCronSecret(req: NextRequest): boolean {
  const configured =
    process.env.RECONCILIATION_CRON_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "dev_reconciliation_cron_secret_local" : "");
  if (!configured) return false;

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? bearer;
  if (!headerSecret) return false;

  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(headerSecret, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Compares Paystack gateway transactions against append-only LedgerRepository gross collections
 * (rental_principal + service_charge_gross + caution_deposit_liability + reversals) per reference.
 */
async function executeDailyReconciliation(
  triggeredBy: "scheduled_cron" | "super_admin_manual",
  actorUid: string
): Promise<DailyReconciliationReport> {
  const repos = getRepositories();
  const gatewayTxs = await getActivePaymentProvider().listGatewayTransactions();
  const ledgerEntries = await repos.ledger.listAll();

  // Sum gross collected cash per paystackReference from ledger
  const ledgerCashByRef = new Map<string, { bookingRef: string; totalKobo: number }>();
  for (const entry of ledgerEntries) {
    if (!entry.paystackReference) continue;
    // Gross cash collected consists of principal + service_charge_gross + caution_deposit_liability
    // (allocations are sub-splits of service_charge_gross and must not be double-counted)
    if (
      entry.category === "rental_principal" ||
      entry.category === "service_charge_gross" ||
      entry.category === "caution_deposit_liability"
    ) {
      const current = ledgerCashByRef.get(entry.paystackReference) ?? {
        bookingRef: entry.bookingRef,
        totalKobo: 0,
      };
      current.totalKobo += entry.amountKobo;
      ledgerCashByRef.set(entry.paystackReference, current);
    }
  }

  const mismatches: ReconciliationMismatch[] = [];
  const seenRefs = new Set<string>();
  let matchedCount = 0;

  for (const tx of gatewayTxs) {
    seenRefs.add(tx.reference);
    const ledgerSum = ledgerCashByRef.get(tx.reference);
    const paidKobo = tx.paidAmountKobo ?? tx.amountKobo;

    if (tx.status === "failed") {
      mismatches.push({
        type: "gateway_failed",
        paystackReference: tx.reference,
        bookingRef: tx.bookingRef,
        gatewayAmountKobo: paidKobo,
        ledgerGrossCollectedKobo: ledgerSum?.totalKobo ?? 0,
        detail: `Gateway transaction ${tx.reference} failed on Paystack.`,
      });
      continue;
    }

    if (tx.status !== "success") continue;

    if (!ledgerSum) {
      mismatches.push({
        type: "missing_in_ledger",
        paystackReference: tx.reference,
        bookingRef: tx.bookingRef,
        gatewayAmountKobo: paidKobo,
        ledgerGrossCollectedKobo: 0,
        detail: `Settled gateway transaction ${tx.reference} (${paidKobo} kobo) has no matching ledger entries.`,
      });
      continue;
    }

    if (ledgerSum.totalKobo !== paidKobo) {
      mismatches.push({
        type: "amount_mismatch",
        paystackReference: tx.reference,
        bookingRef: tx.bookingRef,
        gatewayAmountKobo: paidKobo,
        ledgerGrossCollectedKobo: ledgerSum.totalKobo,
        detail: `Gateway paid ${paidKobo} kobo != ledger gross ${ledgerSum.totalKobo} kobo for ${tx.reference}.`,
      });
      continue;
    }

    matchedCount++;
  }

  // Detect any ledger reference not found in gateway transactions
  for (const [ref, info] of ledgerCashByRef.entries()) {
    if (!seenRefs.has(ref)) {
      mismatches.push({
        type: "missing_in_gateway",
        paystackReference: ref,
        bookingRef: info.bookingRef,
        gatewayAmountKobo: 0,
        ledgerGrossCollectedKobo: info.totalKobo,
        detail: `Ledger records ${info.totalKobo} kobo for ${ref}, which was not found in Paystack gateway records.`,
      });
    }
  }

  const reconciledAtIso = new Date().toISOString();

  await repos.audit.append({
    actorUid,
    actorRole: triggeredBy === "scheduled_cron" ? "system" : "super_admin",
    action: "DAILY_RECONCILIATION_EXECUTED",
    targetType: "ledger",
    targetId: `RECON-${reconciledAtIso.slice(0, 10)}`,
    reason: `Daily reconciliation (${triggeredBy}): matched=${matchedCount}, mismatches=${mismatches.length}`,
    afterSummary: `checkedGateway=${gatewayTxs.length}, mismatches=${mismatches.length}`,
  });

  return {
    triggeredBy,
    checkedGatewayCount: gatewayTxs.length,
    checkedLedgerRefsCount: ledgerCashByRef.size,
    matchedCount,
    mismatches,
    reconciledAtIso,
  };
}

async function handleReconciliationRequest(req: NextRequest) {
  if (verifyCronSecret(req)) {
    const report = await executeDailyReconciliation("scheduled_cron", "system_cron");
    return NextResponse.json(report);
  }

  // Manual trigger fallback restricted strictly to Super Admin with MFA
  const superAdmin = await requireSuperAdminWithMfa(req.headers);
  if (!superAdmin.ok) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Provide a valid cron secret header or an MFA-verified Super Admin session.",
        code: superAdmin.code,
      },
      { status: superAdmin.status }
    );
  }

  const report = await executeDailyReconciliation("super_admin_manual", superAdmin.session.uid);
  return NextResponse.json(report);
}

export async function POST(req: NextRequest) {
  return handleReconciliationRequest(req);
}

export async function GET(req: NextRequest) {
  return handleReconciliationRequest(req);
}
