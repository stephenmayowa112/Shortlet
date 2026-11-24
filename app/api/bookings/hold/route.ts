import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serverAvailabilityStore } from "@/lib/domain/availability";
import { calculateCustomerQuote } from "@/lib/domain/pricing";

const HoldRequestSchema = z.object({
  listingId: z.string().min(3).max(64),
  category: z.enum(["apartment", "car", "boat"]),
  startIso: z.string().min(10),
  endIso: z.string().min(10),
  quantity: z.number().positive(),
  carUnitMode: z.enum(["hours", "days"]).optional(),
  unitRateKobo: z.number().int().positive(),
  cautionFeeKobo: z.number().int().min(0).default(0),
  extrasKobo: z.number().int().min(0).default(0),
  bookingRef: z.string().min(4).max(60),
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
    const holdOutcome = await serverAvailabilityStore.acquireHold({
      listingId: data.listingId,
      category: data.category,
      startIso: data.startIso,
      endIso: data.endIso,
      bookingRef: data.bookingRef,
      holdType: data.holdType,
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

    // Explicit allow-list customer quote (never includes internal ₦10k allocations)
    const customerQuote = calculateCustomerQuote({
      category: data.category,
      quantity: data.quantity,
      carUnitMode: data.carUnitMode,
      unitRateKobo: data.unitRateKobo,
      cautionFeeKobo: data.cautionFeeKobo,
      extrasKobo: data.extrasKobo,
    });

    return NextResponse.json({
      holdAcquired: true,
      slotCount: holdOutcome.acquiredKeys.length,
      quote: customerQuote,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not acquire hold." },
      { status: 400 }
    );
  }
}
