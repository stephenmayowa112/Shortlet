import crypto from "node:crypto";
import { getCanonicalAppUrl, getPaystackMode } from "@/lib/config/env";

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
  mode: "sandbox" | "live" | "test_api";
}

export interface PaymentVerificationResult {
  verified: boolean;
  reference: string;
  bookingRef: string;
  amountKobo: number;
  currency: string;
  gatewayStatus: "success" | "pending" | "failed" | "abandoned";
  paidAtIso?: string;
  mismatchReason?:
    | "currency_mismatch"
    | "underpayment"
    | "overpayment"
    | "not_paid"
    | "unknown_reference";
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

export interface StoredSandboxTx {
  reference: string;
  bookingRef: string;
  customerEmail: string;
  amountKobo: number;
  paidAmountKobo?: number;
  currency: string;
  status: "pending" | "success" | "failed";
  paidAtIso?: string;
}

export interface PaymentProvider {
  initializeTransaction(req: PaymentInitRequest): Promise<PaymentInitResponse>;
  verifyTransaction(
    reference: string,
    expectedAmountKobo: number
  ): Promise<PaymentVerificationResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  processWebhookEvent(
    rawBody: string,
    signatureHeader: string | null
  ): Promise<{
    accepted: boolean;
    idempotentDuplicate: boolean;
    event?: string;
    verification?: PaymentVerificationResult;
  }>;
  listGatewayTransactions(): Promise<StoredSandboxTx[]>;
}

const PAYSTACK_API_BASE = "https://api.paystack.co";

function verifyHmacSha512ConstantTime(
  secretKey: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Production Paystack REST API Adapter (FIN-01).
 * Activated automatically whenever a real `sk_live_...` or `sk_test_...` PAYSTACK_SECRET_KEY
 * is configured (and PAYSTACK_MODE !== "sandbox").
 */
export class LivePaystackAdapter implements PaymentProvider {
  private secretKey: string;
  private mode: "live" | "test_api";
  private processedWebhookKeys = new Set<string>();

  constructor(secretKey: string, mode: "live" | "test_api") {
    this.secretKey = secretKey;
    this.mode = mode;
  }

  public async initializeTransaction(req: PaymentInitRequest): Promise<PaymentInitResponse> {
    if (!Number.isInteger(req.amountKobo) || req.amountKobo <= 0) {
      throw new Error("Paystack amountKobo must be a positive integer.");
    }
    if (req.currency !== "NGN") {
      throw new Error("Only NGN currency is supported.");
    }

    const nonce = crypto.randomBytes(4).toString("hex").toUpperCase();
    const reference = `SC-PSK-${req.bookingRef}-${Date.now().toString(36).toUpperCase()}-${nonce}`;
    const callbackUrl =
      req.callbackUrl ??
      `${getCanonicalAppUrl()}/api/paystack/callback?reference=${encodeURIComponent(reference)}`;

    const res = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: req.customerEmail,
        amount: req.amountKobo,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: { bookingRef: req.bookingRef },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };

    if (!res.ok || !json.status || !json.data?.authorization_url) {
      throw new Error(json.message || "Paystack transaction initialization failed.");
    }

    return {
      reference: json.data.reference ?? reference,
      authorizationUrl: json.data.authorization_url,
      amountKobo: req.amountKobo,
      currency: "NGN",
      mode: this.mode,
    };
  }

  public verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    return verifyHmacSha512ConstantTime(this.secretKey, rawBody, signatureHeader);
  }

  public async verifyTransaction(
    reference: string,
    expectedAmountKobo: number
  ): Promise<PaymentVerificationResult> {
    const res = await fetch(
      `${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.secretKey}` },
        signal: AbortSignal.timeout(12_000),
      }
    );

    const json = (await res.json()) as {
      status?: boolean;
      data?: {
        reference: string;
        amount: number;
        currency: string;
        status: string;
        paid_at?: string;
        metadata?: { bookingRef?: string };
      };
    };

    if (!res.ok || !json.status || !json.data) {
      return {
        verified: false,
        reference,
        bookingRef: "",
        amountKobo: 0,
        currency: "NGN",
        gatewayStatus: "failed",
        mismatchReason: "unknown_reference",
      };
    }

    const d = json.data;
    const gatewayStatus =
      d.status === "success" || d.status === "pending" || d.status === "abandoned"
        ? d.status
        : "failed";

    if (gatewayStatus !== "success") {
      return {
        verified: false,
        reference: d.reference,
        bookingRef: d.metadata?.bookingRef ?? "",
        amountKobo: d.amount,
        currency: d.currency,
        gatewayStatus,
        mismatchReason: "not_paid",
      };
    }
    if (d.currency !== "NGN") {
      return {
        verified: false,
        reference: d.reference,
        bookingRef: d.metadata?.bookingRef ?? "",
        amountKobo: d.amount,
        currency: d.currency,
        gatewayStatus: "success",
        paidAtIso: d.paid_at,
        mismatchReason: "currency_mismatch",
      };
    }
    if (d.amount < expectedAmountKobo) {
      return {
        verified: false,
        reference: d.reference,
        bookingRef: d.metadata?.bookingRef ?? "",
        amountKobo: d.amount,
        currency: d.currency,
        gatewayStatus: "success",
        paidAtIso: d.paid_at,
        mismatchReason: "underpayment",
      };
    }
    if (d.amount > expectedAmountKobo) {
      return {
        verified: false,
        reference: d.reference,
        bookingRef: d.metadata?.bookingRef ?? "",
        amountKobo: d.amount,
        currency: d.currency,
        gatewayStatus: "success",
        paidAtIso: d.paid_at,
        mismatchReason: "overpayment",
      };
    }

    return {
      verified: true,
      reference: d.reference,
      bookingRef: d.metadata?.bookingRef ?? "",
      amountKobo: d.amount,
      currency: d.currency,
      gatewayStatus: "success",
      paidAtIso: d.paid_at,
    };
  }

  public async processWebhookEvent(
    rawBody: string,
    signatureHeader: string | null
  ): Promise<{
    accepted: boolean;
    idempotentDuplicate: boolean;
    event?: string;
    verification?: PaymentVerificationResult;
  }> {
    if (!this.verifyWebhookSignature(rawBody, signatureHeader)) {
      return { accepted: false, idempotentDuplicate: false };
    }

    const payload = JSON.parse(rawBody) as PaystackWebhookPayload;
    if (!payload?.event || !payload?.data?.reference) {
      throw new Error("Malformed Paystack webhook payload.");
    }

    const dedupKey = `${payload.event}:${payload.data.reference}`;
    if (this.processedWebhookKeys.has(dedupKey)) {
      return { accepted: true, idempotentDuplicate: true, event: payload.event };
    }
    this.processedWebhookKeys.add(dedupKey);

    const refBooking = payload.data.metadata?.bookingRef ?? "UNKNOWN";
    if (payload.event === "charge.failed" || payload.data.status === "failed") {
      return {
        accepted: true,
        idempotentDuplicate: false,
        event: payload.event,
        verification: {
          verified: false,
          reference: payload.data.reference,
          bookingRef: refBooking,
          amountKobo: payload.data.amount,
          currency: payload.data.currency,
          gatewayStatus: "failed",
          mismatchReason: "not_paid",
        },
      };
    }

    if (payload.event === "charge.success" && payload.data.status === "success") {
      return {
        accepted: true,
        idempotentDuplicate: false,
        event: payload.event,
        verification: {
          verified: payload.data.currency === "NGN",
          reference: payload.data.reference,
          bookingRef: refBooking,
          amountKobo: payload.data.amount,
          currency: payload.data.currency,
          gatewayStatus: "success",
          paidAtIso: payload.data.paid_at ?? new Date().toISOString(),
        },
      };
    }

    return { accepted: true, idempotentDuplicate: false, event: payload.event };
  }

  public async listGatewayTransactions(): Promise<StoredSandboxTx[]> {
    const res = await fetch(`${PAYSTACK_API_BASE}/transaction?perPage=100`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.secretKey}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`Paystack reconciliation fetch failed with HTTP ${res.status}.`);
    }
    const json = (await res.json()) as {
      data?: Array<{
        reference: string;
        amount: number;
        currency: string;
        status: string;
        paid_at?: string;
        customer?: { email?: string };
        metadata?: { bookingRef?: string };
      }>;
    };

    return (json.data ?? []).map((tx) => ({
      reference: tx.reference,
      bookingRef: tx.metadata?.bookingRef ?? "UNKNOWN",
      customerEmail: tx.customer?.email ?? "unknown@shortletconnect.ng",
      amountKobo: tx.amount,
      paidAmountKobo: tx.amount,
      currency: tx.currency,
      status: tx.status === "success" ? "success" : tx.status === "failed" ? "failed" : "pending",
      paidAtIso: tx.paid_at,
    }));
  }
}

/**
 * Offline-testable Paystack Sandbox Adapter (FIN-01).
 * Used automatically in local development and automated tests when no real Paystack key is set.
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
    if (req.currency !== "NGN") {
      throw new Error("Only NGN currency is supported.");
    }
    const nonce = crypto.randomBytes(3).toString("hex").toUpperCase();
    const reference = `SC-PSK-${req.bookingRef}-${Date.now().toString(36).toUpperCase()}-${nonce}`;
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
      authorizationUrl: `/api/paystack/callback?reference=${encodeURIComponent(reference)}`,
      amountKobo: req.amountKobo,
      currency: "NGN",
      mode: "sandbox",
    };
  }

  /** Test/sandbox helper to simulate gateway settlement (never used in production). */
  public markSandboxGatewayPaid(
    reference: string,
    paidAmountKobo?: number,
    currency = "NGN"
  ): StoredSandboxTx {
    const tx = this.transactions.get(reference);
    if (!tx) {
      throw new Error(`Unknown Paystack reference: ${reference}`);
    }
    tx.status = "success";
    tx.paidAmountKobo = typeof paidAmountKobo === "number" ? paidAmountKobo : tx.amountKobo;
    tx.currency = currency;
    tx.paidAtIso = new Date().toISOString();
    return tx;
  }

  public markSandboxGatewayFailed(reference: string): StoredSandboxTx {
    const tx = this.transactions.get(reference);
    if (!tx) {
      throw new Error(`Unknown Paystack reference: ${reference}`);
    }
    tx.status = "failed";
    return tx;
  }

  public registerExternalSandboxTx(tx: StoredSandboxTx): void {
    this.transactions.set(tx.reference, { ...tx });
  }

  public signPayload(rawBody: string): string {
    return crypto.createHmac("sha512", this.secretKey).update(rawBody, "utf8").digest("hex");
  }

  public verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    return verifyHmacSha512ConstantTime(this.secretKey, rawBody, signatureHeader);
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
        mismatchReason: "unknown_reference",
      };
    }

    const effectiveAmount = tx.paidAmountKobo ?? tx.amountKobo;

    if (tx.status !== "success") {
      return {
        verified: false,
        reference: tx.reference,
        bookingRef: tx.bookingRef,
        amountKobo: effectiveAmount,
        currency: tx.currency,
        gatewayStatus: tx.status,
        mismatchReason: "not_paid",
      };
    }

    if (tx.currency !== "NGN") {
      return {
        verified: false,
        reference: tx.reference,
        bookingRef: tx.bookingRef,
        amountKobo: effectiveAmount,
        currency: tx.currency,
        gatewayStatus: "success",
        paidAtIso: tx.paidAtIso,
        mismatchReason: "currency_mismatch",
      };
    }

    if (effectiveAmount < expectedAmountKobo) {
      return {
        verified: false,
        reference: tx.reference,
        bookingRef: tx.bookingRef,
        amountKobo: effectiveAmount,
        currency: tx.currency,
        gatewayStatus: "success",
        paidAtIso: tx.paidAtIso,
        mismatchReason: "underpayment",
      };
    }

    if (effectiveAmount > expectedAmountKobo) {
      return {
        verified: false,
        reference: tx.reference,
        bookingRef: tx.bookingRef,
        amountKobo: effectiveAmount,
        currency: tx.currency,
        gatewayStatus: "success",
        paidAtIso: tx.paidAtIso,
        mismatchReason: "overpayment",
      };
    }

    return {
      verified: true,
      reference: tx.reference,
      bookingRef: tx.bookingRef,
      amountKobo: effectiveAmount,
      currency: tx.currency,
      gatewayStatus: "success",
      paidAtIso: tx.paidAtIso,
    };
  }

  public async processWebhookEvent(
    rawBody: string,
    signatureHeader: string | null
  ): Promise<{
    accepted: boolean;
    idempotentDuplicate: boolean;
    event?: string;
    verification?: PaymentVerificationResult;
  }> {
    if (!this.verifyWebhookSignature(rawBody, signatureHeader)) {
      return { accepted: false, idempotentDuplicate: false };
    }

    const payload = JSON.parse(rawBody) as PaystackWebhookPayload;
    if (!payload?.event || !payload?.data?.reference) {
      throw new Error("Malformed Paystack webhook payload.");
    }

    const dedupKey = `${payload.event}:${payload.data.reference}`;
    if (this.processedWebhookKeys.has(dedupKey)) {
      return { accepted: true, idempotentDuplicate: true, event: payload.event };
    }
    this.processedWebhookKeys.add(dedupKey);

    const existing = this.transactions.get(payload.data.reference);
    const refBooking = existing?.bookingRef ?? payload.data.metadata?.bookingRef ?? "UNKNOWN";

    if (payload.event === "charge.failed" || payload.data.status === "failed") {
      if (existing) {
        existing.status = "failed";
      } else {
        this.transactions.set(payload.data.reference, {
          reference: payload.data.reference,
          bookingRef: refBooking,
          customerEmail: "webhook@shortletconnect.ng",
          amountKobo: payload.data.amount,
          paidAmountKobo: payload.data.amount,
          currency: payload.data.currency,
          status: "failed",
        });
      }
      return {
        accepted: true,
        idempotentDuplicate: false,
        event: payload.event,
        verification: {
          verified: false,
          reference: payload.data.reference,
          bookingRef: refBooking,
          amountKobo: payload.data.amount,
          currency: payload.data.currency,
          gatewayStatus: "failed",
          mismatchReason: "not_paid",
        },
      };
    }

    if (payload.event === "charge.success" && payload.data.status === "success") {
      if (existing) {
        existing.status = "success";
        existing.paidAmountKobo = payload.data.amount;
        existing.currency = payload.data.currency;
        existing.paidAtIso = payload.data.paid_at ?? new Date().toISOString();
      } else {
        this.transactions.set(payload.data.reference, {
          reference: payload.data.reference,
          bookingRef: refBooking,
          customerEmail: "webhook@shortletconnect.ng",
          amountKobo: payload.data.amount,
          paidAmountKobo: payload.data.amount,
          currency: payload.data.currency,
          status: "success",
          paidAtIso: payload.data.paid_at ?? new Date().toISOString(),
        });
      }

      const tx = this.transactions.get(payload.data.reference)!;
      return {
        accepted: true,
        idempotentDuplicate: false,
        event: payload.event,
        verification: {
          verified: tx.currency === "NGN",
          reference: tx.reference,
          bookingRef: tx.bookingRef,
          amountKobo: tx.paidAmountKobo ?? tx.amountKobo,
          currency: tx.currency,
          gatewayStatus: "success",
          paidAtIso: tx.paidAtIso,
        },
      };
    }

    return { accepted: true, idempotentDuplicate: false, event: payload.event };
  }

  public async listGatewayTransactions(): Promise<StoredSandboxTx[]> {
    return Array.from(this.transactions.values()).map((t) => ({ ...t }));
  }

  public resetForTests(): void {
    this.transactions.clear();
    this.processedWebhookKeys.clear();
  }
}

declare global {
  var __shortletPaystackAdapter: SandboxPaystackAdapter | undefined;
  var __shortletLivePaystackAdapter: LivePaystackAdapter | undefined;
}

export const paystackAdapter =
  globalThis.__shortletPaystackAdapter ??
  (globalThis.__shortletPaystackAdapter = new SandboxPaystackAdapter());

/**
 * Returns the active PaymentProvider:
 * - LivePaystackAdapter when real `PAYSTACK_SECRET_KEY` (`sk_live_` or real `sk_test_`) is configured
 * - SandboxPaystackAdapter otherwise (offline tests & dev preview)
 */
export function getActivePaymentProvider(): PaymentProvider {
  const mode = getPaystackMode();
  if (mode === "live" || mode === "test_api") {
    if (!globalThis.__shortletLivePaystackAdapter) {
      globalThis.__shortletLivePaystackAdapter = new LivePaystackAdapter(
        process.env.PAYSTACK_SECRET_KEY!.trim(),
        mode
      );
    }
    return globalThis.__shortletLivePaystackAdapter;
  }
  return paystackAdapter;
}
