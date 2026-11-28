import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { otpService } from "../lib/adapters/otp-provider";
import { getRepositories, resetRepositoriesForTests } from "../lib/repositories";
import { generateTotpCode, generateTotpSecretBase32 } from "../lib/security/mfa";
import { getRateLimiter } from "../lib/security/rate-limit";
import { createServerSession } from "../lib/security/session";
import { POST as otpRequestPost } from "../app/api/otp/request/route";
import { POST as otpVerifyPost } from "../app/api/otp/verify/route";
import { GET as customerBookingsGet } from "../app/api/customer/bookings/route";
import { POST as mfaVerifyPost } from "../app/api/admin/mfa/verify/route";
import { POST as suspendPost } from "../app/api/admin/users/suspend/route";
import { GET as protectedAdminGet } from "../app/api/admin/protected/route";
import { POST as enquiryPost } from "../app/api/enquiries/route";

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function runTests() {
  resetRepositoriesForTests();
  otpService.resetForTests();
  getRateLimiter().reset();

  // -------------------------------------------------------------------------
  // 1. OTP security: hashed storage, expiry, reuse, lockout, wrong-contact, rate limit (Task 5 #2)
  // -------------------------------------------------------------------------
  const baseMs = Date.UTC(2027, 0, 1, 12, 0, 0);
  const issued = otpService.requestOtp({
    contact: "+2348091112222",
    channel: "sms",
    purpose: "customer_bookings",
    clientIp: "10.0.0.1",
    nowMs: baseMs,
  });

  // Confirm plaintext code is NOT stored in record
  const stored = otpService.getStoredChallengeForAudit(issued.challengeId);
  assert.ok(stored);
  assert.notEqual(stored.codeHash, issued.sandboxPreviewCode);
  assert.equal(stored.codeHash.includes(issued.sandboxPreviewCode), false);
  assert.equal(stored.codeHash.length, 64, "Salted HMAC-SHA256 hex digest expected");

  // Wrong-contact verification MUST fail even with the valid code
  const wrongContact = otpService.verifyOtp({
    challengeId: issued.challengeId,
    code: issued.sandboxPreviewCode,
    contact: "+2348099999999",
    nowMs: baseMs + 10_000,
  });
  assert.equal(wrongContact.ok, false, "Wrong contact must be rejected");

  // Valid single-use verification succeeds once, then reuse fails
  const firstUse = otpService.verifyOtp({
    challengeId: issued.challengeId,
    code: issued.sandboxPreviewCode,
    contact: "+2348091112222",
    nowMs: baseMs + 15_000,
  });
  assert.equal(firstUse.ok, true);

  const reuse = otpService.verifyOtp({
    challengeId: issued.challengeId,
    code: issued.sandboxPreviewCode,
    contact: "+2348091112222",
    nowMs: baseMs + 20_000,
  });
  assert.equal(reuse.ok, false, "OTP reuse MUST fail");

  // Expiry after 5 minutes
  const expIssued = otpService.requestOtp({
    contact: "expire@example.com",
    channel: "email",
    purpose: "customer_bookings",
    clientIp: "10.0.0.2",
    nowMs: baseMs,
  });
  const afterExpiry = otpService.verifyOtp({
    challengeId: expIssued.challengeId,
    code: expIssued.sandboxPreviewCode,
    nowMs: baseMs + 5 * 60 * 1000 + 1,
  });
  assert.equal(afterExpiry.ok, false, "Expired OTP MUST fail");

  // Attempt lockout after 3 wrong guesses
  const lockIssued = otpService.requestOtp({
    contact: "lock@example.com",
    channel: "email",
    purpose: "customer_bookings",
    clientIp: "10.0.0.3",
    nowMs: baseMs,
  });
  for (let i = 0; i < 3; i++) {
    const bad = otpService.verifyOtp({
      challengeId: lockIssued.challengeId,
      code: "000000",
      nowMs: baseMs + 1000 * (i + 1),
    });
    assert.equal(bad.ok, false);
  }
  // Even correct code fails once locked
  const afterLock = otpService.verifyOtp({
    challengeId: lockIssued.challengeId,
    code: lockIssued.sandboxPreviewCode,
    nowMs: baseMs + 5000,
  });
  assert.equal(afterLock.ok, false, "Locked OTP MUST reject even the right code");

  // Per-contact rate limit (max 5/min)
  for (let i = 0; i < 5; i++) {
    otpService.requestOtp({
      contact: "spam@example.com",
      channel: "email",
      purpose: "customer_bookings",
      clientIp: `10.1.0.${i}`,
      nowMs: baseMs + i * 100,
    });
  }
  assert.throws(
    () =>
      otpService.requestOtp({
        contact: "spam@example.com",
        channel: "email",
        purpose: "customer_bookings",
        clientIp: "10.1.0.99",
        nowMs: baseMs + 1000,
      }),
    /Too many/
  );

  // Per-IP rate limit (max 10/min across distinct contacts)
  for (let i = 0; i < 10; i++) {
    otpService.requestOtp({
      contact: `user${i}@example.com`,
      channel: "email",
      purpose: "customer_bookings",
      clientIp: "203.0.113.55",
      nowMs: baseMs + i * 100,
    });
  }
  assert.throws(
    () =>
      otpService.requestOtp({
        contact: "user11@example.com",
        channel: "email",
        purpose: "customer_bookings",
        clientIp: "203.0.113.55",
        nowMs: baseMs + 2000,
      }),
    /network/
  );
  console.log("PASS [unit]: OTP salted hash, expiry, single-use, lockout, wrong-contact, per-contact & per-IP rate limits verified");

  // -------------------------------------------------------------------------
  // 2. Customer bookings access requires verified OTP HttpOnly session (Task 5 #3)
  // -------------------------------------------------------------------------
  const repos = getRepositories();
  await repos.bookings.saveBooking({
    bookingRef: "SC-CUST-A-01",
    listingId: "LST-1",
    listingTitle: "Ikoyi Residence",
    category: "apartment",
    customerName: "Chidi Customer",
    customerContact: "chidi@example.com",
    startIso: "2027-04-01T14:00:00.000Z",
    endIso: "2027-04-03T11:00:00.000Z",
    units: 2,
    status: "confirmed",
    rentalPrincipalKobo: 20_000_000,
    serviceChargeKobo: 6_000_000,
    cautionFeeKobo: 5_000_000,
    extrasKobo: 0,
    customerTotalKobo: 31_000_000,
    currency: "NGN",
    paymentVerified: true,
    cautionDepositStatus: "collected",
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Phone / bookingRef alone without verified session MUST return 401 and expose nothing
  const unauthLookup = await customerBookingsGet(
    new NextRequest(
      "http://localhost:3000/api/customer/bookings?phone=chidi@example.com&bookingRef=SC-CUST-A-01"
    )
  );
  assert.equal(unauthLookup.status, 401);

  // Non-enumerating OTP request via HTTP route
  const reqKnown = await otpRequestPost(
    jsonReq(
      "http://localhost:3000/api/otp/request",
      { contact: "chidi@example.com", channel: "email", purpose: "customer_bookings" },
      { "x-forwarded-for": "198.51.100.10" }
    )
  );
  const reqUnknown = await otpRequestPost(
    jsonReq(
      "http://localhost:3000/api/otp/request",
      { contact: "nobody@example.com", channel: "email", purpose: "customer_bookings" },
      { "x-forwarded-for": "198.51.100.11" }
    )
  );
  assert.equal(reqKnown.status, 200);
  assert.equal(reqUnknown.status, 200);
  const knownJson = (await reqKnown.json()) as {
    challengeId: string;
    message: string;
    sandboxPreviewCode: string;
  };
  const unknownJson = (await reqUnknown.json()) as {
    challengeId: string;
    message: string;
    sandboxPreviewCode: string;
  };
  assert.equal(knownJson.message, unknownJson.message, "OTP request MUST NOT enumerate accounts");

  // Verify OTP via HTTP route -> sets HttpOnly; Secure; SameSite=None; Partitioned cookie
  const verifyRes = await otpVerifyPost(
    jsonReq(
      "http://localhost:3000/api/otp/verify",
      {
        challengeId: knownJson.challengeId,
        code: knownJson.sandboxPreviewCode,
        contact: "chidi@example.com",
      },
      { "x-forwarded-for": "198.51.100.10" }
    )
  );
  assert.equal(verifyRes.status, 200);
  const setCookie = verifyRes.headers.get("set-cookie") ?? "";
  assert.ok(setCookie.includes("HttpOnly"), "Session cookie must be HttpOnly");
  assert.ok(setCookie.includes("Secure"), "Session cookie must be Secure");
  assert.ok(setCookie.includes("sc_session="), "Session cookie must be set");

  const cookiePair = setCookie.split(";")[0];

  // Verified customer A fetches own booking
  const ownBookingsRes = await customerBookingsGet(
    new NextRequest("http://localhost:3000/api/customer/bookings?bookingRef=SC-CUST-A-01", {
      headers: { cookie: cookiePair },
    })
  );
  assert.equal(ownBookingsRes.status, 200);
  const ownData = (await ownBookingsRes.json()) as { bookings: Array<{ bookingRef: string }> };
  assert.equal(ownData.bookings.length, 1);
  assert.equal(ownData.bookings[0].bookingRef, "SC-CUST-A-01");

  // Verified customer B (nobody@example.com) CANNOT see Chidi's booking even knowing SC-CUST-A-01!
  const verifyOther = await otpVerifyPost(
    jsonReq(
      "http://localhost:3000/api/otp/verify",
      {
        challengeId: unknownJson.challengeId,
        code: unknownJson.sandboxPreviewCode,
        contact: "nobody@example.com",
      },
      { "x-forwarded-for": "198.51.100.11" }
    )
  );
  const otherCookie = (verifyOther.headers.get("set-cookie") ?? "").split(";")[0];
  const otherLookup = await customerBookingsGet(
    new NextRequest("http://localhost:3000/api/customer/bookings?bookingRef=SC-CUST-A-01", {
      headers: { cookie: otherCookie },
    })
  );
  assert.equal(otherLookup.status, 200);
  const otherData = (await otherLookup.json()) as { bookings: unknown[] };
  assert.equal(otherData.bookings.length, 0, "Another customer MUST see zero bookings for SC-CUST-A-01");
  console.log("PASS [integration:route-harness]: Customer bookings blocked without OTP cookie, HttpOnly cookie set, cross-customer isolation proven");

  // -------------------------------------------------------------------------
  // 3. Super Admin MFA enforcement & immediate suspension revocation (Task 5 #4 & #5)
  // -------------------------------------------------------------------------
  const secretBase32 = generateTotpSecretBase32();
  await repos.users.saveUser({
    uid: "sa_root",
    role: "super_admin",
    status: "active",
    displayName: "Root Super Admin",
    email: "root@shortletconnect.ng",
    mfaEnforced: true,
    totpSecretBase32: secretBase32,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await repos.users.saveUser({
    uid: "ops_target",
    role: "operational_admin",
    status: "active",
    displayName: "Ops Admin",
    email: "ops@shortletconnect.ng",
    mfaEnforced: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Super Admin session BEFORE MFA verification MUST be rejected with 403 MFA_REQUIRED
  const saSess = createServerSession({
    uid: "sa_root",
    role: "super_admin",
    verifiedContact: "root@shortletconnect.ng",
    mfaVerified: false,
  });
  const preMfaRes = await protectedAdminGet(
    new NextRequest("http://localhost:3000/api/admin/protected", {
      headers: { authorization: `Bearer ${saSess.token}` },
    })
  );
  assert.equal(preMfaRes.status, 403);
  const preMfaJson = (await preMfaRes.json()) as { code: string };
  assert.equal(preMfaJson.code, "MFA_REQUIRED");

  // Verify TOTP code via /api/admin/mfa/verify
  const validTotp = generateTotpCode(secretBase32);
  const mfaRes = await mfaVerifyPost(
    jsonReq(
      "http://localhost:3000/api/admin/mfa/verify",
      { totpCode: validTotp },
      { authorization: `Bearer ${saSess.token}`, "x-forwarded-for": "198.51.100.20" }
    )
  );
  assert.equal(mfaRes.status, 200);

  // Now protected Super Admin route succeeds
  const postMfaRes = await protectedAdminGet(
    new NextRequest("http://localhost:3000/api/admin/protected", {
      headers: { authorization: `Bearer ${saSess.token}` },
    })
  );
  assert.equal(postMfaRes.status, 200);

  // Create active session for ops_target, then suspend ops_target -> session revoked immediately!
  const opsSess = createServerSession({
    uid: "ops_target",
    role: "operational_admin",
    verifiedContact: "ops@shortletconnect.ng",
    mfaVerified: false,
  });
  const suspendRes = await suspendPost(
    jsonReq(
      "http://localhost:3000/api/admin/users/suspend",
      {
        targetUid: "ops_target",
        status: "suspended",
        reason: "Policy breach immediate revocation test",
      },
      { authorization: `Bearer ${saSess.token}` }
    )
  );
  assert.equal(suspendRes.status, 200);
  const suspendJson = (await suspendRes.json()) as { revokedSessions: number };
  assert.equal(suspendJson.revokedSessions, 1, "Active ops_target session MUST be revoked immediately");

  // Suspended user's existing token is immediately rejected
  const opsAfterSuspend = await customerBookingsGet(
    new NextRequest("http://localhost:3000/api/customer/bookings", {
      headers: { authorization: `Bearer ${opsSess.token}` },
    })
  );
  assert.equal(opsAfterSuspend.status, 401);
  const opsErrJson = (await opsAfterSuspend.json()) as { code: string };
  assert.equal(opsErrJson.code, "REVOKED");
  console.log("PASS [integration:route-harness]: Super Admin TOTP MFA enforcement & immediate session revocation on suspension verified");

  // -------------------------------------------------------------------------
  // 4. Rate limiting on enquiry endpoint (Task 5 #6)
  // -------------------------------------------------------------------------
  let rateLimited = false;
  for (let i = 0; i < 12; i++) {
    const res = await enquiryPost(
      jsonReq(
        "http://localhost:3000/api/enquiries",
        {
          listingId: "LST-1",
          listingTitle: "Lekki Villa",
          category: "apartment",
          customerName: "Guest",
          customerPhone: "+2348012345678",
        },
        { "x-forwarded-for": "198.51.100.77" }
      )
    );
    if (res.status === 429) {
      rateLimited = true;
      break;
    }
  }
  assert.equal(rateLimited, true, "Enquiry endpoint MUST enforce per-IP rate limiting (429)");
  console.log("PASS [integration:route-harness]: Enquiry endpoint rate limiting (429) verified");

  console.log("ALL AUTH, OTP, MFA, SUSPENSION & RATE-LIMITING TESTS PASSED.");
}

runTests().catch((err) => {
  console.error("AUTH/OTP TEST FAILURE:", err);
  process.exit(1);
});
