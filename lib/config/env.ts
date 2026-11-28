/**
 * Centralized server-side environment & production-readiness configuration (no secrets exposed).
 */

export interface AdapterReadiness {
  paystackMode: "live" | "test_api" | "sandbox_mock";
  smsOtpMode: "termii_live" | "sandbox_mock";
  emailOtpMode: "resend_live" | "sandbox_mock";
  whatsappWebhookConfigured: boolean;
  whatsappOutboundConfigured: boolean;
  cronSecretConfigured: boolean;
  sessionSecretConfigured: boolean;
  idDocEncryptionConfigured: boolean;
  demoSeedEnabled: boolean;
  videoWatermarkEnabled: boolean;
  databaseMode: "in_memory_starter_tier" | "postgres_url_configured";
}

const PLACEHOLDER_TOKENS = [
  "replace_with",
  "sk_test_sandbox_shortlet_connect",
  "dev_reconciliation_cron_secret_local",
];

function isRealSecret(value: string | undefined, minLength = 16): boolean {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < minLength) return false;
  return !PLACEHOLDER_TOKENS.some((p) => trimmed.includes(p));
}

export function getPaystackMode(): "live" | "test_api" | "sandbox_mock" {
  if (process.env.PAYSTACK_MODE === "sandbox") return "sandbox_mock";
  const key = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_live_") && isRealSecret(key, 24)) return "live";
  if (key.startsWith("sk_test_") && isRealSecret(key, 24)) return "test_api";
  return "sandbox_mock";
}

export function getCanonicalAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Fallback below
    }
  }
  return "https://shortletconnect.ng";
}

export function getAdapterReadiness(): AdapterReadiness {
  return {
    paystackMode: getPaystackMode(),
    smsOtpMode: isRealSecret(process.env.TERMII_API_KEY, 12) ? "termii_live" : "sandbox_mock",
    emailOtpMode: isRealSecret(process.env.RESEND_API_KEY, 12) ? "resend_live" : "sandbox_mock",
    whatsappWebhookConfigured:
      isRealSecret(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, 12) &&
      isRealSecret(process.env.WHATSAPP_APP_SECRET, 12),
    whatsappOutboundConfigured:
      isRealSecret(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN, 20) &&
      Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    cronSecretConfigured: isRealSecret(process.env.RECONCILIATION_CRON_SECRET, 24),
    sessionSecretConfigured: isRealSecret(process.env.SESSION_SECRET, 32),
    idDocEncryptionConfigured: /^[0-9a-fA-F]{64}$/.test(
      process.env.ID_DOC_ENCRYPTION_KEY?.trim() ?? ""
    ),
    demoSeedEnabled:
      process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true",
    videoWatermarkEnabled: process.env.VIDEO_WATERMARK_ENABLED === "true",
    databaseMode: process.env.DATABASE_URL?.trim()
      ? "postgres_url_configured"
      : "in_memory_starter_tier",
  };
}

/**
 * Validates required production security secrets and returns missing/weak item names.
 * Never returns actual secret values.
 */
export function validateProductionReadiness(): {
  readyForLiveMoney: boolean;
  missingCriticalSecrets: string[];
  warnings: string[];
  readiness: AdapterReadiness;
} {
  const readiness = getAdapterReadiness();
  const missingCriticalSecrets: string[] = [];
  const warnings: string[] = [];

  if (!readiness.sessionSecretConfigured) {
    missingCriticalSecrets.push("SESSION_SECRET (min 32 random chars)");
  }
  if (!readiness.cronSecretConfigured) {
    missingCriticalSecrets.push("RECONCILIATION_CRON_SECRET (min 24 random chars)");
  }
  if (!readiness.idDocEncryptionConfigured) {
    missingCriticalSecrets.push("ID_DOC_ENCRYPTION_KEY (64 hex chars / 32 bytes AES-256)");
  }
  if (readiness.paystackMode === "sandbox_mock") {
    missingCriticalSecrets.push("PAYSTACK_SECRET_KEY (real sk_live_ or sk_test_ key)");
  }
  if (readiness.smsOtpMode === "sandbox_mock" && readiness.emailOtpMode === "sandbox_mock") {
    missingCriticalSecrets.push("TERMII_API_KEY and/or RESEND_API_KEY for OTP delivery");
  }
  if (readiness.databaseMode === "in_memory_starter_tier") {
    missingCriticalSecrets.push(
      "Persistent production database (upgrade GCP Starter Tier or configure DATABASE_URL)"
    );
  }

  if (readiness.demoSeedEnabled && process.env.NODE_ENV === "production") {
    warnings.push("NEXT_PUBLIC_ENABLE_DEMO_SEED is enabled in production.");
  }
  if (!readiness.whatsappWebhookConfigured) {
    warnings.push("WhatsApp Cloud API webhook secrets are not configured (deep links still work).");
  }

  return {
    readyForLiveMoney: missingCriticalSecrets.length === 0,
    missingCriticalSecrets,
    warnings,
    readiness,
  };
}
