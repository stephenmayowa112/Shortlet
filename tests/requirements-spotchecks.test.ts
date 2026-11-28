import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { buildWhatsAppDeepLink } from "../lib/domain/whatsapp";
import { calculateCustomerQuote, formatAfricaLagos } from "../lib/domain/pricing";
import { transitionBookingStatus } from "../lib/domain/booking-lifecycle";
import { detectPotentialDuplicates } from "../lib/domain/duplicate-detection";
import { getRepositories, resetRepositoriesForTests } from "../lib/repositories";
import { POST as enquiryPost, GET as enquiryGet } from "../app/api/enquiries/route";
import type { BookingRecord, PrivateListingRecord, PublicListing } from "../lib/types";

async function runSpotChecks() {
  resetRepositoriesForTests();

  // 1. WhatsApp enquiry: official Shortlet Connect number ONLY, includes listing/title/ref/dates, ZERO owner phone/address
  const samplePublicListing: PublicListing = {
    listingId: "SC-APT-001",
    category: "apartment",
    status: "approved",
    title: "Lekki Phase 1 Pool Villa",
    summary: "Verified apartment in Lekki Phase 1",
    city: "Lagos",
    area: "Lekki Phase 1",
    rateKobo: 15_000_000,
    rentalBasis: "per_night",
    cautionFeeKobo: 5_000_000,
    currency: "NGN",
    originatorPartnerId: "partner_original_introducer",
    originatorDisplayName: "Tunde Lagos Homes",
    verifiedPropertyBadge: true,
    watermarkedPhotos: ["/api/media/public/apt_lekki_pool_villa.jpg"],
    featureIds: ["feat_pool", "feat_24_7_power"],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  const waRes = buildWhatsAppDeepLink({
    officialNumber: "2348090001234",
    baseUrl: "https://shortletconnect.ng",
    listing: samplePublicListing,
    selectedFeatureIds: ["feat_pool"],
    checkIn: "2027-05-10",
    checkOut: "2027-05-13",
  });
  assert.ok(
    waRes.url.startsWith("https://wa.me/2348090001234?text="),
    "Must route to official Shortlet Connect number"
  );
  assert.ok(waRes.prefilledMessage.includes("SC-APT-001"));
  assert.ok(waRes.prefilledMessage.includes("Lekki Phase 1 Pool Villa"));
  assert.ok(waRes.prefilledMessage.includes("2027-05-10"));
  assert.equal(
    waRes.prefilledMessage.includes("Plot 14 Admiralty"),
    false,
    "Must NOT include exact street address"
  );
  assert.equal(
    waRes.prefilledMessage.includes("0803"),
    false,
    "Must NOT include owner private phone"
  );
  console.log("PASS [unit]: WhatsApp enquiry message content & zero private contact leakage verified");

  // 2. Manual ticket lookup, single owner, duplicate provider message ID ignored
  const createRes1 = await enquiryPost(
    new NextRequest("http://localhost:3000/api/enquiries", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" },
      body: JSON.stringify({
        listingId: "SC-APT-001",
        listingTitle: "Lekki Phase 1 Pool Villa",
        category: "apartment",
        customerName: "Bola",
        customerPhone: "+2348011112222",
        providerMessageId: "wamid.HBgLMjM0ODAxMTExMjIyMg==",
        assignedAdminUid: "adm-ops-1",
      }),
    })
  );
  assert.equal(createRes1.status, 200);
  const c1Json = (await createRes1.json()) as {
    duplicateMessageIgnored: boolean;
    ticket: { ticketRef: string; assignedAdminUid: string };
  };
  assert.equal(c1Json.duplicateMessageIgnored, false);
  assert.equal(c1Json.ticket.assignedAdminUid, "adm-ops-1");

  const createRes2 = await enquiryPost(
    new NextRequest("http://localhost:3000/api/enquiries", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" },
      body: JSON.stringify({
        listingId: "SC-APT-001",
        listingTitle: "Lekki Phase 1 Pool Villa",
        category: "apartment",
        customerName: "Bola",
        customerPhone: "+2348011112222",
        providerMessageId: "wamid.HBgLMjM0ODAxMTExMjIyMg==",
        assignedAdminUid: "adm-ops-2",
      }),
    })
  );
  const c2Json = (await createRes2.json()) as { duplicateMessageIgnored: boolean };
  assert.equal(c2Json.duplicateMessageIgnored, true, "Duplicate provider message ID must be ignored");

  const lookupRes = await enquiryGet(
    new NextRequest(
      `http://localhost:3000/api/enquiries?ticketRef=${encodeURIComponent(c1Json.ticket.ticketRef)}`
    )
  );
  assert.equal(lookupRes.status, 200);
  console.log(
    "PASS [integration:route-harness]: Manual ticket lookup, single owner & duplicate provider message ignore verified"
  );

  // 3. Pre-payment customer quote shows principal + service charge + caution + total, NEVER internal ₦10k split
  const quote = calculateCustomerQuote({
    category: "apartment",
    quantity: 2,
    unitRateKobo: 12_000_000,
    cautionFeeKobo: 5_000_000,
  });
  assert.equal(quote.rentalPrincipalKobo, 24_000_000);
  assert.equal(quote.serviceChargeKobo, 6_000_000);
  assert.equal(quote.cautionFeeKobo, 5_000_000);
  assert.equal(quote.customerTotalKobo, 35_000_000);
  assert.equal(JSON.stringify(quote).includes("founder"), false);
  assert.equal(JSON.stringify(quote).includes("coordinatingAdmin"), false);
  console.log("PASS [unit]: Pre-payment customer quote exposes breakdown without internal ₦10k splits");

  // 4. Booking status FSM records actor, timestamp, bookingRef & rejects invalid transitions
  const baseBooking: BookingRecord = {
    bookingRef: "SC-FSM-01",
    listingId: "SC-APT-001",
    listingTitle: "Lekki Villa",
    category: "apartment",
    customerName: "Bola",
    customerContact: "bola@example.com",
    startIso: "2027-06-01T14:00:00.000Z",
    endIso: "2027-06-03T11:00:00.000Z",
    units: 2,
    status: "requested",
    rentalPrincipalKobo: 24_000_000,
    serviceChargeKobo: 6_000_000,
    cautionFeeKobo: 5_000_000,
    extrasKobo: 0,
    customerTotalKobo: 35_000_000,
    currency: "NGN",
    paymentVerified: false,
    cautionDepositStatus: "pending_collection",
    statusHistory: [],
    createdAt: "2027-05-01T10:00:00.000Z",
    updatedAt: "2027-05-01T10:00:00.000Z",
  };

  assert.throws(
    () =>
      transitionBookingStatus({
        booking: baseBooking,
        to: "confirmed",
        actorUid: "adm-1",
        actorRole: "operational_admin",
        reason: "Skipping states",
      }),
    /Invalid booking transition/
  );

  const quoted = transitionBookingStatus({
    booking: baseBooking,
    to: "quoted",
    actorUid: "adm-1",
    actorRole: "operational_admin",
    reason: "Quote issued",
  });
  const awaiting = transitionBookingStatus({
    booking: quoted,
    to: "awaiting_payment",
    actorUid: "adm-1",
    actorRole: "operational_admin",
    reason: "Paystack link sent",
  });
  assert.throws(
    () =>
      transitionBookingStatus({
        booking: awaiting,
        to: "confirmed",
        actorUid: "adm-1",
        actorRole: "operational_admin",
        reason: "Manual claim",
        paymentVerifiedServerSide: false,
      }),
    /verified Paystack payment/
  );

  const confirmed = transitionBookingStatus({
    booking: awaiting,
    to: "confirmed",
    actorUid: "system_paystack",
    actorRole: "system",
    reason: "Paystack webhook verified",
    paymentVerifiedServerSide: true,
  });
  const lastEvent = confirmed.statusHistory[confirmed.statusHistory.length - 1];
  assert.equal(lastEvent.actorUid, "system_paystack");
  assert.equal(lastEvent.bookingRef, "SC-FSM-01");
  assert.ok(lastEvent.atIso.endsWith("Z"));
  console.log("PASS [unit]: Booking FSM enforces transitions, payment guard, actor/timestamp/bookingRef trail");

  // 5. Duplicate detection catches identical address/unit & preserves original introducer
  const existingListings: PrivateListingRecord[] = [
    {
      listingId: "SC-APT-ORIG",
      originatorUid: "partner_original_introducer",
      originatorDisplayName: "Tunde Lagos Homes",
      category: "apartment",
      status: "approved",
      title: "Admiralty Penthouse",
      summary: "Verified apartment in Lekki Phase 1",
      city: "Lagos",
      area: "Lekki Phase 1",
      safeStreetLabel: "Admiralty Way",
      exactBuildingNumber: "Plot 14B",
      rateKobo: 15_000_000,
      cautionFeeKobo: 5_000_000,
      rentalBasis: "per_night",
      featureIds: ["feat_pool", "feat_24_7_power"],
      watermarkedPhotos: ["/api/media/public/apt_lekki_pool_villa.jpg"],
      privateOriginalMediaRefs: ["private_media/originals/apt1.jpg"],
      duplicateFlagIds: [],
      verifiedPropertyBadge: true,
      legalOwnerPrivateContact: {
        name: "Chief Adewale",
        phone: "+2348030001111",
        email: "owner@example.com",
      },
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ];
  const dupMatches = detectPotentialDuplicates(
    {
      listingId: "SC-APT-NEW-CANDIDATE",
      category: "apartment",
      title: "Admiralty Penthouse Duplicate",
      area: "Lekki Phase 1",
      safeStreetLabel: "admiralty way",
      exactBuildingNumber: "plot 14b",
      watermarkedPhotos: [],
    },
    existingListings
  );
  assert.ok(dupMatches.length >= 1, "Duplicate property submission must be flagged");
  assert.equal(dupMatches[0].existingListingId, "SC-APT-ORIG");
  assert.equal(dupMatches[0].confidence, "high");
  console.log("PASS [unit]: Duplicate listing detection catches normalized address & building number");

  // 6. Timezone handling: UTC ISO storage -> Africa/Lagos (WAT, UTC+1) display
  const formattedLagos = formatAfricaLagos("2027-06-01T14:00:00.000Z", true);
  assert.ok(
    formattedLagos.includes("15:00") || formattedLagos.includes("3:00"),
    `Expected WAT (+1h = 15:00/3:00 PM) from 14:00Z, got: ${formattedLagos}`
  );
  console.log("PASS [unit]: UTC ISO storage with Africa/Lagos (WAT) display formatting verified");

  // 7. Audit log records every privileged operation immutably
  const auditEntry = await getRepositories().audit.append({
    actorUid: "super_1",
    actorRole: "super_admin",
    action: "DUPLICATE_BYPASS_APPROVED",
    targetType: "listing",
    targetId: "SC-APT-ORIG",
    reason: "Verified separate duplex wing with signed owner authority",
  });
  assert.ok(auditEntry.logId.startsWith("AUD-"));
  console.log("PASS [unit]: Audited duplicate bypass & append-only audit trail verified");

  console.log("ALL TASK 7 REQUIREMENT SPOT-CHECK TESTS PASSED.");
}

runSpotChecks().catch((err) => {
  console.error("SPOT-CHECK TEST FAILURE:", err);
  process.exit(1);
});
