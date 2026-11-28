import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import { transitionBookingStatus } from "@/lib/domain/booking-lifecycle";
import {
  authenticateSession,
  extractSessionTokenFromRequest,
  verifyMutationOrigin,
} from "@/lib/security/session";

const TransitionSchema = z.object({
  bookingRef: z.string().min(4).max(60),
  to: z.enum([
    "quoted",
    "awaiting_payment",
    "confirmed",
    "checked_in",
    "checked_out",
    "completed",
    "cancelled",
    "refunded_disputed",
  ]),
  reason: z.string().min(3).max(500),
  superAdminException: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  if (!verifyMutationOrigin(req.headers)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  }

  const token = extractSessionTokenFromRequest(req.headers);
  const auth = await authenticateSession(token);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Staff authentication required.", code: auth.code },
      { status: auth.code === "ACCOUNT_SUSPENDED" ? 403 : 401 }
    );
  }

  const { session } = auth;
  if (session.role !== "operational_admin" && session.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only active Shortlet Connect staff may transition booking statuses." },
      { status: 403 }
    );
  }

  const parsed = TransitionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid transition payload." },
      { status: 400 }
    );
  }

  if (parsed.data.superAdminException) {
    if (session.role !== "super_admin" || !session.mfaVerified) {
      return NextResponse.json(
        { error: "Super Admin MFA verification is required to apply a confirmation exception." },
        { status: 403 }
      );
    }
  }

  const repos = getRepositories();
  const booking = await repos.bookings.getBooking(parsed.data.bookingRef);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  try {
    const updated = transitionBookingStatus({
      booking,
      to: parsed.data.to,
      actorUid: session.uid,
      actorRole: session.role,
      reason: parsed.data.reason,
      paymentVerifiedServerSide: booking.paymentVerified,
      superAdminException: parsed.data.superAdminException,
    });

    if (parsed.data.to === "cancelled") {
      await repos.bookings.cancelAndReleaseSlotsAtomic({
        bookingRef: booking.bookingRef,
        listingId: booking.listingId,
        category: booking.category,
        startIso: booking.startIso,
        endIso: booking.endIso,
        reason: parsed.data.reason,
        actorUid: session.uid,
        actorRole: session.role,
      });
    }

    await repos.bookings.saveBooking(updated);

    await repos.audit.append({
      actorUid: session.uid,
      actorRole: session.role,
      action: "BOOKING_STATUS_TRANSITION",
      targetType: "booking",
      targetId: booking.bookingRef,
      reason: parsed.data.reason,
      beforeSummary: `status=${booking.status}`,
      afterSummary: `status=${updated.status}`,
    });

    return NextResponse.json({ booking: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid booking transition." },
      { status: 409 }
    );
  }
}
