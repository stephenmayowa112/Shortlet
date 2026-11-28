/**
 * INTEGRATION TEST SUITE (Real Firebase Firestore Emulator — No Mocks)
 * Task 2: Complete 8-actor × 19-collection read/write security rules matrix.
 *
 * Run via:
 *   firebase emulators:exec --only firestore --project demo-shortlet-connect "npx --yes tsx tests/firestore-rules.integration.test.ts"
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
} from "firebase/firestore";

const NOW = "2026-11-24T12:00:00.000Z";
const PROJECT_ID = "demo-shortlet-connect";

async function seedEmulatorData(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Users (including active & suspended accounts)
    await setDoc(doc(db, "users", "cust_a"), {
      uid: "cust_a",
      role: "customer",
      status: "active",
      displayName: "Customer A",
      email: "custa@example.com",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "cust_b"), {
      uid: "cust_b",
      role: "customer",
      status: "active",
      displayName: "Customer B",
      email: "custb@example.com",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "partner_a"), {
      uid: "partner_a",
      role: "partner",
      status: "active",
      displayName: "Partner A",
      email: "partnera@example.com",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "partner_b"), {
      uid: "partner_b",
      role: "partner",
      status: "active",
      displayName: "Partner B",
      email: "partnerb@example.com",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "op_admin"), {
      uid: "op_admin",
      role: "operational_admin",
      status: "active",
      displayName: "Ops Admin",
      email: "ops@shortletconnect.ng",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "super_admin"), {
      uid: "super_admin",
      role: "super_admin",
      status: "active",
      displayName: "Super Admin",
      email: "super@shortletconnect.ng",
      mfaEnforced: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "susp_partner"), {
      uid: "susp_partner",
      role: "partner",
      status: "suspended",
      displayName: "Suspended Partner",
      email: "susppartner@example.com",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "users", "susp_admin"), {
      uid: "susp_admin",
      role: "operational_admin",
      status: "suspended",
      displayName: "Suspended Admin",
      email: "suspadmin@shortletconnect.ng",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Partner Profiles
    for (const [uid, status] of [
      ["partner_a", "approved"],
      ["partner_b", "approved"],
      ["susp_partner", "suspended"],
    ] as const) {
      await setDoc(doc(db, "partnerProfiles", uid), {
        ownerUid: uid,
        partnerType: "agent",
        legalName: `Legal ${uid}`,
        displayAttribution: `Agent ${uid}`,
        email: `${uid}@example.com`,
        phone: "+2348011111111",
        channelVerified: true,
        idType: "nin_slip",
        privateIdDocRef: `id_doc_${uid}`,
        verificationStatus: status,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }

    // Public Listings (one approved, one non-approved to verify deny)
    await setDoc(doc(db, "publicListings", "SC-APT-101"), {
      listingId: "SC-APT-101",
      category: "apartment",
      status: "approved",
      title: "Ikoyi Penthouse",
      summary: "Verified 3-bedroom penthouse in Old Ikoyi.",
      city: "Lagos",
      area: "Ikoyi",
      rateKobo: 25000000,
      rentalBasis: "per_night",
      cautionFeeKobo: 10000000,
      currency: "NGN",
      originatorPartnerId: "partner_a",
      originatorDisplayName: "Agent partner_a",
      verifiedPropertyBadge: true,
      watermarkedPhotos: ["/api/media/public/photo1.jpg"],
      featureIds: ["private_pool"],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "publicListings", "SC-APT-DRAFT"), {
      listingId: "SC-APT-DRAFT",
      category: "apartment",
      status: "pending_review",
      title: "Unapproved Draft",
      summary: "Must never be readable publicly.",
      city: "Lagos",
      area: "Ikoyi",
      rateKobo: 15000000,
      rentalBasis: "per_night",
      cautionFeeKobo: 5000000,
      currency: "NGN",
      originatorPartnerId: "partner_a",
      originatorDisplayName: "Agent partner_a",
      verifiedPropertyBadge: false,
      watermarkedPhotos: [],
      featureIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Private Listings (Partner A, Partner B, Suspended Partner)
    for (const [id, owner] of [
      ["SC-APT-101", "partner_a"],
      ["SC-APT-202", "partner_b"],
      ["SC-APT-303", "susp_partner"],
    ] as const) {
      await setDoc(doc(db, "privateListings", id), {
        listingId: id,
        originatorUid: owner,
        originatorDisplayName: `Agent ${owner}`,
        category: "apartment",
        status: "approved",
        title: `Private Listing ${id}`,
        summary: "Contains sensitive exact address and manager phone.",
        city: "Lagos",
        area: "Ikoyi",
        exactBuildingNumber: "Plot 14 Bourdillon Road",
        propertyManagerPhone: "+2348099999999",
        rateKobo: 25000000,
        cautionFeeKobo: 10000000,
        rentalBasis: "per_night",
        featureIds: ["private_pool"],
        watermarkedPhotos: ["/api/media/public/photo1.jpg"],
        createdAt: NOW,
        updatedAt: NOW,
      });
    }

    // Legal Owner Secrets (Super Admin ONLY)
    await setDoc(doc(db, "listingOwnerSecrets", "SC-APT-101"), {
      listingId: "SC-APT-101",
      legalOwnerName: "Chief Legal Owner",
      legalOwnerPhone: "+2348090000001",
      legalOwnerEmail: "owner@example.com",
      ownershipClaimStatus: "none",
      updatedAt: NOW,
    });

    // Feature Catalogue
    await setDoc(doc(db, "featureCatalogue", "private_pool"), {
      featureId: "private_pool",
      label: "Private Pool",
      group: "entertainment",
      active: true,
      synonyms: ["pool"],
      sortOrder: 1,
      updatedAt: NOW,
    });

    // Bookings (Customer A + Partner A; Customer B + Partner B; Suspended Partner)
    await setDoc(doc(db, "bookings", "BK-A1"), {
      bookingRef: "BK-A1",
      listingId: "SC-APT-101",
      listingTitle: "Ikoyi Penthouse",
      category: "apartment",
      customerUid: "cust_a",
      customerContact: "+2348010000001",
      customerName: "Customer A",
      partnerUid: "partner_a",
      startIso: "2026-12-01T14:00:00.000Z",
      endIso: "2026-12-04T12:00:00.000Z",
      units: 3,
      rentalPrincipalKobo: 75000000,
      serviceChargeKobo: 9000000,
      cautionFeeKobo: 10000000,
      extrasKobo: 0,
      customerTotalKobo: 94000000,
      currency: "NGN",
      status: "confirmed",
      paymentVerified: true,
      cautionDepositStatus: "collected",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "bookings", "BK-B1"), {
      bookingRef: "BK-B1",
      listingId: "SC-APT-202",
      listingTitle: "VI Suite",
      category: "apartment",
      customerUid: "cust_b",
      customerContact: "+2348010000002",
      customerName: "Customer B",
      partnerUid: "partner_b",
      startIso: "2026-12-05T14:00:00.000Z",
      endIso: "2026-12-07T12:00:00.000Z",
      units: 2,
      rentalPrincipalKobo: 40000000,
      serviceChargeKobo: 6000000,
      cautionFeeKobo: 5000000,
      extrasKobo: 0,
      customerTotalKobo: 51000000,
      currency: "NGN",
      status: "confirmed",
      paymentVerified: true,
      cautionDepositStatus: "collected",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "bookings", "BK-S1"), {
      bookingRef: "BK-S1",
      listingId: "SC-APT-303",
      listingTitle: "Suspended Partner Unit",
      category: "apartment",
      customerUid: "cust_b",
      customerContact: "+2348010000002",
      customerName: "Customer B",
      partnerUid: "susp_partner",
      startIso: "2026-12-08T14:00:00.000Z",
      endIso: "2026-12-10T12:00:00.000Z",
      units: 2,
      rentalPrincipalKobo: 30000000,
      serviceChargeKobo: 6000000,
      cautionFeeKobo: 5000000,
      extrasKobo: 0,
      customerTotalKobo: 41000000,
      currency: "NGN",
      status: "confirmed",
      paymentVerified: true,
      cautionDepositStatus: "collected",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Availability Slots
    await setDoc(doc(db, "availabilitySlots", "apt_SC-APT-101_2026-12-01"), {
      slotKey: "apt_SC-APT-101_2026-12-01",
      listingId: "SC-APT-101",
      bookingRef: "BK-A1",
      holdType: "confirmed",
      createdAt: NOW,
    });

    // Financial Ledger Entries (Internal ₦10k splits)
    await setDoc(doc(db, "ledgerEntries", "LED-001"), {
      bookingRef: "BK-A1",
      category: "founder_allocation",
      amountKobo: 3000000,
      currency: "NGN",
      settlementStatus: "collected",
      createdAt: NOW,
    });

    // Official WhatsApp Tickets
    await setDoc(doc(db, "tickets", "TKT-001"), {
      ticketRef: "TKT-001",
      listingId: "SC-APT-101",
      customerContact: "+2348010000001",
      status: "open",
      lastMessageText: "Enquiry about Ikoyi Penthouse",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Live Inspections
    await setDoc(doc(db, "inspections", "INS-001"), {
      inspectionRef: "INS-001",
      listingId: "SC-APT-101",
      listingTitle: "Ikoyi Penthouse",
      customerContact: "+2348010000001",
      customerName: "Customer A",
      status: "scheduled",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Reviews (one approved, one pending)
    await setDoc(doc(db, "reviews", "REV-APPROVED"), {
      bookingRef: "BK-A1",
      listingId: "SC-APT-101",
      authorUid: "cust_a",
      authorDisplayName: "Customer A",
      rating: 5,
      comment: "Clean apartment and seamless check-in.",
      moderationStatus: "approved",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await setDoc(doc(db, "reviews", "REV-PENDING"), {
      bookingRef: "BK-B1",
      listingId: "SC-APT-202",
      authorUid: "cust_b",
      authorDisplayName: "Customer B",
      rating: 4,
      comment: "Pending moderation review.",
      moderationStatus: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Support Issues
    await setDoc(doc(db, "supportIssues", "SUP-001"), {
      bookingRef: "BK-A1",
      listingId: "SC-APT-101",
      severity: "medium",
      summary: "Generator switchover took 5 minutes.",
      status: "open",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Audit Logs
    await setDoc(doc(db, "auditLogs", "AUD-001"), {
      actorUid: "super_admin",
      actorRole: "super_admin",
      action: "LISTING_APPROVED",
      targetType: "listing",
      targetId: "SC-APT-101",
      reason: "Verified property authority",
      createdAt: NOW,
    });

    // System Config
    await setDoc(doc(db, "systemConfig", "global"), {
      operationalAdminCap: 10,
      serviceChargeUnitKobo: 3000000,
      adminSplitKobo: 1000000,
      founderSplitKobo: 1000000,
      adsOpsSplitKobo: 1000000,
      carPartialDayCutoffHours: 24,
      roundRobinEnabled: true,
      videoWatermarkEnabled: false,
      identityDocRetentionDays: 365,
      officialWhatsAppNumber: "2348090001234",
      updatedAt: NOW,
    });

    // Identity Documents (Authorised reviewers only)
    await setDoc(doc(db, "identityDocuments", "id_doc_partner_a"), {
      docId: "id_doc_partner_a",
      partnerUid: "partner_a",
      idType: "nin_slip",
      mimeType: "image/jpeg",
      byteSize: 204800,
      encryptedStorageKey: "enc_partner_a.bin",
      retainUntilIso: "2027-11-24T12:00:00.000Z",
      uploadedAt: NOW,
    });

    // Verified Customer Saved Profiles
    await setDoc(doc(db, "customerProfiles", "cust_a"), {
      customerUid: "cust_a",
      verifiedContact: "+2348010000001",
      savedListingIds: ["SC-APT-101"],
      updatedAt: NOW,
    });
    await setDoc(doc(db, "customerProfiles", "cust_b"), {
      customerUid: "cust_b",
      verifiedContact: "+2348010000002",
      savedListingIds: ["SC-APT-202"],
      updatedAt: NOW,
    });

    // Payments
    await setDoc(doc(db, "payments", "PAY-001"), {
      paymentReference: "PAY-001",
      bookingRef: "BK-A1",
      amountKobo: 94000000,
      currency: "NGN",
      status: "verified",
      verifiedAt: NOW,
    });

    // Receipts
    await setDoc(doc(db, "receipts", "RCP-A1"), {
      receiptId: "RCP-A1",
      bookingRef: "BK-A1",
      customerUid: "cust_a",
      amountPaidKobo: 94000000,
      currency: "NGN",
      issuedAt: NOW,
    });
    await setDoc(doc(db, "receipts", "RCP-B1"), {
      receiptId: "RCP-B1",
      bookingRef: "BK-B1",
      customerUid: "cust_b",
      amountPaidKobo: 51000000,
      currency: "NGN",
      issuedAt: NOW,
    });
  });
}

async function run() {
  const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      rules,
    },
  });

  let passed = 0;
  async function test(name: string, fn: () => Promise<void>) {
    await fn();
    passed++;
    console.log(`PASS [integration]: ${name}`);
  }

  try {
    await env.clearFirestore();
    await seedEmulatorData(env);

    const actors: Record<string, RulesTestContext> = {
      anon: env.unauthenticatedContext(),
      customerA: env.authenticatedContext("cust_a", { email: "custa@example.com", email_verified: true }),
      partnerA: env.authenticatedContext("partner_a", { email: "partnera@example.com", email_verified: true }),
      partnerB: env.authenticatedContext("partner_b", { email: "partnerb@example.com", email_verified: true }),
      opAdmin: env.authenticatedContext("op_admin", { email: "ops@shortletconnect.ng", email_verified: true }),
      superAdmin: env.authenticatedContext("super_admin", { email: "super@shortletconnect.ng", email_verified: true }),
      suspPartner: env.authenticatedContext("susp_partner", { email: "susppartner@example.com", email_verified: true }),
      suspAdmin: env.authenticatedContext("susp_admin", { email: "suspadmin@shortletconnect.ng", email_verified: true }),
    };

    // 1. Anonymous user: approved publicListings ONLY, zero private/owner/finance/booking access
    await test("Anonymous reads approved publicListings & active featureCatalogue & approved reviews only", async () => {
      const db = actors.anon.firestore();
      await assertSucceeds(getDoc(doc(db, "publicListings", "SC-APT-101")));
      await assertSucceeds(getDocs(query(collection(db, "publicListings"), where("status", "==", "approved"))));
      await assertSucceeds(getDoc(doc(db, "featureCatalogue", "private_pool")));
      await assertSucceeds(getDoc(doc(db, "reviews", "REV-APPROVED")));

      // Unapproved publicListing & pending review denied
      await assertFails(getDoc(doc(db, "publicListings", "SC-APT-DRAFT")));
      await assertFails(getDoc(doc(db, "reviews", "REV-PENDING")));

      // All private / sensitive collections denied
      for (const [col, id] of [
        ["users", "cust_a"],
        ["partnerProfiles", "partner_a"],
        ["privateListings", "SC-APT-101"],
        ["listingOwnerSecrets", "SC-APT-101"],
        ["bookings", "BK-A1"],
        ["availabilitySlots", "apt_SC-APT-101_2026-12-01"],
        ["ledgerEntries", "LED-001"],
        ["tickets", "TKT-001"],
        ["inspections", "INS-001"],
        ["supportIssues", "SUP-001"],
        ["auditLogs", "AUD-001"],
        ["systemConfig", "global"],
        ["identityDocuments", "id_doc_partner_a"],
        ["customerProfiles", "cust_a"],
        ["payments", "PAY-001"],
        ["receipts", "RCP-A1"],
      ] as const) {
        await assertFails(getDoc(doc(db, col, id)));
      }
      // Anonymous writes denied everywhere
      await assertFails(setDoc(doc(db, "publicListings", "FAKE"), { status: "approved" }));
      await assertFails(setDoc(doc(db, "bookings", "BK-FAKE"), { bookingRef: "BK-FAKE" }));
    });

    // 2. Customer isolation: Customer A can read own profile/bookings/receipts, NEVER Customer B's or finance/partner/owner
    await test("Customer A reads own user/profile/booking/receipt; denied Customer B's & all finance/partner/admin data", async () => {
      const db = actors.customerA.firestore();
      await assertSucceeds(getDoc(doc(db, "users", "cust_a")));
      await assertSucceeds(getDoc(doc(db, "customerProfiles", "cust_a")));
      await assertSucceeds(getDoc(doc(db, "bookings", "BK-A1")));
      await assertSucceeds(getDoc(doc(db, "receipts", "RCP-A1")));

      // Customer B's records strictly denied
      await assertFails(getDoc(doc(db, "users", "cust_b")));
      await assertFails(getDoc(doc(db, "customerProfiles", "cust_b")));
      await assertFails(getDoc(doc(db, "bookings", "BK-B1")));
      await assertFails(getDoc(doc(db, "receipts", "RCP-B1")));

      // Finance, owner secrets, private listings, ID docs, audit logs denied
      for (const [col, id] of [
        ["partnerProfiles", "partner_a"],
        ["privateListings", "SC-APT-101"],
        ["listingOwnerSecrets", "SC-APT-101"],
        ["ledgerEntries", "LED-001"],
        ["payments", "PAY-001"],
        ["tickets", "TKT-001"],
        ["inspections", "INS-001"],
        ["supportIssues", "SUP-001"],
        ["auditLogs", "AUD-001"],
        ["systemConfig", "global"],
        ["identityDocuments", "id_doc_partner_a"],
      ] as const) {
        await assertFails(getDoc(doc(db, col, id)));
      }

      // Self role/status escalation denied
      await assertFails(updateDoc(doc(db, "users", "cust_a"), { role: "super_admin", updatedAt: NOW }));
      await assertFails(updateDoc(doc(db, "users", "cust_a"), { status: "suspended", updatedAt: NOW }));
      await assertSucceeds(updateDoc(doc(db, "users", "cust_a"), { displayName: "Customer A Updated", updatedAt: NOW }));

      // Privileged writes denied to customer
      await assertFails(setDoc(doc(db, "bookings", "BK-HACK"), { bookingRef: "BK-HACK" }));
      await assertFails(setDoc(doc(db, "ledgerEntries", "LED-HACK"), { bookingRef: "BK-A1" }));
    });

    // 3. Partner A vs Partner B isolation + no ledger/owner/ID/ticket access + no self-approval
    await test("Partner A isolated from Partner B; cannot read finance/tickets/ID docs/owner secrets; cannot self-approve or verify channel", async () => {
      const dbA = actors.partnerA.firestore();
      const dbB = actors.partnerB.firestore();

      // Partner A reads own profile, privateListing, own booking
      await assertSucceeds(getDoc(doc(dbA, "partnerProfiles", "partner_a")));
      await assertSucceeds(getDoc(doc(dbA, "privateListings", "SC-APT-101")));
      await assertSucceeds(getDoc(doc(dbA, "bookings", "BK-A1")));

      // Partner A CANNOT read Partner B's profile, listings, bookings, or any tickets/ID docs/ledger
      await assertFails(getDoc(doc(dbA, "partnerProfiles", "partner_b")));
      await assertFails(getDoc(doc(dbA, "privateListings", "SC-APT-202")));
      await assertFails(getDoc(doc(dbA, "bookings", "BK-B1")));
      await assertFails(getDoc(doc(dbA, "tickets", "TKT-001")));
      await assertFails(getDoc(doc(dbA, "identityDocuments", "id_doc_partner_a")));
      await assertFails(getDoc(doc(dbA, "ledgerEntries", "LED-001")));
      await assertFails(getDoc(doc(dbA, "payments", "PAY-001")));
      await assertFails(getDoc(doc(dbA, "listingOwnerSecrets", "SC-APT-101")));
      await assertFails(getDoc(doc(dbA, "auditLogs", "AUD-001")));
      await assertFails(getDoc(doc(dbA, "systemConfig", "global")));

      // Partner B CANNOT read or mutate Partner A's listing
      await assertFails(getDoc(doc(dbB, "privateListings", "SC-APT-101")));
      await assertFails(updateDoc(doc(dbB, "privateListings", "SC-APT-101"), { title: "Hijacked", updatedAt: NOW }));

      // Partner A CANNOT self-approve listing or directly publish to publicListings
      await assertFails(setDoc(doc(dbA, "publicListings", "SC-APT-999"), { listingId: "SC-APT-999", status: "approved" }));
      await assertFails(
        setDoc(doc(dbA, "privateListings", "SC-APT-999"), {
          listingId: "SC-APT-999",
          originatorUid: "partner_a",
          originatorDisplayName: "Agent partner_a",
          category: "apartment",
          status: "approved", // forbidden!
          title: "Sneaky Self Approved",
          summary: "Attempting to skip Super Admin review.",
          city: "Lagos",
          area: "Ikoyi",
          rateKobo: 15000000,
          cautionFeeKobo: 5000000,
          rentalBasis: "per_night",
          featureIds: ["private_pool"],
          watermarkedPhotos: [],
          createdAt: NOW,
          updatedAt: NOW,
        })
      );

      // Partner A CAN submit a valid pending_review listing
      await assertSucceeds(
        setDoc(doc(dbA, "privateListings", "SC-APT-NEW1"), {
          listingId: "SC-APT-NEW1",
          originatorUid: "partner_a",
          originatorDisplayName: "Agent partner_a",
          category: "apartment",
          status: "pending_review",
          title: "Valid Pending Lekki Suite",
          summary: "Submitted cleanly for Super Admin review.",
          city: "Lagos",
          area: "Lekki Phase 1",
          rateKobo: 18000000,
          cautionFeeKobo: 5000000,
          rentalBasis: "per_night",
          featureIds: ["private_pool"],
          watermarkedPhotos: ["/api/media/public/photo1.jpg"],
          createdAt: NOW,
          updatedAt: NOW,
        })
      );

      // New partner cannot self-set channelVerified=true or verificationStatus=approved
      const newPartner = env.authenticatedContext("partner_new", { email: "newp@example.com", email_verified: true });
      await assertFails(
        setDoc(doc(newPartner.firestore(), "partnerProfiles", "partner_new"), {
          ownerUid: "partner_new",
          partnerType: "agent",
          legalName: "New Partner",
          displayAttribution: "New Agent",
          email: "newp@example.com",
          phone: "+2348022222222",
          channelVerified: true, // forbidden on client create!
          idType: "nin_slip",
          privateIdDocRef: "id_new",
          verificationStatus: "pending_review",
          createdAt: NOW,
          updatedAt: NOW,
        })
      );
    });

    // 4. Operational Admin: can read operational collections, strictly DENIED listingOwnerSecrets, identityDocuments, auditLogs, users list, and ALL privileged client writes
    await test("Operational Admin reads ops data; denied owner secrets, ID docs, audit logs & all privileged client writes", async () => {
      const db = actors.opAdmin.firestore();
      await assertSucceeds(getDoc(doc(db, "privateListings", "SC-APT-101")));
      await assertSucceeds(getDoc(doc(db, "bookings", "BK-A1")));
      await assertSucceeds(getDoc(doc(db, "tickets", "TKT-001")));
      await assertSucceeds(getDoc(doc(db, "inspections", "INS-001")));
      await assertSucceeds(getDoc(doc(db, "supportIssues", "SUP-001")));
      await assertSucceeds(getDoc(doc(db, "ledgerEntries", "LED-001")));
      await assertSucceeds(getDoc(doc(db, "payments", "PAY-001")));
      await assertSucceeds(getDoc(doc(db, "receipts", "RCP-A1")));
      await assertSucceeds(getDoc(doc(db, "systemConfig", "global")));

      // STRICT PRIVACY BOUNDARIES: NO legal owner contacts, NO ID docs, NO audit logs, NO partnerProfiles list
      await assertFails(getDoc(doc(db, "listingOwnerSecrets", "SC-APT-101")));
      await assertFails(getDoc(doc(db, "identityDocuments", "id_doc_partner_a")));
      await assertFails(getDoc(doc(db, "auditLogs", "AUD-001")));
      await assertFails(getDoc(doc(db, "partnerProfiles", "partner_a")));
      await assertFails(getDoc(doc(db, "customerProfiles", "cust_a")));

      // ZERO client writes to privileged collections
      await assertFails(updateDoc(doc(db, "bookings", "BK-A1"), { status: "completed", updatedAt: NOW }));
      await assertFails(setDoc(doc(db, "ledgerEntries", "LED-OP"), { bookingRef: "BK-A1" }));
      await assertFails(updateDoc(doc(db, "systemConfig", "global"), { operationalAdminCap: 50, updatedAt: NOW }));
      await assertFails(setDoc(doc(db, "auditLogs", "AUD-OP"), { action: "FAKE" }));
    });

    // 5. Super Admin: reads all collections including owner secrets, ID docs, audit logs; STILL denied client writes to server-only collections & audit log updates/deletes
    await test("Super Admin reads all collections; auditLogs & server-only collections strictly reject client writes/updates/deletes", async () => {
      const db = actors.superAdmin.firestore();
      for (const [col, id] of [
        ["users", "cust_a"],
        ["partnerProfiles", "partner_a"],
        ["publicListings", "SC-APT-101"],
        ["privateListings", "SC-APT-101"],
        ["listingOwnerSecrets", "SC-APT-101"],
        ["featureCatalogue", "private_pool"],
        ["bookings", "BK-A1"],
        ["availabilitySlots", "apt_SC-APT-101_2026-12-01"],
        ["ledgerEntries", "LED-001"],
        ["tickets", "TKT-001"],
        ["inspections", "INS-001"],
        ["reviews", "REV-PENDING"],
        ["supportIssues", "SUP-001"],
        ["auditLogs", "AUD-001"],
        ["systemConfig", "global"],
        ["identityDocuments", "id_doc_partner_a"],
        ["customerProfiles", "cust_a"],
        ["payments", "PAY-001"],
        ["receipts", "RCP-A1"],
      ] as const) {
        await assertSucceeds(getDoc(doc(db, col, id)));
      }

      // Audit logs immutable & non-writable by ANY client (even Super Admin)
      await assertFails(setDoc(doc(db, "auditLogs", "AUD-CLIENT"), { action: "FORGED" }));
      await assertFails(updateDoc(doc(db, "auditLogs", "AUD-001"), { reason: "Tampered" }));
      await assertFails(deleteDoc(doc(db, "auditLogs", "AUD-001")));

      // Server-only collections reject client writes even from Super Admin
      for (const [col, id] of [
        ["publicListings", "SC-APT-101"],
        ["listingOwnerSecrets", "SC-APT-101"],
        ["bookings", "BK-A1"],
        ["availabilitySlots", "apt_SC-APT-101_2026-12-01"],
        ["ledgerEntries", "LED-001"],
        ["payments", "PAY-001"],
        ["receipts", "RCP-A1"],
        ["systemConfig", "global"],
        ["identityDocuments", "id_doc_partner_a"],
      ] as const) {
        await assertFails(updateDoc(doc(db, col, id), { updatedAt: NOW }));
        await assertFails(deleteDoc(doc(db, col, id)));
      }
    });

    // 6. Suspended Partner loses access immediately (even to own profile, listings, bookings)
    await test("Suspended Partner immediately loses read/write access to own profile, listings, bookings & user doc", async () => {
      const db = actors.suspPartner.firestore();
      await assertFails(getDoc(doc(db, "users", "susp_partner")));
      await assertFails(getDoc(doc(db, "partnerProfiles", "susp_partner")));
      await assertFails(getDoc(doc(db, "privateListings", "SC-APT-303")));
      await assertFails(getDoc(doc(db, "bookings", "BK-S1")));
      await assertFails(updateDoc(doc(db, "privateListings", "SC-APT-303"), { title: "Blocked", updatedAt: NOW }));
      await assertFails(updateDoc(doc(db, "users", "susp_partner"), { displayName: "Blocked", updatedAt: NOW }));
      // Still can read public approved listings like any public visitor
      await assertSucceeds(getDoc(doc(db, "publicListings", "SC-APT-101")));
    });

    // 7. Suspended Operational Admin loses access immediately across all operational collections
    await test("Suspended Operational Admin immediately loses all operational & own-user access", async () => {
      const db = actors.suspAdmin.firestore();
      for (const [col, id] of [
        ["users", "susp_admin"],
        ["privateListings", "SC-APT-101"],
        ["bookings", "BK-A1"],
        ["availabilitySlots", "apt_SC-APT-101_2026-12-01"],
        ["ledgerEntries", "LED-001"],
        ["tickets", "TKT-001"],
        ["inspections", "INS-001"],
        ["supportIssues", "SUP-001"],
        ["systemConfig", "global"],
        ["payments", "PAY-001"],
        ["receipts", "RCP-A1"],
        ["listingOwnerSecrets", "SC-APT-101"],
        ["identityDocuments", "id_doc_partner_a"],
        ["auditLogs", "AUD-001"],
      ] as const) {
        await assertFails(getDoc(doc(db, col, id)));
      }
      await assertSucceeds(getDoc(doc(db, "publicListings", "SC-APT-101")));
    });

    // 8. Email spoofing guard: unverified email matching bootstrapped admin is denied
    await test("Unverified email spoofing bootstrapped admin is strictly denied", async () => {
      const spoofed = env.authenticatedContext("attacker_uid", {
        email: "stephenmayowa112@gmail.com",
        email_verified: false,
      });
      const db = spoofed.firestore();
      await assertFails(getDoc(doc(db, "listingOwnerSecrets", "SC-APT-101")));
      await assertFails(getDoc(doc(db, "auditLogs", "AUD-001")));
      await assertFails(getDoc(doc(db, "identityDocuments", "id_doc_partner_a")));
    });

    assert.equal(passed, 8);
    console.log(`\nINTEGRATION SUMMARY: ${passed}/8 Firestore Emulator security matrix suites passed.`);
  } finally {
    await env.cleanup();
  }
}

run().catch((err) => {
  console.error("FIRESTORE RULES INTEGRATION TEST FAILED:", err);
  process.exit(1);
});
