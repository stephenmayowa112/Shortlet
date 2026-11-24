import { NextRequest, NextResponse } from "next/server";
import { paystackAdapter } from "@/lib/adapters/payment-provider";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    const outcome = await paystackAdapter.processWebhookEvent(rawBody, signature);

    if (!outcome.accepted) {
      return NextResponse.json(
        { error: "Invalid Paystack webhook signature." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      received: true,
      idempotentDuplicate: outcome.idempotentDuplicate,
      verified: outcome.verification?.verified ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 400 }
    );
  }
}

export async function GET() {
  const report = await paystackAdapter.runDailyReconciliation();
  return NextResponse.json(report);
}
