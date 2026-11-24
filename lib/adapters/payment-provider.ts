import crypto from "crypto";

export interface PaymentInitRequest {
  bookingRef: string;
  customerEmail: string;
  amountKobo: number;
  currency: "NGN";
  callbackUrl?: string;
}

export interface PaymentInitResponse {
  reference: string;
  authorizationUrl: string;
  amountKobo: number;
  currency: "NGN";
  mode: "sandbox";
}

export interface PaymentVerificationResult {
  verified: boolean;
  reference: string;
  bookingRef: string;
  amountKobo: number;
  currency: "NGN";
  gatewayStatus: "success" | "pending" | "failed" | "abandoned";
  paidAtIso?: string;
}

export interface PaystackWebhookPayload {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    metadata?: { bookingRef?: string };
    paid_at?: string;
  };
}

export interface PaymentProvider {
  initializeTransaction(req: PaymentInitRequest): Promise<PaymentInitResponse>;
  verifyTransaction(reference: string, expectedAmountKobo: number): Promise<PaymentVerificationResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  processWebhookEvent(
    rawBody: string,
    signatureHeader: string | null
  ): Promise<{ accepted: boolean; idempotentDuplicate: boolean; verification?: PaymentVerificationResult }>;
  runDailyReconciliation(): Promise<{
    checkedCount: number;
    matchedCount: number;
    discrepancies: string[];
    reconciledAtIso: string;
  }>;
}

interface StoredSandboxTx {
  reference: string;
  bookingRef: string;
  customerEmail: string;
  amountKobo: number;
  currency: "NGN";
  status: "pending" | "success" | "failed";
  paidAtIso?: string;
}

/**
 * Offline-testable Paystack Sandbox Adapter (FIN-01).
 * Enforces:
 * - Integer kobo verification
 * - HMAC-SHA512 webhook signature validation
 * - Idempotent webhook processing (duplicate events never double-credit)
 * - Server-side confirmation by gateway reference (browser redirect alone never confirms)
 */
export class SandboxPaystackAdapter implements PaymentProvider {
  private secretKey: string;
  private transactions = new Map<string, StoredSandboxTx>();
  private processedWebhookKeys = new Set<string>();

  constructor(secretKey?: string) {
    this.secretKey =
      secretKey ?? process.env.PAYSTACK_SECRET_KEY ?? "sk_test_sandbox_shortlet_connect";
  }

  public async initializeTransaction(req: PaymentInitRequest): Promise<PaymentInitResponse> {
    if (!Number.isInteger(req.amountKobo) || req.amountKobo <= 0) {
      throw new Error("Paystack amountKobo must be a positive integer.");
    }
    const reference = `SC-PSK-${req.bookingRef}-${Date.now().toString(36).toUpperCase()}`;
    this.transactions.set(reference, {
      reference,
      bookingRef: req.bookingRef,
      customerEmail: req.customerEmail,
      amountKobo: req.amountKobo,
      currency: "NGN",
      status: "pending",
    });

    return {
      reference,
      authorizationUrl: `/api/paystack/verify?reference=${encodeURIComponent(reference)}`,
      amountKobo: req.amountKobo,
      currency: "NGN",
      mode: "sandbox",
    };
  }

  /** Marks a sandbox transaction paid on the gateway side (simulating Paystack checkout completion) */
  public markSandboxGatewayPaid(reference: string, paidAmountKobo?: number): StoredSandboxTx {
    const tx = this.transactions.get(reference);
    if (!tx) {
      throw new Error(`Unknown Paystack reference: ${reference}`);
    }
    tx.status = "success";
    if (typeof paidAmountKobo === "number") {
      tx.amountKobo = paidAmountKobo;
    }
    tx.paidAtIso = new Date().toISOString();
    return tx;
  }

  public signPayload(rawBody: string): string {
    return crypto.createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
  }

  public verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const expected = this.signPayload(rawBody);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader.trim(), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  public async verifyTransaction(
    reference: string,
    expectedAmountKobo: number
  ): Promise<PaymentVerificationResult> {
    const tx = this.transactions.get(reference);
    if (!tx) {
      return {
        verified: false,
        reference,
        bookingRef: "",
        amountKobo: 0,
        currency: "NGN",
        gatewayStatus: "failed",
      };
    }

    const amountMatches = tx.amountKobo === expectedAmountKobo && tx.currency === "NGN";
    const verified = tx.status === "success" && amountMatches;

    return {
      verified,
      reference: tx.reference,
      bookingRef: tx.bookingRef,
      amountKobo: tx.amountKobo,
      currency: "NGN",
      gatewayStatus: tx.status,
      paidAtIso: tx.paidAtIso,
    };
  }

  public async processWebhookEvent(
    rawBody: string,
    signatureHeader: string | null
  ): Promise<{ accepted: boolean; idempotentDuplicate: boolean; verification?: PaymentVerificationResult }> {
    if (!this.verifyWebhookSignature(rawBody, signatureHeader)) {
      return { accepted: false, idempotentDuplicate: false };
    }

    const payload = JSON.parse(rawBody) as PaystackWebhookPayload;
    const dedupKey = `${payload.event}:${payload.data.reference}`;

    if (this.processedWebhookKeys.has(dedupKey)) {
      return { accepted: true, idempotentDuplicate: true };
    }

    this.processedWebhookKeys.add(dedupKey);

    if (payload.event === "charge.success" && payload.data.status === "success") {
      const existing = this.transactions.get(payload.data.reference);
      if (existing) {
        existing.status = "success";
        existing.amountKobo = payload.data.amount;
        existing.paidAtIso = payload.data.paid_at ?? new Date().toISOString();
      } else {
        this.transactions.set(payload.data.reference, {
          reference: payload.data.reference,
          bookingRef: payload.data.metadata?.bookingRef ?? "UNKNOWN",
          customerEmail: "webhook@shortletconnect.ng",
          amountKobo: payload.data.amount,
          currency: "NGN",
          status: "success",
          paidAtIso: payload.data.paid_at ?? new Date().toISOString(),
        });
      }

      const tx = this.transactions.get(payload.data.reference)!;
      return {
        accepted: true,
        idempotentDuplicate: false,
        verification: {
          verified: true,
          reference: tx.reference,
          bookingRef: tx.bookingRef,
          amountKobo: tx.amountKobo,
          currency: "NGN",
          gatewayStatus: "success",
          paidAtIso: tx.paidAtIso,
        },
      };
    }

    return { accepted: true, idempotentDuplicate: false };
  }

  public async runDailyReconciliation() {
    let matchedCount = 0;
    const discrepancies: string[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.status === "success" && tx.amountKobo > 0) {
        matchedCount++;
      } else if (tx.status === "failed") {
        discrepancies.push(`Failed transaction ${tx.reference} (${tx.bookingRef})`);
      }
    }
    return {
      checkedCount: this.transactions.size,
      matchedCount,
      discrepancies,
      reconciledAtIso: new Date().toISOString(),
    };
  }
}

export const paystackAdapter = new SandboxPaystackAdapter();
