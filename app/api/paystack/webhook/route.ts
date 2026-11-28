import { NextRequest, NextResponse } from "next/server";
import { getActivePaymentProvider } from "@/lib/adapters/payment-provider";
import { getRepositories } from "@/lib/repositories";
import { calculateStaffQuote } from "@/lib/domain/pricing";
import { postVerifiedBookingLedgerEntries } from "@/lib/domain/ledger";
import { logInfo, logWarn } from "@/lib/security/logger";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    const outcome = await getActivePaymentProvider().processWebhookEvent(rawBody, signature);

    if (!outcome.accepted) {
      logWarn("paystack.webhook.rejected_signature");
      return NextResponse.json(
        { error: "Invalid Paystack webhook signature." },
        { status: 401 }
      );
    }

    if (outcome.idempotentDuplicate) {
      return NextResponse.json({
        received: true,
        idempotentDuplicate: true,
        verified: false,
      });
    }

    const verification = outcome.verification;
    if (!verification) {
      return NextResponse.json({ received: true, idempotentDuplicate: false, verified: false });
    }

    const repos = getRepositories();
    const storedPayment = await repos.payments.getPaymentByReference(verification.reference);

    // Enforce 1:1 reference binding & server-stored expected quote (never trust webhook/client blind)
    if (!storedPayment) {
      await repos.audit.append({
        actorUid: "system_paystack",
        actorRole: "system",
        action: "PAYMENT_UNBOUND_REFERENCE_REJECTED",
        targetType: "payment",
        targetId: verification.reference,
        reason: "Received webhook for a Paystack reference not bound to any initialized booking.",
      });
      return NextResponse.json(
        {
          received: true,
          idempotentDuplicate: false,
          verified: false,
          outcome: "unbound_reference",
        },
        { status: 202 }
      );
    }

    if (
      verification.bookingRef &&
      verification.bookingRef !== "UNKNOWN" &&
      verification.bookingRef !== storedPayment.bookingRef
    ) {
      await repos.audit.append({
        actorUid: "system_paystack",
        actorRole: "system",
        action: "PAYMENT_BOOKING_BINDING_MISMATCH",
        targetType: "payment",
        targetId: verification.reference,
        reason: `Webhook metadata bookingRef=${verification.bookingRef} != bound bookingRef=${storedPayment.bookingRef}`,
      });
      return NextResponse.json(
        { received: true, verified: false, outcome: "reference_binding_mismatch" },
        { status: 409 }
      );
    }

    // Handle failed payment explicitly
    if (verification.gatewayStatus === "failed") {
      await repos.payments.updatePayment(storedPayment.paymentReference, {
        status: "failed",
        paidAmountKobo: verification.amountKobo,
        gatewayEventIds: [...storedPayment.gatewayEventIds, `${outcome.event}:${verification.reference}`],
      });
      await repos.audit.append({
        actorUid: "system_paystack",
        actorRole: "system",
        action: "PAYMENT_FAILED",
        targetType: "booking",
        targetId: storedPayment.bookingRef,
        reason: `Paystack reported failed charge for reference ${storedPayment.paymentReference}. Booking remains unconfirmed.`,
      });
      return NextResponse.json({
        received: true,
        idempotentDuplicate: false,
        verified: false,
        outcome: "failed",
      });
    }

    // Check currency strictly against NGN
    if (verification.currency !== "NGN") {
      await repos.payments.updatePayment(storedPayment.paymentReference, {
        status: "failed",
        paidAmountKobo: verification.amountKobo,
      });
      await repos.audit.append({
        actorUid: "system_paystack",
        actorRole: "system",
        action: "PAYMENT_CURRENCY_MISMATCH",
        targetType: "booking",
        targetId: storedPayment.bookingRef,
        reason: `Expected NGN, received ${verification.currency} on ${storedPayment.paymentReference}.`,
      });
      return NextResponse.json({
        received: true,
        idempotentDuplicate: false,
        verified: false,
        outcome: "currency_mismatch",
      });
    }

    // Compare paid amount against server-stored quote (underpayment / overpayment handling)
    if (verification.amountKobo < storedPayment.expectedAmountKobo) {
      await repos.payments.updatePayment(storedPayment.paymentReference, {
        status: "underpaid_review",
        paidAmountKobo: verification.amountKobo,
        gatewayEventIds: [...storedPayment.gatewayEventIds, `${outcome.event}:${verification.reference}`],
      });
      await repos.bookings.updateBookingStatus(storedPayment.bookingRef, "refunded_disputed", {
        paymentReference: storedPayment.paymentReference,
        paymentVerified: false,
      });
      await repos.audit.append({
        actorUid: "system_paystack",
        actorRole: "system",
        action: "PAYMENT_UNDERPAID_REVIEW",
        targetType: "booking",
        targetId: storedPayment.bookingRef,
        reason: `Underpayment detected: paid=${verification.amountKobo} kobo < expected=${storedPayment.expectedAmountKobo} kobo.`,
      });
      return NextResponse.json({
        received: true,
        idempotentDuplicate: false,
        verified: false,
        outcome: "underpaid_review",
      });
    }

    if (verification.amountKobo > storedPayment.expectedAmountKobo) {
      await repos.payments.updatePayment(storedPayment.paymentReference, {
        status: "overpaid_review",
        paidAmountKobo: verification.amountKobo,
        gatewayEventIds: [...storedPayment.gatewayEventIds, `${outcome.event}:${verification.reference}`],
      });
      await repos.bookings.updateBookingStatus(storedPayment.bookingRef, "refunded_disputed", {
        paymentReference: storedPayment.paymentReference,
        paymentVerified: false,
      });
      await repos.audit.append({
        actorUid: "system_paystack",
        actorRole: "system",
        action: "PAYMENT_OVERPAID_REVIEW",
        targetType: "booking",
        targetId: storedPayment.bookingRef,
        reason: `Overpayment detected: paid=${verification.amountKobo} kobo > expected=${storedPayment.expectedAmountKobo} kobo. Routed to finance review.`,
      });
      return NextResponse.json({
        received: true,
        idempotentDuplicate: false,
        verified: false,
        outcome: "overpaid_review",
      });
    }

    // Exact NGN amount matched stored quote -> atomically confirm hold or route late payment to manual review
    const booking = await repos.bookings.getBooking(storedPayment.bookingRef);
    let confirmationOutcome: "confirmed" | "late_payment_manual_review" | "already_confirmed" =
      "confirmed";

    if (booking) {
      const confirmRes = await repos.bookings.confirmAfterPaymentAtomic({
        bookingRef: booking.bookingRef,
        listingId: booking.listingId,
        category: booking.category,
        startIso: booking.startIso,
        endIso: booking.endIso,
        paymentReference: storedPayment.paymentReference,
      });
      confirmationOutcome = confirmRes.outcome;

      if (confirmRes.outcome === "late_payment_manual_review") {
        await repos.payments.updatePayment(storedPayment.paymentReference, {
          status: "late_payment_review",
          paidAmountKobo: verification.amountKobo,
          verifiedAtIso: verification.paidAtIso,
          gatewayEventIds: [...storedPayment.gatewayEventIds, `${outcome.event}:${verification.reference}`],
        });
        return NextResponse.json({
          received: true,
          idempotentDuplicate: false,
          verified: false,
          outcome: "late_payment_manual_review",
        });
      }

      if (confirmRes.outcome === "confirmed") {
        // Post separated integer-kobo ledger entries ONLY when confirmed (once)
        const existingLedger = await repos.ledger.listByBookingRef(booking.bookingRef);
        if (existingLedger.length === 0) {
          const staffQuote = calculateStaffQuote({
            category: booking.category,
            quantity: Math.max(1, booking.units),
            unitRateKobo: Math.round(
              booking.rentalPrincipalKobo / Math.max(1, booking.units)
            ),
            cautionFeeKobo: booking.cautionFeeKobo,
            extrasKobo: booking.extrasKobo,
          });
          // Preserve exact stored rentalPrincipal/serviceCharge/cautionFee
          staffQuote.rentalPrincipalKobo = booking.rentalPrincipalKobo;
          staffQuote.serviceChargeKobo = booking.serviceChargeKobo;
          staffQuote.cautionFeeKobo = booking.cautionFeeKobo;
          staffQuote.extrasKobo = booking.extrasKobo;
          staffQuote.customerTotalKobo = booking.customerTotalKobo;
          const unitSplit = Math.floor(booking.serviceChargeKobo / 3);
          staffQuote.internalAllocations = {
            coordinatingAdminKobo: unitSplit,
            founderKobo: unitSplit,
            adsAndOpsKobo: booking.serviceChargeKobo - unitSplit * 2,
          };

          await postVerifiedBookingLedgerEntries(repos.ledger, {
            bookingRef: booking.bookingRef,
            quote: staffQuote,
            paystackReference: storedPayment.paymentReference,
            coordinatingAdminUid: booking.assignedAdminUid,
          });
        }
      }
    }

    await repos.payments.updatePayment(storedPayment.paymentReference, {
      status: "verified",
      paidAmountKobo: verification.amountKobo,
      verifiedAtIso: verification.paidAtIso ?? new Date().toISOString(),
      gatewayEventIds: [...storedPayment.gatewayEventIds, `${outcome.event}:${verification.reference}`],
    });

    logInfo("paystack.webhook.verified", {
      bookingRef: storedPayment.bookingRef,
      outcome: confirmationOutcome,
    });

    return NextResponse.json({
      received: true,
      idempotentDuplicate: false,
      verified: true,
      outcome: confirmationOutcome,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Method not allowed. Use the protected /api/reconciliation/daily endpoint for reconciliation.",
    },
    { status: 405 }
  );
}
