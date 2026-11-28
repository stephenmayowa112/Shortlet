import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getActivePaymentProvider,
  paystackAdapter,
  SandboxPaystackAdapter,
} from "@/lib/adapters/payment-provider";
import { getRepositories } from "@/lib/repositories";

const VerifySchema = z.object({
  reference: z.string().min(4).max(120),
  /** Ignored whenever a server-stored payment record exists; never trusted over stored quote. */
  expectedAmountKobo: z.number().int().positive().optional(),
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

    const repos = getRepositories();
    const storedPayment = await repos.payments.getPaymentByReference(parsed.data.reference);
    if (!storedPayment) {
      return NextResponse.json(
        {
          verified: false,
          error: "Unknown or unbound payment reference.",
        },
        { status: 404 }
      );
    }

    const authoritativeAmountKobo = storedPayment.expectedAmountKobo;
    const provider = getActivePaymentProvider();

    // Sandbox checkout settlement simulation is strictly disabled in production and live mode
    let webhookAccepted = false;
    if (
      parsed.data.simulateGatewaySuccess &&
      process.env.NODE_ENV !== "production" &&
      provider instanceof SandboxPaystackAdapter
    ) {
      const tx = paystackAdapter.markSandboxGatewayPaid(
        parsed.data.reference,
        authoritativeAmountKobo,
        "NGN"
      );
      const rawWebhook = JSON.stringify({
        event: "charge.success",
        data: {
          reference: tx.reference,
          amount: tx.paidAmountKobo ?? tx.amountKobo,
          currency: "NGN",
          status: "success",
          metadata: { bookingRef: tx.bookingRef },
          paid_at: tx.paidAtIso,
        },
      });
      const sig = paystackAdapter.signPayload(rawWebhook);
      const hookOutcome = await paystackAdapter.processWebhookEvent(rawWebhook, sig);
      webhookAccepted = hookOutcome.accepted;
      if (hookOutcome.accepted) {
        await repos.payments.updatePayment(storedPayment.paymentReference, {
          status: "verified",
          paidAmountKobo: authoritativeAmountKobo,
          verifiedAtIso: tx.paidAtIso,
        });
      }
    }

    const result = await provider.verifyTransaction(
      parsed.data.reference,
      authoritativeAmountKobo
    );

    if (!result.verified) {
      return NextResponse.json(
        {
          verified: false,
          error:
            "Server-side Paystack verification has not confirmed exact NGN payment yet. Browser redirects alone never confirm bookings.",
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
