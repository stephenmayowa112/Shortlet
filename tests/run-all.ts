import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

import {
  calculateCustomerQuote,
  calculateStaffQuote,
  computeHalfOpenNights,
  formatNairaFromKobo,
} from "../lib/domain/pricing";
import { transitionBookingStatus } from "../lib/domain/booking-lifecycle";
import { filterPublicListings } from "../lib/domain/search";
import { detectPotentialDuplicates } from "../lib/domain/duplicate-detection";
import {
  toCustomerBookingView,
  toOperationalAdminListing,
  toPublicListing,
} from "../lib/domain/privacy";
import { buildWhatsAppDeepLink } from "../lib/domain/whatsapp";
import { AtomicAvailabilityLockStore } from "../lib/domain/availability";
import { SandboxPaystackAdapter } from "../lib/adapters/payment-provider";
import { SandboxWhatsAppAdapter } from "../lib/adapters/whatsapp-provider";
import { SharpMediaProcessor } from "../lib/adapters/media-processor";
import { OtpService } from "../lib/adapters/otp-provider";
import {
  INITIAL_BOOKINGS,
  INITIAL_FEATURE_CATALOGUE,
  INITIAL_PRIVATE_LISTINGS,
} from "../lib/seed-data";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS: ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error: message });
    console.error(`FAIL: ${name}\n  -> ${message}`);
  }
}

async function runAll() {
  // 1. PRICE-01 & PRICE-02 — All 7 required integer-kobo calculations + customer allow-list check
  await test("PRICE-01: 3 apartment nights = ₦90,000 service charge (integer kobo) + internal split sums exactly", () => {
    const staff = calculateStaffQuote({
      category: "apartment",
      quantity: 3,
      unitRateKobo: 25_000_000, // ₦250,000/night
      cautionFeeKobo: 10_000_000, // ₦100,000
    });
    assert.equal(staff.chargeableUnits, 3);
    assert.equal(staff.serviceChargeKobo, 9_000_000); // ₦90,000
    assert.equal(formatNairaFromKobo(staff.serviceChargeKobo), "₦90,000");
    assert.equal(
      staff.internalAllocations.coordinatingAdminKobo +
        staff.internalAllocations.founderKobo +
        staff.internalAllocations.adsAndOpsKobo,
      staff.serviceChargeKobo
    );
    assert.equal(staff.internalAllocations.coordinatingAdminKobo, 3_000_000);
    assert.equal(staff.customerTotalKobo, 75_000_000 + 9_000_000 + 10_000_000);

    // Customer quote MUST NOT contain internalAllocations
    const customer = calculateCustomerQuote({
      category: "apartment",
      quantity: 3,
      unitRateKobo: 25_000_000,
      cautionFeeKobo: 10_000_000,
    });
    assert.equal("internalAllocations" in customer, false);
    assert.equal(customer.serviceChargeKobo, 9_000_000);
  });

  await test("PRICE-01: Car 12h = 1 unit (₦30k), Car 24h = 1 unit (₦30k), Car 3 days = 3 units (₦90k)", () => {
    const car12 = calculateCustomerQuote({
      category: "car",
      quantity: 12,
      carUnitMode: "hours",
      unitRateKobo: 22_000_000,
    });
    assert.equal(car12.chargeableUnits, 1);
    assert.equal(car12.serviceChargeKobo, 3_000_000);

    const car24 = calculateCustomerQuote({
      category: "car",
      quantity: 24,
      carUnitMode: "hours",
      unitRateKobo: 35_000_000,
    });
    assert.equal(car24.chargeableUnits, 1);
    assert.equal(car24.serviceChargeKobo, 3_000_000);

    const car3d = calculateCustomerQuote({
      category: "car",
      quantity: 3,
      carUnitMode: "days",
      unitRateKobo: 35_000_000,
    });
    assert.equal(car3d.chargeableUnits, 3);
    assert.equal(car3d.serviceChargeKobo, 9_000_000);
  });

  await test("PRICE-01: Boat 3h = ₦60,000, Boat 4h = ₦60,000, Boat 5h = ₦90,000", () => {
    const b3 = calculateCustomerQuote({
      category: "boat",
      quantity: 3,
      unitRateKobo: 18_000_000,
    });
    const b4 = calculateCustomerQuote({
      category: "boat",
      quantity: 4,
      unitRateKobo: 18_000_000,
    });
    const b5 = calculateCustomerQuote({
      category: "boat",
      quantity: 5,
      unitRateKobo: 18_000_000,
    });
    assert.equal(b3.serviceChargeKobo, 6_000_000);
    assert.equal(b4.serviceChargeKobo, 6_000_000);
    assert.equal(b5.serviceChargeKobo, 9_000_000);
  });

  // 2. INVARIANT 1 & 2: Public Exposure & Operational Admin Privacy Allow-Lists
  await test("Invariant 1 & 2: toPublicListing excludes pending listings and strips private fields", () => {
    const pending = INITIAL_PRIVATE_LISTINGS.find((l) => l.status === "pending_review");
    assert.ok(pending, "Expected at least one seeded pending listing");
    assert.equal(toPublicListing(pending), null);

    const approved = INITIAL_PRIVATE_LISTINGS.find((l) => l.status === "approved");
    assert.ok(approved, "Expected an approved listing");
    const pub = toPublicListing(approved);
    assert.ok(pub);
    assert.equal("exactBuildingNumber" in pub, false);
    assert.equal("propertyManagerPhone" in pub, false);
    assert.equal("legalOwnerPrivateContact" in pub, false);
    assert.equal("privateOriginalMediaRefs" in pub, false);

    // Operational admin view strips legal owner private contact
    const opsView = toOperationalAdminListing(approved);
    assert.equal("legalOwnerPrivateContact" in opsView, false);

    // Customer booking view strips partnerUid / assignedAdminUid / internal ledger
    const booking = INITIAL_BOOKINGS[0];
    const custView = toCustomerBookingView(booking);
    assert.equal("partnerUid" in custView, false);
    assert.equal("internalAllocations" in custView, false);
  });

  // 3. WEB-04: Structured Apartment Search + Synonym Matching
  await test("WEB-04: Apartment search resolves 'pool' & 'private swimming pool' synonyms and never treats unspecified features as present", () => {
    const publicListings = INITIAL_PRIVATE_LISTINGS.map(toPublicListing).filter(
      (x): x is NonNullable<typeof x> => x !== null
    );

    const byPool = filterPublicListings(
      publicListings,
      { category: "apartment", keyword: "pool", location: "", selectedFeatureIds: [] },
      INITIAL_FEATURE_CATALOGUE
    );
    const bySynonym = filterPublicListings(
      publicListings,
      {
        category: "apartment",
        keyword: "private swimming pool",
        location: "",
        selectedFeatureIds: [],
      },
      INITIAL_FEATURE_CATALOGUE
    );
    assert.ok(byPool.length >= 1, "Expected pool apartment match");
    assert.deepEqual(
      byPool.map((l) => l.listingId),
      bySynonym.map((l) => l.listingId)
    );

    // Smoking allowed filter must exclude apartments where smokingAllowed !== true
    const smokingAllowed = filterPublicListings(
      publicListings,
      {
        category: "apartment",
        keyword: "smoking allowed",
        location: "",
        selectedFeatureIds: [],
      },
      INITIAL_FEATURE_CATALOGUE
    );
    for (const apt of smokingAllowed) {
      assert.equal(apt.rules?.smokingAllowed, true);
    }
  });

  // 4. PART-02: Duplicate Listing Detection
  await test("PART-02: Duplicate detection catches matching apartment address/building and vehicle/vessel IDs", () => {
    const existingApt = INITIAL_PRIVATE_LISTINGS.find((l) => l.category === "apartment")!;
    const dupAptMatches = detectPotentialDuplicates(
      {
        ...existingApt,
        listingId: "SC-APT-TEST-DUP",
      },
      INITIAL_PRIVATE_LISTINGS
    );
    assert.ok(dupAptMatches.length >= 1, "Expected duplicate match for identical apartment");

    const existingCar = INITIAL_PRIVATE_LISTINGS.find((l) => l.category === "car")!;
    const dupCarMatches = detectPotentialDuplicates(
      {
        ...existingCar,
        listingId: "SC-CAR-TEST-DUP",
        title: "Different Title Same Plate",
      },
      INITIAL_PRIVATE_LISTINGS
    );
    assert.ok(dupCarMatches.length >= 1, "Expected duplicate match for matching vehicle identifier");
  });

  // 5. MSG-03 & MSG-04: WhatsApp Deep Link + Provider Message ID Dedup
  await test("MSG-03 & MSG-04: Official WhatsApp deep link includes listing context without leaking private data and deduplicates webhooks", () => {
    const approved = toPublicListing(INITIAL_PRIVATE_LISTINGS.find((l) => l.status === "approved")!)!;
    const built = buildWhatsAppDeepLink({
      officialNumber: "+2348090007700",
      baseUrl: "https://shortletconnect.ng",
      listing: approved,
      selectedFeatureIds: ["private_pool", "ps5"],
      catalogue: INITIAL_FEATURE_CATALOGUE,
    });
    assert.ok(built.url.startsWith("https://wa.me/2348090007700?text="));
    assert.ok(built.prefilledMessage.includes(approved.listingId));
    assert.ok(built.prefilledMessage.includes(`?listing=${approved.listingId}`));
    assert.ok(built.prefilledMessage.includes("Private Pool"));
    assert.equal(built.prefilledMessage.includes("₦10,000"), false);

    const wa = new SandboxWhatsAppAdapter();
    assert.equal(wa.isDuplicateMessage("wamid.123", ["wamid.123", "wamid.456"]), true);
    assert.equal(wa.isDuplicateMessage("wamid.999", ["wamid.123"]), false);
  });

  // 6. BOOK-02 & Invariant 3: Booking FSM forbids confirmed without verified payment or Super Admin exception
  await test("BOOK-02 & Invariant 3: Booking cannot transition to confirmed without server-verified payment or Super Admin exception", () => {
    const unpaidBooking = {
      ...INITIAL_BOOKINGS[0],
      bookingRef: "SC-BK-UNPAID",
      status: "awaiting_payment" as const,
      paymentVerified: false,
    };

    assert.throws(() => {
      transitionBookingStatus({
        booking: unpaidBooking,
        to: "confirmed",
        actorUid: "ops_admin_01",
        actorRole: "operational_admin",
        reason: "Trying to confirm without verified payment",
      });
    }, /server-side verified Paystack payment/i);

    const allowedException = transitionBookingStatus({
      booking: unpaidBooking,
      to: "confirmed",
      actorUid: "super_admin_01",
      actorRole: "super_admin",
      reason: "Super Admin verified offline bank transfer receipt #TRF-998",
      superAdminException: true,
    });
    assert.equal(allowedException.status, "confirmed");
  });

  // 7. Invariant 4: Concurrency Double-Booking Prevention + Half-Open Night Adjacency
  await test("Invariant 4: Atomic concurrency lock prevents double-booking across apartments, cars & boats while allowing adjacent half-open check-out/check-in", async () => {
    const store = new AtomicAvailabilityLockStore();
    assert.equal(computeHalfOpenNights("2026-12-10", "2026-12-13"), 3);

    // Fire 5 parallel overlapping apartment lock requests — exactly 1 must win
    const aptAttempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        store.acquireHold({
          listingId: "SC-APT-101",
          category: "apartment",
          startIso: "2026-12-10T14:00:00.000Z",
          endIso: "2026-12-13T12:00:00.000Z",
          bookingRef: `SC-CONC-APT-${i}`,
          holdType: "hold",
        })
      )
    );
    assert.equal(aptAttempts.filter((r) => r.ok).length, 1);
    assert.equal(aptAttempts.filter((r) => !r.ok).length, 4);

    // Adjacent check-in on 2026-12-13 (exact check-out day) MUST succeed because nights are half-open [check-in, check-out)
    const adjacent = await store.acquireHold({
      listingId: "SC-APT-101",
      category: "apartment",
      startIso: "2026-12-13T14:00:00.000Z",
      endIso: "2026-12-15T12:00:00.000Z",
      bookingRef: "SC-CONC-APT-ADJ",
      holdType: "hold",
    });
    assert.equal(adjacent.ok, true);

    // Parallel overlapping boat slots — exactly 1 wins
    const boatAttempts = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        store.acquireHold({
          listingId: "SC-BOAT-301",
          category: "boat",
          startIso: "2026-12-14T13:00:00.000Z",
          endIso: "2026-12-14T16:00:00.000Z",
          bookingRef: `SC-CONC-BOAT-${i}`,
          holdType: "hold",
        })
      )
    );
    assert.equal(boatAttempts.filter((r) => r.ok).length, 1);

    // Parallel overlapping car slots — exactly 1 wins
    const carAttempts = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        store.acquireHold({
          listingId: "SC-CAR-201",
          category: "car",
          startIso: "2026-12-15T09:00:00.000Z",
          endIso: "2026-12-15T21:00:00.000Z",
          bookingRef: `SC-CONC-CAR-${i}`,
          holdType: "hold",
        })
      )
    );
    assert.equal(carAttempts.filter((r) => r.ok).length, 1);
  });

  // 8. FIN-01: Paystack HMAC-SHA512 Signature Verification & Webhook Idempotency
  await test("FIN-01: Paystack webhook verifies HMAC-SHA512 signature, rejects tampering, and deduplicates events", async () => {
    const adapter = new SandboxPaystackAdapter("test_secret_key_123");
    const init = await adapter.initializeTransaction({
      bookingRef: "SC-BK-PAY1",
      customerEmail: "guest@example.com",
      amountKobo: 50_000_000,
      currency: "NGN",
    });

    const payloadObj = {
      event: "charge.success",
      data: {
        reference: init.reference,
        amount: 50_000_000,
        currency: "NGN",
        status: "success",
        metadata: { bookingRef: "SC-BK-PAY1" },
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const validSig = crypto
      .createHmac("sha512", "test_secret_key_123")
      .update(rawBody)
      .digest("hex");

    assert.equal(adapter.verifyWebhookSignature(rawBody, validSig), true);
    assert.equal(adapter.verifyWebhookSignature(rawBody, "tampered_sig"), false);

    const first = await adapter.processWebhookEvent(rawBody, validSig);
    assert.equal(first.accepted, true);
    assert.equal(first.idempotentDuplicate, false);
    assert.equal(first.verification?.verified, true);

    const second = await adapter.processWebhookEvent(rawBody, validSig);
    assert.equal(second.accepted, true);
    assert.equal(second.idempotentDuplicate, true);
  });

  // 9. CUST-02 & PART-08: OTP Single-Use, Expiry & Max-Attempt Lockout
  await test("CUST-02 & PART-08: OTP is single-use and enforces max-attempt lockout", () => {
    const otp = new OtpService();
    const issued = otp.requestOtp({
      contact: "+2348012345678",
      channel: "sms",
      purpose: "customer_bookings",
    });
    assert.ok(issued.challengeId && issued.sandboxPreviewCode);

    // 3 wrong attempts trigger lockout
    for (let i = 0; i < 3; i++) {
      const bad = otp.verifyOtp({ challengeId: issued.challengeId, code: "000000" });
      assert.equal(bad.ok, false);
    }
    const locked = otp.verifyOtp({
      challengeId: issued.challengeId,
      code: issued.sandboxPreviewCode,
    });
    assert.equal(locked.ok, false);

    // Fresh contact: single-use verification succeeds once, second replay fails
    const issued2 = otp.requestOtp({
      contact: "guest2@example.com",
      channel: "email",
      purpose: "customer_bookings",
    });
    const okFirst = otp.verifyOtp({
      challengeId: issued2.challengeId,
      code: issued2.sandboxPreviewCode,
    });
    assert.equal(okFirst.ok, true);
    const replay = otp.verifyOtp({
      challengeId: issued2.challengeId,
      code: issued2.sandboxPreviewCode,
    });
    assert.equal(replay.ok, false);
  });

  // 10. MEDIA-01: Permanent Sharp Server-Side Photo Watermarking & Safe No-Agent Attribution
  await test("MEDIA-01: SharpMediaProcessor permanently burns watermark into image bytes and never invents an agent name", async () => {
    const processor = new SharpMediaProcessor();
    assert.equal(
      processor.resolveAttributionText("Wave Luxury Homes", "agent"),
      "Listed by: Wave Luxury Homes"
    );
    // Safe fallback without inventing a fake agent when no agent name exists
    assert.equal(
      processor.resolveAttributionText(null, "platform"),
      "Listed by: Shortlet Connect"
    );
    assert.equal(
      processor.resolveAttributionText("", "owner"),
      "Listed by: Verified Owner"
    );

    const samplePath = path.join(process.cwd(), "private_media", "apt_lekki_pool_villa.jpg");
    const sourceBuf = fs.existsSync(samplePath)
      ? fs.readFileSync(samplePath)
      : await sharp({
          create: { width: 800, height: 600, channels: 3, background: { r: 220, g: 215, b: 205 } },
        })
          .jpeg()
          .toBuffer();

    const watermarked = await processor.watermarkPhoto({
      sourceBuffer: sourceBuf,
      agentDisplayName: "Wave Luxury Homes",
      submitterType: "agent",
    });

    assert.ok(watermarked.byteLength > 1000);
    assert.notEqual(
      crypto.createHash("sha256").update(sourceBuf).digest("hex"),
      crypto.createHash("sha256").update(watermarked).digest("hex"),
      "Watermarked JPEG bytes must differ permanently from raw original"
    );
    const meta = await sharp(watermarked).metadata();
    assert.equal(meta.format, "jpeg");
  });

  const failed = results.filter((r) => !r.passed);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void runAll();
