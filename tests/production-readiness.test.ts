import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { GET as healthGet } from "../app/api/health/route";
import {
  GET as whatsappWebhookGet,
  POST as whatsappWebhookPost,
} from "../app/api/whatsapp/webhook/route";
import { LivePaystackAdapter } from "../lib/adapters/payment-provider";
import { deliverOtpCode } from "../lib/adapters/otp-delivery";
import { validateProductionReadiness } from "../lib/config/env";
import { getRepositories, resetRepositoriesForTests } from "../lib/repositories";
import { createServerSession } from "../lib/security/session";
import { getRateLimiter } from "../lib/security/rate-limit";

async function runTests() {
  resetRepositoriesForTests();
  getRateLimiter().reset();

  // -------------------------------------------------------------------------
  // 1. /api/health liveness & gated detailed readiness
  // -------------------------------------------------------------------------
  const publicHealth = await healthGet(new NextRequest("http://localhost:3000/api/health"));
  assert.equal(publicHealth.status, 200);
  const publicJson = (await publicHealth.json()) as Record<string, unknown>;
  assert.equal(publicJson.status, "ok");
  assert.equal("missingCriticalSecrets" in publicJson, false, "Public health must not leak config diagnostics");

  const unauthDetailed = await healthGet(
    new NextRequest("http://localhost:3000/api/health?detailed=true")
  );
  assert.equal(unauthDetailed.status, 401, "Detailed readiness requires Super Admin MFA or cron secret");

  const repos = getRepositories();
  await repos.users.saveUser({
    uid: "sa_health",
    role: "super_admin",
    status: "active",
    displayName: "Super Admin",
    email: "sa@shortletconnect.ng",
    mfaEnforced: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const mfaSess = createServerSession({
    uid: "sa_health",
    role: "super_admin",
    verifiedContact: "sa@shortletconnect.ng",
    mfaVerified: true,
  });

  const authDetailed = await healthGet(
    new NextRequest("http://localhost:3000/api/health?detailed=true", {
      headers: { authorization: `Bearer ${mfaSess.token}` },
    })
  );
  assert.equal(authDetailed.status, 200);
  const detailedJson = (await authDetailed.json()) as {
    readyForLiveMoney: boolean;
    missingCriticalSecrets: string[];
  };
  assert.equal(detailedJson.readyForLiveMoney, false, "Must honestly report missing live secrets in dev");
  assert.ok(detailedJson.missingCriticalSecrets.length > 0);
  console.log("PASS [integration:route-harness]: /api/health public liveness & MFA-gated readiness verified");

  // -------------------------------------------------------------------------
  // 2. Meta WhatsApp Cloud API webhook verification & HMAC-SHA256 ingestion
  // -------------------------------------------------------------------------
  const badChallenge = await whatsappWebhookGet(
    new NextRequest(
      "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"
    )
  );
  assert.equal(badChallenge.status, 403);

  const okChallenge = await whatsappWebhookGet(
    new NextRequest(
      "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=dev_whatsapp_verify_token_local&hub.challenge=987654"
    )
  );
  assert.equal(okChallenge.status, 200);
  assert.equal(okChallenge.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await okChallenge.text(), "987654");

  const inboundPayload = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "2348091234567", profile: { name: "Tobi Guest" } }],
              messages: [
                {
                  id: "wamid.PROD_TEST_001",
                  from: "2348091234567",
                  type: "text",
                  text: {
                    body: "Hello Shortlet Connect, Listing ID: SC-APT-101, checking availability for Dec 20-23.",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  // Invalid HMAC-SHA256 signature rejected with 401
  const badSigRes = await whatsappWebhookPost(
    new NextRequest("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=deadbeef",
        "x-forwarded-for": "198.51.100.90",
      },
      body: inboundPayload,
    })
  );
  assert.equal(badSigRes.status, 401);

  const validSig =
    "sha256=" +
    crypto
      .createHmac("sha256", "dev_whatsapp_app_secret_local")
      .update(inboundPayload, "utf8")
      .digest("hex");

  const okWebhook = await whatsappWebhookPost(
    new NextRequest("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": validSig,
        "x-forwarded-for": "198.51.100.90",
      },
      body: inboundPayload,
    })
  );
  assert.equal(okWebhook.status, 200);
  const okData = (await okWebhook.json()) as {
    createdTicketRefs: string[];
    duplicatesIgnored: number;
  };
  assert.equal(okData.createdTicketRefs.length, 1);
  assert.equal(okData.duplicatesIgnored, 0);

  const savedTicket = await repos.tickets.getTicket(okData.createdTicketRefs[0]);
  assert.ok(savedTicket);
  assert.equal(savedTicket.listingId, "SC-APT-101");

  // Replayed webhook ignored cleanly
  const replayWebhook = await whatsappWebhookPost(
    new NextRequest("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": validSig,
        "x-forwarded-for": "198.51.100.90",
      },
      body: inboundPayload,
    })
  );
  assert.equal(replayWebhook.status, 200);
  const replayData = (await replayWebhook.json()) as {
    createdTicketRefs: string[];
    duplicatesIgnored: number;
  };
  assert.equal(replayData.createdTicketRefs.length, 0);
  assert.equal(replayData.duplicatesIgnored, 1);
  console.log("PASS [integration:route-harness]: Meta WhatsApp Cloud API challenge, HMAC-SHA256 & dedup verified");

  // -------------------------------------------------------------------------
  // 3. LivePaystackAdapter signature check & OTP fail-closed production check
  // -------------------------------------------------------------------------
  const liveAdapter = new LivePaystackAdapter("sk_live_test_signing_key_1234567890", "live");
  const sampleBody = JSON.stringify({ event: "charge.success", data: { reference: "REF-1" } });
  const expectedSig = crypto
    .createHmac("sha512", "sk_live_test_signing_key_1234567890")
    .update(sampleBody, "utf8")
    .digest("hex");
  assert.equal(liveAdapter.verifyWebhookSignature(sampleBody, expectedSig), true);
  assert.equal(liveAdapter.verifyWebhookSignature(sampleBody + " ", expectedSig), false);

  const prevEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  try {
    const prodDelivery = await deliverOtpCode({
      contact: "+2348090001234",
      channel: "sms",
      code: "123456",
      purpose: "customer_bookings",
    });
    assert.equal(
      prodDelivery.delivered,
      false,
      "OTP delivery MUST fail closed in production when SMS/Email API keys are unconfigured"
    );
    const readiness = validateProductionReadiness();
    assert.equal(readiness.readyForLiveMoney, false);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
  }
  console.log("PASS [unit]: LivePaystackAdapter HMAC-SHA512 & OTP fail-closed production guard verified");

  console.log("ALL PRODUCTION READINESS TESTS PASSED.");
}

runTests().catch((err) => {
  console.error("PRODUCTION READINESS TEST FAILURE:", err);
  process.exit(1);
});
