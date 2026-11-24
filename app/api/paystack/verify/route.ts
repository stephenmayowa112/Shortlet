import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { paystackAdapter } from "@/lib/adapters/payment-provider";

const VerifySchema = z.object({
  reference: z.string().min(4).max(120),
  expectedAmountKobo: z.number().int().positive(),
  simulateGatewaySuccess: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = VerifySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payment verification request." },
        { status: 400 }
      );
    }

    // In sandbox mode, optionally simulate Paystack settling the payment and firing a signed webhook
    let webhookAccepted = false;
    if (parsed.data.simulateGatewaySuccess) {
      const tx = paystackAdapter.markSandboxGatewayPaid(
        parsed.data.reference,
        parsed.data.expectedAmountKobo
      );
      const rawWebhook = JSON.stringify({
        event: "charge.success",
        data: {
          reference: tx.reference,
          amount: tx.amountKobo,
          currency: "NGN",
          status: "success",
          metadata: { bookingRef: tx.bookingRef },
          paid_at: tx.paidAtIso,
        },
      });
      const sig = paystackAdapter.signPayload(rawWebhook);
      const hookOutcome = await paystackAdapter.processWebhookEvent(rawWebhook, sig);
      webhookAccepted = hookOutcome.accepted;
    }

    const result = await paystackAdapter.verifyTransaction(
      parsed.data.reference,
      parsed.data.expectedAmountKobo
    );

    if (!result.verified) {
      return NextResponse.json(
        {
          verified: false,
          error:
            "Server-side Paystack verification has not confirmed payment yet. Browser redirects alone never confirm bookings.",
          result,
        },
        { status: 402 }
      );
    }

    return NextResponse.json({
      verified: true,
      webhookSignatureValidated: webhookAccepted,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment verification failed." },
      { status: 500 }
    );
  }
}
