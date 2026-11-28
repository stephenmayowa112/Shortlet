import type { StaffFinancialBreakdown } from "@/lib/domain/pricing";
import type {
  ImmutableLedgerRecord,
  LedgerRepository,
} from "@/lib/repositories/types";

export interface LedgerPostSummary {
  bookingRef: string;
  entries: ImmutableLedgerRecord[];
  allocationsSumKobo: number;
  serviceChargeGrossKobo: number;
}

/**
 * Posts the complete separated integer-kobo ledger entries for a server-verified paid booking (Task 4 #4):
 * - rental_principal
 * - service_charge_gross
 * - coordinating_admin_allocation (₦10k/unit)
 * - founder_allocation (₦10k/unit)
 * - ads_ops_allocation (₦10k/unit)
 * - caution_deposit_liability (recorded strictly as liability, NEVER revenue)
 *
 * Enforces invariant:
 *   coordinating_admin_allocation + founder_allocation + ads_ops_allocation === service_charge_gross
 */
export async function postVerifiedBookingLedgerEntries(
  ledgerRepo: LedgerRepository,
  params: {
    bookingRef: string;
    quote: StaffFinancialBreakdown;
    paystackReference: string;
    coordinatingAdminUid?: string;
    nowIso?: string;
  }
): Promise<LedgerPostSummary> {
  const { quote, bookingRef, paystackReference, coordinatingAdminUid, nowIso } = params;
  const { internalAllocations } = quote;

  const allocationsSumKobo =
    internalAllocations.coordinatingAdminKobo +
    internalAllocations.founderKobo +
    internalAllocations.adsAndOpsKobo;

  if (allocationsSumKobo !== quote.serviceChargeKobo) {
    throw new Error(
      `Ledger invariant violated: allocations (${allocationsSumKobo}) !== serviceChargeGross (${quote.serviceChargeKobo})`
    );
  }

  const entries: ImmutableLedgerRecord[] = [];

  entries.push(
    await ledgerRepo.appendEntry({
      bookingRef,
      category: "rental_principal",
      amountKobo: quote.rentalPrincipalKobo,
      currency: "NGN",
      settlementStatus: "collected",
      paystackReference,
      notes: "Rental principal collected via server-verified Paystack payment",
      createdAt: nowIso,
    })
  );

  entries.push(
    await ledgerRepo.appendEntry({
      bookingRef,
      category: "service_charge_gross",
      amountKobo: quote.serviceChargeKobo,
      currency: "NGN",
      settlementStatus: "collected",
      paystackReference,
      notes: `Shortlet Connect service charge gross (${quote.chargeableUnits} unit(s))`,
      createdAt: nowIso,
    })
  );

  entries.push(
    await ledgerRepo.appendEntry({
      bookingRef,
      category: "coordinating_admin_allocation",
      amountKobo: internalAllocations.coordinatingAdminKobo,
      currency: "NGN",
      settlementStatus: "payable",
      coordinatingAdminUid,
      paystackReference,
      notes: "Internal allocation: coordinating admin (₦10,000/unit)",
      createdAt: nowIso,
    })
  );

  entries.push(
    await ledgerRepo.appendEntry({
      bookingRef,
      category: "founder_allocation",
      amountKobo: internalAllocations.founderKobo,
      currency: "NGN",
      settlementStatus: "collected",
      paystackReference,
      notes: "Internal allocation: founder (₦10,000/unit)",
      createdAt: nowIso,
    })
  );

  entries.push(
    await ledgerRepo.appendEntry({
      bookingRef,
      category: "ads_ops_allocation",
      amountKobo: internalAllocations.adsAndOpsKobo,
      currency: "NGN",
      settlementStatus: "collected",
      paystackReference,
      notes: "Internal allocation: ads & operations (₦10,000/unit)",
      createdAt: nowIso,
    })
  );

  if (quote.cautionFeeKobo > 0) {
    entries.push(
      await ledgerRepo.appendEntry({
        bookingRef,
        category: "caution_deposit_liability",
        amountKobo: quote.cautionFeeKobo,
        currency: "NGN",
        settlementStatus: "collected",
        paystackReference,
        notes: "Refundable caution deposit held strictly as liability (not platform revenue)",
        createdAt: nowIso,
      })
    );
  }

  return {
    bookingRef,
    entries,
    allocationsSumKobo,
    serviceChargeGrossKobo: quote.serviceChargeKobo,
  };
}

/**
 * Records an audited caution deposit refund payout with mandatory approver and transaction reference (Task 7).
 */
export async function postCautionRefundPayout(
  ledgerRepo: LedgerRepository,
  params: {
    bookingRef: string;
    refundAmountKobo: number;
    approverUid: string;
    refundTransactionRef: string;
    reason: string;
    nowIso?: string;
  }
): Promise<ImmutableLedgerRecord> {
  if (!Number.isInteger(params.refundAmountKobo) || params.refundAmountKobo <= 0) {
    throw new Error("Refund amount must be a positive integer in kobo.");
  }
  if (!params.approverUid.trim() || !params.refundTransactionRef.trim()) {
    throw new Error("Caution refund requires both an approverUid and a traceable transaction reference.");
  }
  return ledgerRepo.appendEntry({
    bookingRef: params.bookingRef,
    category: "caution_refund_payout",
    amountKobo: params.refundAmountKobo,
    currency: "NGN",
    settlementStatus: "paid",
    paystackReference: params.refundTransactionRef.trim(),
    notes: `Approved by ${params.approverUid.trim()}: ${params.reason.trim()}`,
    createdAt: params.nowIso,
  });
}
