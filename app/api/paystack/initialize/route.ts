import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActivePaymentProvider } from "@/lib/adapters/payment-provider";
import { getRepositories } from "@/lib/repositories";

const InitSchema = z.object({
  bookingRef: z.string().min(4).max(60),
  customerEmail: z.string().email(),
  /** Only used when booking is not yet persisted server-side in sandbox UI; server-stored quote always wins. */
  amountKobo: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = InitSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid Paystack checkout initialization payload." },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const storedBooking = await repos.bookings.getBooking(parsed.data.bookingRef);

    // Server-stored quote ALWAYS overrides client-supplied amount (Task 4 #1)
    const authoritativeAmountKobo = storedBooking
      ? storedBooking.customerTotalKobo
      : parsed.data.amountKobo;

    if (!authoritativeAmountKobo || !Number.isInteger(authoritativeAmountKobo) || authoritativeAmountKobo <= 0) {
      return NextResponse.json(
        { error: "No stored booking quote found for this booking reference." },
        { status: 400 }
      );
    }

    const provider = getActivePaymentProvider();
    const init = await provider.initializeTransaction({
      bookingRef: parsed.data.bookingRef,
      customerEmail: parsed.data.customerEmail,
      amountKobo: authoritativeAmountKobo,
      currency: "NGN",
    });

    // Bind payment reference 1:1 to bookingRef and store expected quote on server
    await repos.payments.createOrBindPayment({
      paymentReference: init.reference,
      bookingRef: parsed.data.bookingRef,
      expectedAmountKobo: authoritativeAmountKobo,
      currency: "NGN",
      status: "initialized",
      gatewayEventIds: [],
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(init);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment initialization failed." },
      { status: 500 }
    );
  }
}
