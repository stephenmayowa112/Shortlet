/**
 * Structured JSON logger with automatic PII & secret redaction (Task 8).
 * Ensures phone numbers, emails, OTP codes, session tokens, API keys, and
 * owner contacts are never written to application logs.
 */
const REDACTED_KEYS = new Set([
  "email",
  "phone",
  "contact",
  "customercontact",
  "legalownerphone",
  "legalowneremail",
  "propertymanagerphone",
  "password",
  "secret",
  "token",
  "sessiontoken",
  "authorization",
  "cookie",
  "code",
  "otp",
  "totp",
  "totpsecret",
  "totpsecretbase32",
  "apikey",
  "paystacksecretkey",
  "privateiddocref",
  "x-paystack-signature",
]);

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Redact inline email addresses and Nigerian/international phone numbers
    return value
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
      .replace(/\+?\d[\d\s-]{8,16}\d/g, "[REDACTED_PHONE]");
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeValue(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export type LogLevel = "info" | "warn" | "error";

export function logStructured(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "shortlet-connect-v1",
    event,
    ...(sanitizeValue(context) as Record<string, unknown>),
  };

  if (process.env.NODE_ENV !== "test") {
    const serialized = JSON.stringify(entry);
    if (level === "error") console.error(serialized);
    else if (level === "warn") console.warn(serialized);
    else console.info(serialized);
  }
  return entry;
}

export function logInfo(event: string, context: Record<string, unknown> = {}) {
  return logStructured("info", event, context);
}

export function logWarn(event: string, context: Record<string, unknown> = {}) {
  return logStructured("warn", event, context);
}

export function logError(event: string, context: Record<string, unknown> = {}) {
  return logStructured("error", event, context);
}

