import { NextRequest, NextResponse } from "next/server";
import { getRepositories } from "@/lib/repositories";
import {
  authenticateSession,
  extractSessionTokenFromRequest,
} from "@/lib/security/session";

/**
 * Customer Bookings & Receipts Access Route (Task 5 #3).
 * INVARIANT: A phone number or booking reference alone NEVER exposes bookings.
 * Caller MUST hold a valid signed, short-lived, HttpOnly OTP session verified
 * for the EXACT same contact recorded on the booking.
 */
export async function GET(req: NextRequest) {
  const token = extractSessionTokenFromRequest(req.headers);
  const auth = await authenticateSession(token);
  if (!auth.ok) {
    return NextResponse.json(
      {
        error:
          "Contact verification via one-time code is required before viewing bookings or receipts.",
        code: auth.code,
      },
      { status: 401 }
    );
  }

  const verifiedContact = auth.session.verifiedContact;
  const bookingRefFilter = req.nextUrl.searchParams.get("bookingRef")?.trim();

  const repos = getRepositories();
  const ownedBookings = await repos.bookings.listBookingsByContact(verifiedContact);

  const filtered = bookingRefFilter
    ? ownedBookings.filter((b) => b.bookingRef === bookingRefFilter)
    : ownedBookings;

  // Strip any internal-only fields (only customer-facing booking summary returned)
  return NextResponse.json({
    verifiedContact,
    bookings: filtered.map((b) => ({
      bookingRef: b.bookingRef,
      listingId: b.listingId,
      listingTitle: b.listingTitle,
      category: b.category,
      startIso: b.startIso,
      endIso: b.endIso,
      status: b.status,
      rentalPrincipalKobo: b.rentalPrincipalKobo,
      serviceChargeKobo: b.serviceChargeKobo,
      cautionFeeKobo: b.cautionFeeKobo,
      extrasKobo: b.extrasKobo,
      customerTotalKobo: b.customerTotalKobo,
      currency: b.currency,
      paymentVerified: b.paymentVerified,
      createdAt: b.createdAt,
    })),
  });
}
