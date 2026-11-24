import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { paystackAdapter } from "@/lib/adapters/payment-provider";

const InitSchema = z.object({
  bookingRef: z.string().min(4).max(60),
  customerEmail: z.string().email(),
  amountKobo: z.number().int().positive(),
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

    const init = await paystackAdapter.initializeTransaction({
      bookingRef: parsed.data.bookingRef,
      customerEmail: parsed.data.customerEmail,
      amountKobo: parsed.data.amountKobo,
      currency: "NGN",
    });

    return NextResponse.json(init);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment initialization failed." },
      { status: 500 }
    );
  }
}
