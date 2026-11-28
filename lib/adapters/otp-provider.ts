import crypto from "node:crypto";

export interface OtpChallengeRecord {
  challengeId: string;
  contact: string;
  channel: "email" | "sms";
  purpose: "customer_bookings" | "partner_verification";
  saltHex: string;
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
const MAX_REQUESTS_PER_CONTACT = 5;
const MAX_REQUESTS_PER_IP = 10;

function normalizeContact(contact: string): string {
  return contact.trim().toLowerCase();
}

function hashCode(saltHex: string, challengeId: string, code: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(saltHex, "hex"))
    .update(`${challengeId}:${code.trim()}`)
    .digest("hex");
}

/**
 * Time-limited, single-use, attempt-limited, contact + IP rate-limited OTP engine (Task 5 #2).
 * Codes are stored ONLY as salted HMAC-SHA256 digests and compared in constant time.
 * OTP verifies channel control only — never identity or listing authority.
 */
export class OtpService {
  private challenges = new Map<string, OtpChallengeRecord>();
  private sessions = new Map<string, VerifiedOtpSession>();
  private contactTimestamps = new Map<string, number[]>();
  private ipTimestamps = new Map<string, number[]>();

  public requestOtp(params: {
    contact: string;
    channel: "email" | "sms";
    purpose: "customer_bookings" | "partner_verification";
    clientIp?: string;
    nowMs?: number;
  }): { challengeId: string; expiresAtIso: string; sandboxPreviewCode: string } {
    const now = params.nowMs ?? Date.now();
    const normalized = normalizeContact(params.contact);

    if (normalized.length < 5) {
      throw new Error("Please enter a valid email address or Nigerian phone number.");
    }

    // Per-contact sliding-window rate limit
    const recentContact = (this.contactTimestamps.get(normalized) ?? []).filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    if (recentContact.length >= MAX_REQUESTS_PER_CONTACT) {
      throw new Error("Too many verification code requests. Please wait a minute and try again.");
    }

    // Per-IP sliding-window rate limit
    const ipKey = (params.clientIp ?? "unknown").trim();
    const recentIp = (this.ipTimestamps.get(ipKey) ?? []).filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );
    if (recentIp.length >= MAX_REQUESTS_PER_IP) {
      throw new Error("Too many verification code requests from this network. Please wait a minute.");
    }

    recentContact.push(now);
    this.contactTimestamps.set(normalized, recentContact);
    recentIp.push(now);
    this.ipTimestamps.set(ipKey, recentIp);

    const challengeId = `otp_${crypto.randomBytes(12).toString("hex")}`;
    const saltHex = crypto.randomBytes(16).toString("hex");
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAtMs = now + OTP_TTL_MS;

    this.challenges.set(challengeId, {
      challengeId,
      contact: normalized,
      channel: params.channel,
      purpose: params.purpose,
      saltHex,
      codeHash: hashCode(saltHex, challengeId, code),
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

  /** Inspection helper for tests proving plaintext codes are never persisted. */
  public getStoredChallengeForAudit(challengeId: string): OtpChallengeRecord | null {
    const rec = this.challenges.get(challengeId);
    return rec ? { ...rec } : null;
  }

  public verifyOtp(params: {
    challengeId: string;
    code: string;
    contact?: string;
    nowMs?: number;
  }): { ok: true; session: VerifiedOtpSession } | { ok: false; error: string } {
    const now = params.nowMs ?? Date.now();
    const record = this.challenges.get(params.challengeId);

    // Non-enumerating error when challenge is absent
    if (!record) {
      return { ok: false, error: "Verification failed. Request a new code and try again." };
    }

    // Enforce wrong-contact protection when caller supplies expected contact
    if (params.contact !== undefined && normalizeContact(params.contact) !== record.contact) {
      return { ok: false, error: "Verification failed. Contact does not match this code." };
    }

    if (record.consumed) {
      return { ok: false, error: "This verification code has already been used or locked." };
    }
    if (now > record.expiresAtMs) {
      record.consumed = true;
      return { ok: false, error: "Verification code expired. Please request a new code." };
    }
    if (record.attemptsRemaining <= 0) {
      record.consumed = true;
      return { ok: false, error: "Maximum verification attempts exceeded. Request a new code." };
    }

    const suppliedHash = hashCode(record.saltHex, record.challengeId, params.code);
    const a = Buffer.from(record.codeHash, "hex");
    const b = Buffer.from(suppliedHash, "hex");
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

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

  public resetForTests(): void {
    this.challenges.clear();
    this.sessions.clear();
    this.contactTimestamps.clear();
    this.ipTimestamps.clear();
  }
}

declare global {
  var __shortletOtpService: OtpService | undefined;
}

export const otpService =
  globalThis.__shortletOtpService ?? (globalThis.__shortletOtpService = new OtpService());
