import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecretBase32(numBytes = 20): string {
  const bytes = crypto.randomBytes(numBytes);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error("Invalid Base32 TOTP secret.");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Generates an RFC 6238 6-digit TOTP code for a given Base32 secret and timestamp.
 */
export function generateTotpCode(
  secretBase32: string,
  nowMs = Date.now(),
  stepSeconds = 30
): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(nowMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

/**
 * Verifies a 6-digit TOTP code in constant time with ±1 step clock-drift window.
 * Used to enforce Super Admin MFA (Task 5 #4).
 */
export function verifyTotpCode(
  secretBase32: string,
  suppliedCode: string,
  nowMs = Date.now(),
  stepSeconds = 30,
  windowSteps = 1
): boolean {
  const clean = suppliedCode.trim();
  if (!/^\d{6}$/.test(clean)) return false;

  const suppliedBuf = Buffer.from(clean, "utf8");
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const expected = generateTotpCode(
      secretBase32,
      nowMs + delta * stepSeconds * 1000,
      stepSeconds
    );
    const expectedBuf = Buffer.from(expected, "utf8");
    if (
      suppliedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(suppliedBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}
