import { NextRequest, NextResponse } from "next/server";
import { getRepositories } from "@/lib/repositories";

/**
 * Browser redirect callback after Paystack checkout (Task 4 #2).
 * INVARIANT: Browser redirect NEVER confirms a booking and NEVER posts ledger entries.
 * Confirmation happens exclusively through server-verified Paystack webhooks or server-side verify.
 */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? "";
  if (!reference) {
    return NextResponse.json(
      {
        confirmed: false,
        status: "invalid_redirect",
        message: "Missing payment reference.",
      },
      { status: 400 }
    );
  }

  const repos = getRepositories();
  const payment = await repos.payments.getPaymentByReference(reference);
  const booking = payment ? await repos.bookings.getBooking(payment.bookingRef) : null;

  return NextResponse.json({
    confirmed: booking?.status === "confirmed" && booking.paymentVerified === true,
    bookingStatus: booking?.status ?? "awaiting_payment",
    paymentStatus: payment?.status ?? "initialized",
    reference,
    message:
      booking?.status === "confirmed" && booking.paymentVerified
        ? "Booking was already confirmed by server-side Paystack verification."
        : "Browser redirect received. Awaiting server-side Paystack webhook verification; redirect alone never confirms a booking.",
  });
}
