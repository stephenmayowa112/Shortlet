import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { paystackAdapter } from "../lib/adapters/payment-provider";
import { getRepositories, resetRepositoriesForTests } from "../lib/repositories";
import { calculateCustomerQuote, calculateStaffQuote } from "../lib/domain/pricing";
import { postVerifiedBookingLedgerEntries, postCautionRefundPayout } from "../lib/domain/ledger";
import { POST as holdPost } from "../app/api/bookings/hold/route";
import { POST as initPost } from "../app/api/paystack/initialize/route";
import { GET as callbackGet } from "../app/api/paystack/callback/route";
import { POST as webhookPost, GET as webhookGet } from "../app/api/paystack/webhook/route";
import { POST as reconPost } from "../app/api/reconciliation/daily/route";
import { createServerSession } from "../lib/security/session";

function makeJsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeRawWebhookReq(rawBody: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-paystack-signature"] = signature;
  return new NextRequest("http://localhost:3000/api/paystack/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

async function runTests() {
  resetRepositoriesForTests();
  paystackAdapter.resetForTests();

  // -------------------------------------------------------------------------
  // 1. Re-verify all 7 PRD pricing examples (Task 4 #5)
  // -------------------------------------------------------------------------
  const ex1 = calculateStaffQuote({
    category: "apartment",
    quantity: 3,
    unitRateKobo: 15_000_000,
    cautionFeeKobo: 5_000_000,
  });
  assert.equal(ex1.serviceChargeKobo, 9_000_000, "3 apt nights -> ₦90,000 service charge");
  assert.equal(ex1.internalAllocations.coordinatingAdminKobo, 3_000_000);
  assert.equal(ex1.internalAllocations.founderKobo, 3_000_000);
  assert.equal(ex1.internalAllocations.adsAndOpsKobo, 3_000_000);

  const ex2 = calculateStaffQuote({
    category: "car",
    quantity: 3,
    carUnitMode: "days",
    unitRateKobo: 12_000_000,
  });
  assert.equal(ex2.serviceChargeKobo, 9_000_000, "3 car days -> ₦90,000 service charge");

  const ex3 = calculateStaffQuote({ category: "boat", quantity: 3, unitRateKobo: 20_000_000 });
  assert.equal(ex3.serviceChargeKobo, 6_000_000, "3 boat hours -> ceil(3/2)=2 units -> ₦60,000");

  const ex4 = calculateStaffQuote({ category: "boat", quantity: 4, unitRateKobo: 20_000_000 });
  assert.equal(ex4.serviceChargeKobo, 6_000_000, "4 boat hours -> ceil(4/2)=2 units -> ₦60,000");

  const ex5 = calculateStaffQuote({ category: "boat", quantity: 5, unitRateKobo: 20_000_000 });
  assert.equal(ex5.serviceChargeKobo, 9_000_000, "5 boat hours -> ceil(5/2)=3 units -> ₦90,000");

  const ex6 = calculateStaffQuote({
    category: "car",
    quantity: 12,
    carUnitMode: "hours",
    unitRateKobo: 2_000_000,
  });
  assert.equal(ex6.serviceChargeKobo, 3_000_000, "12-hour car -> 1 unit -> ₦30,000");

  const ex7 = calculateStaffQuote({
    category: "car",
    quantity: 24,
    carUnitMode: "hours",
    unitRateKobo: 2_000_000,
  });
  assert.equal(ex7.serviceChargeKobo, 3_000_000, "24-hour car -> 1 unit -> ₦30,000");

  // Customer quote never exposes internal allocations
  const custQuote = calculateCustomerQuote({
    category: "apartment",
    quantity: 3,
    unitRateKobo: 15_000_000,
    cautionFeeKobo: 5_000_000,
  });
  assert.equal("internalAllocations" in custQuote, false);
  console.log("PASS [unit]: All 7 required PRD pricing examples verified (integer kobo)");

  // -------------------------------------------------------------------------
  // 2. End-to-end signed Paystack webhook harness + browser redirect proof
  // -------------------------------------------------------------------------
  const holdRes = await holdPost(
    makeJsonReq("http://localhost:3000/api/bookings/hold", {
      listingId: "LST-APT-100",
      listingTitle: "Lekki Waterfront Penthouse",
      category: "apartment",
      startIso: "2027-02-10T14:00:00.000Z",
      endIso: "2027-02-13T11:00:00.000Z",
      quantity: 3,
      unitRateKobo: 15_000_000,
      cautionFeeKobo: 5_000_000,
      bookingRef: "SC-BK-PAY-01",
      customerName: "Ada Customer",
      customerContact: "ada@example.com",
    })
  );
  assert.equal(holdRes.status, 200);
  const holdData = (await holdRes.json()) as { quote: { customerTotalKobo: number } };
  // 3 * 150k + 90k service + 50k caution = 590k = 59_000_000 kobo
  assert.equal(holdData.quote.customerTotalKobo, 59_000_000);

  // Client attempts to tamper amountKobo down to 100 kobo on initialize -> server MUST use stored quote!
  const initRes = await initPost(
    makeJsonReq("http://localhost:3000/api/paystack/initialize", {
      bookingRef: "SC-BK-PAY-01",
      customerEmail: "ada@example.com",
      amountKobo: 100, // tampered!
    })
  );
  assert.equal(initRes.status, 200);
  const initData = (await initRes.json()) as { reference: string; amountKobo: number };
  assert.equal(initData.amountKobo, 59_000_000, "Server stored quote MUST override client amount");

  // Browser redirect callback MUST NOT confirm booking (Task 4 #2)
  const cbRes = await callbackGet(
    new NextRequest(
      `http://localhost:3000/api/paystack/callback?reference=${encodeURIComponent(initData.reference)}`
    )
  );
  assert.equal(cbRes.status, 200);
  const cbJson = (await cbRes.json()) as { confirmed: boolean; bookingStatus: string };
  assert.equal(cbJson.confirmed, false, "Browser redirect MUST NOT confirm booking");
  assert.equal(cbJson.bookingStatus, "awaiting_payment");
  const bookingAfterRedirect = await getRepositories().bookings.getBooking("SC-BK-PAY-01");
  assert.equal(bookingAfterRedirect?.status, "awaiting_payment");
  console.log("PASS [integration:signed-harness]: Browser redirect never confirms booking & client amount tamper ignored");

  // Tampered payload / bad signature MUST be rejected with 401
  const validRawPayload = JSON.stringify({
    event: "charge.success",
    data: {
      reference: initData.reference,
      amount: 59_000_000,
      currency: "NGN",
      status: "success",
      metadata: { bookingRef: "SC-BK-PAY-01" },
      paid_at: "2027-02-01T10:00:00.000Z",
    },
  });
  const validSig = paystackAdapter.signPayload(validRawPayload);
  const tamperedBody = validRawPayload.replace("59000000", "59000001");
  const tamperedRes = await webhookPost(makeRawWebhookReq(tamperedBody, validSig));
  assert.equal(tamperedRes.status, 401, "Tampered payload must fail HMAC-SHA512 check");

  // Valid signed webhook confirms booking and posts separated integer-kobo ledger entries
  const okWebhookRes = await webhookPost(makeRawWebhookReq(validRawPayload, validSig));
  assert.equal(okWebhookRes.status, 200);
  const okWebhookJson = (await okWebhookRes.json()) as { verified: boolean; outcome: string };
  assert.equal(okWebhookJson.verified, true);
  assert.equal(okWebhookJson.outcome, "confirmed");

  const confirmedBooking = await getRepositories().bookings.getBooking("SC-BK-PAY-01");
  assert.equal(confirmedBooking?.status, "confirmed");
  assert.equal(confirmedBooking?.paymentVerified, true);

  const ledgerBeforeReplay = await getRepositories().ledger.listByBookingRef("SC-BK-PAY-01");
  assert.equal(ledgerBeforeReplay.length, 6, "Expected 6 separated ledger rows");

  // Idempotent replay of exact same webhook MUST change nothing
  const replayRes = await webhookPost(makeRawWebhookReq(validRawPayload, validSig));
  assert.equal(replayRes.status, 200);
  const replayJson = (await replayRes.json()) as { idempotentDuplicate: boolean };
  assert.equal(replayJson.idempotentDuplicate, true);
  const ledgerAfterReplay = await getRepositories().ledger.listByBookingRef("SC-BK-PAY-01");
  assert.equal(ledgerAfterReplay.length, 6, "Replayed webhook MUST NOT duplicate ledger entries");
  console.log("PASS [integration:signed-harness]: HMAC-SHA512 tampered rejected, valid confirmed, replay idempotent");

  // -------------------------------------------------------------------------
  // 3. Underpayment, overpayment, failed payment & 1:1 reference binding
  // -------------------------------------------------------------------------
  async function createHoldAndInit(ref: string, start: string, end: string) {
    await holdPost(
      makeJsonReq("http://localhost:3000/api/bookings/hold", {
        listingId: "LST-APT-200",
        category: "apartment",
        startIso: start,
        endIso: end,
        quantity: 1,
        unitRateKobo: 10_000_000,
        cautionFeeKobo: 2_000_000,
        bookingRef: ref,
      })
    );
    const res = await initPost(
      makeJsonReq("http://localhost:3000/api/paystack/initialize", {
        bookingRef: ref,
        customerEmail: "test@example.com",
      })
    );
    return (await res.json()) as { reference: string; amountKobo: number };
  }

  // Underpayment (expected 15,000,000 kobo, paid 14,999,999 kobo)
  const underInit = await createHoldAndInit(
    "SC-BK-UNDER",
    "2027-03-01T14:00:00.000Z",
    "2027-03-02T11:00:00.000Z"
  );
  const underPayload = JSON.stringify({
    event: "charge.success",
    data: {
      reference: underInit.reference,
      amount: underInit.amountKobo - 1,
      currency: "NGN",
      status: "success",
      metadata: { bookingRef: "SC-BK-UNDER" },
    },
  });
  const underRes = await webhookPost(
    makeRawWebhookReq(underPayload, paystackAdapter.signPayload(underPayload))
  );
  const underJson = (await underRes.json()) as { verified: boolean; outcome: string };
  assert.equal(underJson.verified, false);
  assert.equal(underJson.outcome, "underpaid_review");
  assert.equal((await getRepositories().bookings.getBooking("SC-BK-UNDER"))?.status, "refunded_disputed");

  // Overpayment (expected 15,000,000 kobo, paid 16,000,000 kobo)
  const overInit = await createHoldAndInit(
    "SC-BK-OVER",
    "2027-03-05T14:00:00.000Z",
    "2027-03-06T11:00:00.000Z"
  );
  const overPayload = JSON.stringify({
    event: "charge.success",
    data: {
      reference: overInit.reference,
      amount: overInit.amountKobo + 1_000_000,
      currency: "NGN",
      status: "success",
      metadata: { bookingRef: "SC-BK-OVER" },
    },
  });
  const overRes = await webhookPost(
    makeRawWebhookReq(overPayload, paystackAdapter.signPayload(overPayload))
  );
  const overJson = (await overRes.json()) as { verified: boolean; outcome: string };
  assert.equal(overJson.verified, false);
  assert.equal(overJson.outcome, "overpaid_review");

  // Failed payment
  const failInit = await createHoldAndInit(
    "SC-BK-FAIL",
    "2027-03-10T14:00:00.000Z",
    "2027-03-11T11:00:00.000Z"
  );
  const failPayload = JSON.stringify({
    event: "charge.failed",
    data: {
      reference: failInit.reference,
      amount: failInit.amountKobo,
      currency: "NGN",
      status: "failed",
      metadata: { bookingRef: "SC-BK-FAIL" },
    },
  });
  const failRes = await webhookPost(
    makeRawWebhookReq(failPayload, paystackAdapter.signPayload(failPayload))
  );
  const failJson = (await failRes.json()) as { verified: boolean; outcome: string };
  assert.equal(failJson.verified, false);
  assert.equal(failJson.outcome, "failed");
  assert.equal((await getRepositories().bookings.getBooking("SC-BK-FAIL"))?.status, "awaiting_payment");

  // 1:1 reference binding enforcement
  await assert.rejects(
    () =>
      getRepositories().payments.createOrBindPayment({
        paymentReference: initData.reference,
        bookingRef: "SC-BK-HIJACK",
        expectedAmountKobo: 59_000_000,
        currency: "NGN",
        status: "initialized",
        gatewayEventIds: [],
        createdAt: new Date().toISOString(),
      }),
    /already bound/
  );
  console.log("PASS [integration:signed-harness]: Underpayment, overpayment, failed payment & 1:1 reference binding verified");

  // -------------------------------------------------------------------------
  // 4. Ledger invariants (Task 4 #4): integer kobo, append-only + reversals, allocations sum
  // -------------------------------------------------------------------------
  const repos = getRepositories();
  await assert.rejects(
    () =>
      repos.ledger.appendEntry({
        bookingRef: "SC-BK-PAY-01",
        category: "rental_principal",
        amountKobo: 123.45, // float rejected!
        currency: "NGN",
        settlementStatus: "collected",
      }),
    /integer/
  );

  const ledgerRows = await repos.ledger.listByBookingRef("SC-BK-PAY-01");
  const gross = ledgerRows.find((r) => r.category === "service_charge_gross")!.amountKobo;
  const allocSum = ledgerRows
    .filter((r) =>
      ["coordinating_admin_allocation", "founder_allocation", "ads_ops_allocation"].includes(
        r.category
      )
    )
    .reduce((sum, r) => sum + r.amountKobo, 0);
  assert.equal(allocSum, gross, "Three ₦10k allocations MUST sum exactly to service_charge_gross");
  assert.ok(
    ledgerRows.some((r) => r.category === "caution_deposit_liability" && r.amountKobo === 5_000_000),
    "Caution deposit MUST be recorded separately as liability"
  );

  // Append-only correction via reversing entry
  const origEntry = ledgerRows[0];
  const reversal = await repos.ledger.appendReversal({
    reversesEntryId: origEntry.entryId,
    reason: "Customer approved partial adjustment",
    actorUid: "super_admin_1",
  });
  assert.equal(reversal.category, "reversal_adjustment");
  assert.equal(reversal.amountKobo, -origEntry.amountKobo);
  assert.equal(reversal.reversesEntryId, origEntry.entryId);

  // Caution refund requires approver + transaction reference
  const refundEntry = await postCautionRefundPayout(repos.ledger, {
    bookingRef: "SC-BK-PAY-01",
    refundAmountKobo: 5_000_000,
    approverUid: "super_admin_1",
    refundTransactionRef: "PSK-REFUND-991",
    reason: "Clean check-out verified",
  });
  assert.equal(refundEntry.category, "caution_refund_payout");
  console.log("PASS [unit]: Integer kobo, separated categories, allocations sum, append-only reversals & caution refund verified");

  // -------------------------------------------------------------------------
  // 5. Scheduled daily reconciliation protection & mismatch detection (Task 4 #3)
  // -------------------------------------------------------------------------
  // Old GET /api/paystack/webhook must return 405
  const oldGetRes = await webhookGet();
  assert.equal(oldGetRes.status, 405, "Old unprotected GET reconciliation on webhook must be disabled");

  // Unauthenticated call to /api/reconciliation/daily must be rejected (401)
  const unauthRecon = await reconPost(
    new NextRequest("http://localhost:3000/api/reconciliation/daily", { method: "POST" })
  );
  assert.equal(unauthRecon.status, 401);

  // Inject an orphaned gateway transaction missing from ledger so reconciliation detects it
  paystackAdapter.registerExternalSandboxTx({
    reference: "SC-PSK-ORPHAN-999",
    bookingRef: "SC-BK-ORPHAN",
    customerEmail: "orphan@example.com",
    amountKobo: 25_000_000,
    paidAmountKobo: 25_000_000,
    currency: "NGN",
    status: "success",
    paidAtIso: new Date().toISOString(),
  });

  // Cron-secret protected run succeeds and detects mismatches
  const cronReconRes = await reconPost(
    new NextRequest("http://localhost:3000/api/reconciliation/daily", {
      method: "POST",
      headers: { "x-cron-secret": "dev_reconciliation_cron_secret_local" },
    })
  );
  assert.equal(cronReconRes.status, 200);
  const cronReport = (await cronReconRes.json()) as {
    triggeredBy: string;
    matchedCount: number;
    mismatches: Array<{ type: string; paystackReference: string }>;
  };
  assert.equal(cronReport.triggeredBy, "scheduled_cron");
  assert.ok(cronReport.matchedCount >= 1);
  assert.ok(
    cronReport.mismatches.some(
      (m) => m.type === "missing_in_ledger" && m.paystackReference === "SC-PSK-ORPHAN-999"
    ),
    "Reconciliation must report missing_in_ledger mismatch"
  );
  assert.ok(
    cronReport.mismatches.some((m) => m.type === "gateway_failed"),
    "Reconciliation must report failed gateway tx"
  );

  // Manual trigger works for MFA-verified Super Admin
  await repos.users.saveUser({
    uid: "super_1",
    role: "super_admin",
    status: "active",
    displayName: "Super Admin",
    email: "super@shortletconnect.ng",
    mfaEnforced: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const mfaSess = createServerSession({
    uid: "super_1",
    role: "super_admin",
    verifiedContact: "super@shortletconnect.ng",
    mfaVerified: true,
  });
  const manualReconRes = await reconPost(
    new NextRequest("http://localhost:3000/api/reconciliation/daily", {
      method: "POST",
      headers: { authorization: `Bearer ${mfaSess.token}` },
    })
  );
  assert.equal(manualReconRes.status, 200);
  const manualReport = (await manualReconRes.json()) as { triggeredBy: string };
  assert.equal(manualReport.triggeredBy, "super_admin_manual");
  console.log("PASS [integration:signed-harness]: Protected daily reconciliation & manual Super Admin trigger verified");

  // Also test postVerifiedBookingLedgerEntries helper directly rejects mismatched allocations
  await assert.rejects(
    () =>
      postVerifiedBookingLedgerEntries(repos.ledger, {
        bookingRef: "SC-BAD-ALLOC",
        paystackReference: "PSK-BAD",
        quote: {
          ...ex1,
          internalAllocations: {
            coordinatingAdminKobo: 1,
            founderKobo: 1,
            adsAndOpsKobo: 1,
          },
        },
      }),
    /Ledger invariant violated/
  );

  console.log("ALL PAYMENTS, WEBHOOK, RECONCILIATION & LEDGER TESTS PASSED.");
}

runTests().catch((err) => {
  console.error("PAYMENTS/LEDGER TEST FAILURE:", err);
  process.exit(1);
});
