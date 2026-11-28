import crypto from "node:crypto";
import type { UserRole } from "@/lib/types";
import { getRepositories } from "@/lib/repositories";

export const SESSION_COOKIE_NAME = "sc_session";
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (short-lived)

export interface ServerSessionRecord {
  sessionId: string;
  uid: string;
  role: UserRole;
  verifiedContact: string;
  mfaVerified: boolean;
  issuedAtMs: number;
  expiresAtMs: number;
  revoked: boolean;
}

declare global {
  var __shortletSessionSecret: string | undefined;
  var __shortletSessionStore: Map<string, ServerSessionRecord> | undefined;
}

function getSigningSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }
  if (!globalThis.__shortletSessionSecret) {
    globalThis.__shortletSessionSecret = crypto.randomBytes(32).toString("hex");
  }
  return globalThis.__shortletSessionSecret;
}

function getSessionStore(): Map<string, ServerSessionRecord> {
  if (!globalThis.__shortletSessionStore) {
    globalThis.__shortletSessionStore = new Map<string, ServerSessionRecord>();
  }
  return globalThis.__shortletSessionStore;
}

function signSessionId(sessionId: string): string {
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(sessionId)
    .digest("hex");
  return `${sessionId}.${sig}`;
}

function verifySignedToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [sessionId, sigHex] = parts;
  if (!sessionId || !sigHex) return null;

  const expectedHex = crypto
    .createHmac("sha256", getSigningSecret())
    .update(sessionId)
    .digest("hex");

  const a = Buffer.from(sigHex, "utf8");
  const b = Buffer.from(expectedHex, "utf8");
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? sessionId : null;
}

export function createServerSession(params: {
  uid: string;
  role: UserRole;
  verifiedContact: string;
  mfaVerified?: boolean;
  ttlMs?: number;
  nowMs?: number;
}): { token: string; record: ServerSessionRecord } {
  const nowMs = params.nowMs ?? Date.now();
  const sessionId = `sess_${crypto.randomBytes(18).toString("hex")}`;
  const record: ServerSessionRecord = {
    sessionId,
    uid: params.uid,
    role: params.role,
    verifiedContact: params.verifiedContact.trim().toLowerCase(),
    mfaVerified: Boolean(params.mfaVerified),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + (params.ttlMs ?? DEFAULT_TTL_MS),
    revoked: false,
  };
  getSessionStore().set(sessionId, record);
  return { token: signSessionId(sessionId), record };
}

export function markSessionMfaVerified(token: string): ServerSessionRecord | null {
  const sessionId = verifySignedToken(token);
  if (!sessionId) return null;
  const store = getSessionStore();
  const existing = store.get(sessionId);
  if (!existing || existing.revoked || Date.now() > existing.expiresAtMs) {
    return null;
  }
  const updated: ServerSessionRecord = { ...existing, mfaVerified: true };
  store.set(sessionId, updated);
  return updated;
}

/**
 * Immediately revokes all active server sessions for a suspended/deactivated user (Task 5 #5).
 */
export function revokeAllUserSessions(uid: string): number {
  const store = getSessionStore();
  let revokedCount = 0;
  for (const [id, rec] of store.entries()) {
    if (rec.uid === uid && !rec.revoked) {
      store.set(id, { ...rec, revoked: true });
      revokedCount++;
    }
  }
  return revokedCount;
}

export function extractSessionTokenFromRequest(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Validates session token signature, expiry, revocation, AND active account status in UsersRepository.
 */
export async function authenticateSession(
  token: string | null,
  nowMs = Date.now()
): Promise<
  | { ok: true; session: ServerSessionRecord }
  | { ok: false; code: "UNAUTHENTICATED" | "EXPIRED" | "REVOKED" | "ACCOUNT_SUSPENDED" }
> {
  if (!token) return { ok: false, code: "UNAUTHENTICATED" };
  const sessionId = verifySignedToken(token);
  if (!sessionId) return { ok: false, code: "UNAUTHENTICATED" };

  const record = getSessionStore().get(sessionId);
  if (!record) return { ok: false, code: "UNAUTHENTICATED" };
  if (record.revoked) return { ok: false, code: "REVOKED" };
  if (nowMs > record.expiresAtMs) {
    getSessionStore().delete(sessionId);
    return { ok: false, code: "EXPIRED" };
  }

  // Always check live account status so suspended accounts lose access immediately (Task 5 #5)
  const user = await getRepositories().users.getUser(record.uid);
  if (user && user.status !== "active") {
    revokeAllUserSessions(record.uid);
    return { ok: false, code: "ACCOUNT_SUSPENDED" };
  }

  return { ok: true, session: record };
}

/**
 * Requires an active Super Admin session with MFA verified (Task 5 #4).
 */
export async function requireSuperAdminWithMfa(
  headers: Headers,
  nowMs = Date.now()
): Promise<
  | { ok: true; session: ServerSessionRecord }
  | { ok: false; status: 401 | 403; error: string; code: string }
> {
  const token = extractSessionTokenFromRequest(headers);
  const authRes = await authenticateSession(token, nowMs);
  if (!authRes.ok) {
    return {
      ok: false,
      status: authRes.code === "ACCOUNT_SUSPENDED" ? 403 : 401,
      error:
        authRes.code === "ACCOUNT_SUSPENDED"
          ? "Account is suspended or deactivated."
          : "Authentication required.",
      code: authRes.code,
    };
  }
  if (authRes.session.role !== "super_admin") {
    return {
      ok: false,
      status: 403,
      error: "Super Admin privileges are required for this endpoint.",
      code: "FORBIDDEN_ROLE",
    };
  }
  if (!authRes.session.mfaVerified) {
    return {
      ok: false,
      status: 403,
      error: "Super Admin multi-factor authentication (MFA) is required.",
      code: "MFA_REQUIRED",
    };
  }
  return { ok: true, session: authRes.session };
}

/**
 * Emits hardened cookie attributes compatible with HTTPS iframe previews and modern browsers.
 */
export function buildSessionSetCookieHeader(token: string, maxAgeSeconds = 7200): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

export function buildClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`;
}

/**
 * Verifies same-origin or explicit X-Requested-With header on cookie-authenticated mutations.
 */
export function verifyMutationOrigin(headers: Headers): boolean {
  if (headers.get("x-requested-with") === "XMLHttpRequest") return true;
  const origin = headers.get("origin");
  if (!origin) return true; // Non-browser server/test caller
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}
