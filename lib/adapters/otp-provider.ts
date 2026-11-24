import crypto from "crypto";

export interface OtpChallengeRecord {
  challengeId: string;
  contact: string;
  channel: "email" | "sms";
  purpose: "customer_bookings" | "partner_verification";
  codeHash: string;
  attemptsRemaining: number;
  expiresAtMs: number;
  consumed: boolean;
  createdAtMs: number;
}

export interface VerifiedOtpSession {
  sessionToken: string;
  contact: string;
  purpose: "customer_bookings" | "partner_verification";
  verifiedAtIso: string;
  expiresAtIso: string;
}

const MAX_ATTEMPTS = 3;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

function normalizeContact(contact: string): string {
  return contact.trim().toLowerCase();
}

function hashCode(challengeId: string, code: string): string {
  return crypto
    .createHash("sha256")
    .update(`${challengeId}:${code.trim()}`)
    .digest("hex");
}

/**
 * Time-limited, single-use, attempt-limited, rate-limited OTP engine (CUST-02, PART-08).
 * OTP verifies channel control only — never identity or listing authority.
 */
export class OtpService {
  private challenges = new Map<string, OtpChallengeRecord>();
  private sessions = new Map<string, VerifiedOtpSession>();
  private requestTimestamps = new Map<string, number[]>();

  public requestOtp(params: {
    contact: string;
    channel: "email" | "sms";
    purpose: "customer_bookings" | "partner_verification";
    nowMs?: number;
  }): { challengeId: string; expiresAtIso: string; sandboxPreviewCode: string } {
    const now = params.nowMs ?? Date.now();
    const normalized = normalizeContact(params.contact);

    if (normalized.length < 5) {
      throw new Error("Please enter a valid email address or Nigerian phone number.");
    }

    // Rate limiting
    const recent = (this.requestTimestamps.get(normalized) ?? []).filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      throw new Error("Too many verification code requests. Please wait a minute and try again.");
    }
    recent.push(now);
    this.requestTimestamps.set(normalized, recent);

    const challengeId = `otp_${crypto.randomBytes(12).toString("hex")}`;
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAtMs = now + OTP_TTL_MS;

    this.challenges.set(challengeId, {
      challengeId,
      contact: normalized,
      channel: params.channel,
      purpose: params.purpose,
      codeHash: hashCode(challengeId, code),
      attemptsRemaining: MAX_ATTEMPTS,
      expiresAtMs,
      consumed: false,
      createdAtMs: now,
    });

    return {
      challengeId,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      sandboxPreviewCode: code,
    };
  }

  public verifyOtp(params: {
    challengeId: string;
    code: string;
    nowMs?: number;
  }): { ok: true; session: VerifiedOtpSession } | { ok: false; error: string } {
    const now = params.nowMs ?? Date.now();
    const record = this.challenges.get(params.challengeId);

    if (!record) {
      return { ok: false, error: "Verification challenge not found. Request a new code." };
    }
    if (record.consumed) {
      return { ok: false, error: "This verification code has already been used." };
    }
    if (now > record.expiresAtMs) {
      record.consumed = true;
      return { ok: false, error: "Verification code expired. Please request a new code." };
    }
    if (record.attemptsRemaining <= 0) {
      record.consumed = true;
      return { ok: false, error: "Maximum verification attempts exceeded. Request a new code." };
    }

    const suppliedHash = hashCode(record.challengeId, params.code);
    const valid = crypto.timingSafeEqual(
      Buffer.from(record.codeHash, "hex"),
      Buffer.from(suppliedHash, "hex")
    );

    if (!valid) {
      record.attemptsRemaining -= 1;
      if (record.attemptsRemaining <= 0) {
        record.consumed = true;
        return { ok: false, error: "Invalid code. Maximum attempts reached; request a new code." };
      }
      return {
        ok: false,
        error: `Invalid verification code. ${record.attemptsRemaining} attempt(s) remaining.`,
      };
    }

    // Single-use invalidation
    record.consumed = true;
    const sessionToken = `sc_sess_${crypto.randomBytes(20).toString("hex")}`;
    const session: VerifiedOtpSession = {
      sessionToken,
      contact: record.contact,
      purpose: record.purpose,
      verifiedAtIso: new Date(now).toISOString(),
      expiresAtIso: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    };
    this.sessions.set(sessionToken, session);
    return { ok: true, session };
  }

  public validateSession(sessionToken: string, nowMs = Date.now()): VerifiedOtpSession | null {
    const session = this.sessions.get(sessionToken);
    if (!session) return null;
    if (nowMs > new Date(session.expiresAtIso).getTime()) {
      this.sessions.delete(sessionToken);
      return null;
    }
    return session;
  }
}

export const otpService = new OtpService();
