import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import { calculateCustomerQuote, calculateStaffQuote } from "@/lib/domain/pricing";
import type { BookingRecord } from "@/lib/types";

const HoldRequestSchema = z.object({
  listingId: z.string().min(3).max(64),
  listingTitle: z.string().min(2).max(160).optional(),
  category: z.enum(["apartment", "car", "boat"]),
  startIso: z.string().min(10),
  endIso: z.string().min(10),
  quantity: z.number().positive(),
  carUnitMode: z.enum(["hours", "days"]).optional(),
  unitRateKobo: z.number().int().positive(),
  cautionFeeKobo: z.number().int().min(0).default(0),
  extrasKobo: z.number().int().min(0).default(0),
  bookingRef: z.string().min(4).max(60),
  customerName: z.string().min(2).max(120).optional(),
  customerContact: z.string().min(5).max(254).optional(),
  holdType: z.enum(["hold", "confirmed"]).default("hold"),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = HoldRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid availability hold request." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const repos = getRepositories();

    // Server-only authoritative calculation of both customer quote and internal allocations
    const staffQuote = calculateStaffQuote({
      category: data.category,
      quantity: data.quantity,
      carUnitMode: data.carUnitMode,
      unitRateKobo: data.unitRateKobo,
      cautionFeeKobo: data.cautionFeeKobo,
      extrasKobo: data.extrasKobo,
    });

    const customerQuote = calculateCustomerQuote({
      category: data.category,
      quantity: data.quantity,
      carUnitMode: data.carUnitMode,
      unitRateKobo: data.unitRateKobo,
      cautionFeeKobo: data.cautionFeeKobo,
      extrasKobo: data.extrasKobo,
    });

    // Only allow 'hold' from public booking endpoint; 'confirmed' requires verified payment
    const holdOutcome = await repos.bookings.acquireSlotsAtomic({
      listingId: data.listingId,
      category: data.category,
      startIso: data.startIso,
      endIso: data.endIso,
      bookingRef: data.bookingRef,
      holdType: "hold",
      holdMinutes: 30,
    });

    if (!holdOutcome.ok) {
      return NextResponse.json(
        {
          error:
            "These dates or time slots are already reserved or held by another booking. Please choose another window.",
          conflictingSlot: holdOutcome.conflictingKey,
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const record: BookingRecord = {
      bookingRef: data.bookingRef,
      listingId: data.listingId,
      listingTitle: data.listingTitle ?? data.listingId,
      category: data.category,
      customerName: data.customerName ?? "Guest Customer",
      customerContact: (data.customerContact ?? "guest@shortletconnect.ng").trim().toLowerCase(),
      startIso: data.startIso,
      endIso: data.endIso,
      units: staffQuote.chargeableUnits,
      status: "awaiting_payment",
      rentalPrincipalKobo: staffQuote.rentalPrincipalKobo,
      serviceChargeKobo: staffQuote.serviceChargeKobo,
      cautionFeeKobo: staffQuote.cautionFeeKobo,
      extrasKobo: staffQuote.extrasKobo,
      customerTotalKobo: staffQuote.customerTotalKobo,
      currency: "NGN",
      paymentVerified: false,
      cautionDepositStatus:
        staffQuote.cautionFeeKobo > 0 ? "pending_collection" : "not_applicable",
      statusHistory: [
        {
          from: "requested",
          to: "awaiting_payment",
          actorUid: "system_booking_hold",
          actorRole: "system",
          bookingRef: data.bookingRef,
          reason: `30-minute hold acquired (${holdOutcome.acquiredKeys.length} slot(s))`,
          atIso: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await repos.bookings.saveBooking(record);

    // Explicit allow-list customer quote only (never exposes internal ₦10k allocations)
    return NextResponse.json({
      holdAcquired: true,
      slotCount: holdOutcome.acquiredKeys.length,
      holdExpiresAtIso: holdOutcome.expiresAtIso,
      quote: customerQuote,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not acquire hold." },
      { status: 400 }
    );
  }
}
