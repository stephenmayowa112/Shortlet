import type { BookingRecord, BookingStatus, UserRole } from "@/lib/types";

/**
 * Explicit allowed state machine transitions per PRD BOOK-02:
 * Requested -> Quoted -> Awaiting Payment -> Confirmed -> Checked In/Started -> Checked Out/Ended -> Completed
 * Plus Cancelled and Refunded/Disputed where permitted.
 */
export const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["quoted", "cancelled"],
  quoted: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "refunded_disputed"],
  checked_in: ["checked_out", "refunded_disputed"],
  checked_out: ["completed", "refunded_disputed"],
  completed: ["refunded_disputed"],
  cancelled: ["refunded_disputed"],
  refunded_disputed: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionOptions {
  booking: BookingRecord;
  to: BookingStatus;
  actorUid: string;
  actorRole: UserRole | "system";
  reason: string;
  /** Required true when transitioning to 'confirmed' unless superAdminException is true */
  paymentVerifiedServerSide?: boolean;
  /** Recorded Super Admin override exception per Invariant 3 */
  superAdminException?: boolean;
  nowIso?: string;
}

export function transitionBookingStatus(opts: TransitionOptions): BookingRecord {
  const { booking, to, actorUid, actorRole, reason } = opts;
  if (!canTransitionBooking(booking.status, to)) {
    throw new Error(
      `Invalid booking transition from '${booking.status}' to '${to}' for ${booking.bookingRef}.`
    );
  }

  // Non-negotiable Invariant 3: Confirmed ONLY after server-side verified payment or Super Admin exception
  if (to === "confirmed") {
    const hasVerifiedPayment = Boolean(
      opts.paymentVerifiedServerSide || booking.paymentVerified
    );
    const hasApprovedException = Boolean(
      opts.superAdminException && actorRole === "super_admin" && reason.trim().length >= 5
    );
    if (!hasVerifiedPayment && !hasApprovedException) {
      throw new Error(
        "Booking cannot be Confirmed without server-side verified Paystack payment or a Super Admin recorded exception."
      );
    }
  }

  const atIso = opts.nowIso ?? new Date().toISOString();
  return {
    ...booking,
    status: to,
    paymentVerified: to === "confirmed" ? Boolean(opts.paymentVerifiedServerSide || booking.paymentVerified) : booking.paymentVerified,
    updatedAt: atIso,
    statusHistory: [
      ...booking.statusHistory,
      {
        from: booking.status,
        to,
        actorUid,
        actorRole,
        bookingRef: booking.bookingRef,
        reason: reason.trim() || `Transitioned to ${to}`,
        atIso,
      },
    ],
  };
}
