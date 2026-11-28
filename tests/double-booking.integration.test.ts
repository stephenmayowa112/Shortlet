/**
 * INTEGRATION TEST SUITE (Real Firebase Firestore Emulator — No Mocks)
 * Task 3: Database-level double-booking protection via Firestore transactions
 * + Portable BookingsRepository contract test (Task 9 #3).
 *
 * Run via:
 *   PATH="/opt/jre21/bin:$PATH" firebase emulators:exec --only firestore --project demo-shortlet-connect \
 *     "npx --yes tsx tests/double-booking.integration.test.ts"
 */
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { FirestoreAvailabilityRepository } from "@/lib/repositories/firestore-availability-repo";
import { createInMemoryRepositories } from "@/lib/repositories/memory-store";
import type { BookingsRepository } from "@/lib/repositories/types";

const PROJECT_ID = "demo-shortlet-connect";

async function runConcurrencyContractTests(
  label: string,
  repo: Pick<
    BookingsRepository,
    "acquireSlotsAtomic" | "confirmAfterPaymentAtomic" | "cancelAndReleaseSlotsAtomic"
  >,
  verifyAuditLogged?: (auditLogId: string) => Promise<void>
) {
  const nowIso = "2026-12-01T10:00:00.000Z";

  // 1. 20 parallel apartment booking requests for the exact same nights -> EXACTLY 1 succeeds
  const aptResults = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      repo.acquireSlotsAtomic({
        listingId: "SC-APT-101",
        category: "apartment",
        startIso: "2026-12-10T14:00:00.000Z",
        endIso: "2026-12-13T12:00:00.000Z",
        bookingRef: `BK-APT-RACE-${i}`,
        holdType: "hold",
        holdMinutes: 30,
        nowIso,
      })
    )
  );
  const aptWinners = aptResults.filter((r) => r.ok);
  const aptLosers = aptResults.filter((r) => !r.ok);
  assert.equal(aptWinners.length, 1, `[${label}] Expected exactly 1 apartment winner, got ${aptWinners.length}`);
  assert.equal(aptLosers.length, 19, `[${label}] Expected 19 apartment conflicts`);
  console.log(`PASS [${label}]: 20 parallel apartment requests -> 1 winner, 19 blocked`);

  // 2. Adjacent apartment stay (check-out day == next check-in day) MUST be allowed
  const adjacentRes = await repo.acquireSlotsAtomic({
    listingId: "SC-APT-101",
    category: "apartment",
    startIso: "2026-12-13T14:00:00.000Z",
    endIso: "2026-12-15T12:00:00.000Z",
    bookingRef: "BK-APT-ADJACENT",
    holdType: "confirmed",
    nowIso,
  });
  assert.equal(adjacentRes.ok, true, `[${label}] Adjacent apartment stay must succeed`);
  console.log(`PASS [${label}]: Adjacent apartment stay (Dec 13 check-out == Dec 13 check-in) allowed`);

  // 3. Partial overlap on apartment MUST be blocked
  const partialApt = await repo.acquireSlotsAtomic({
    listingId: "SC-APT-101",
    category: "apartment",
    startIso: "2026-12-12T14:00:00.000Z",
    endIso: "2026-12-14T12:00:00.000Z",
    bookingRef: "BK-APT-PARTIAL",
    holdType: "hold",
    nowIso,
  });
  assert.equal(partialApt.ok, false, `[${label}] Partial apartment overlap must fail`);
  console.log(`PASS [${label}]: Partial apartment overlap blocked`);

  // 4. 20 parallel boat requests for the same 2-hour block -> EXACTLY 1 succeeds
  const boatResults = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      repo.acquireSlotsAtomic({
        listingId: "SC-BOAT-301",
        category: "boat",
        startIso: "2026-12-14T14:00:00.000Z",
        endIso: "2026-12-14T17:00:00.000Z", // 3h -> spans two 2h blocks
        bookingRef: `BK-BOAT-RACE-${i}`,
        holdType: "hold",
        holdMinutes: 30,
        nowIso,
      })
    )
  );
  assert.equal(boatResults.filter((r) => r.ok).length, 1, `[${label}] Expected exactly 1 boat winner`);
  assert.equal(boatResults.filter((r) => !r.ok).length, 19);
  console.log(`PASS [${label}]: 20 parallel boat 2-hour-slot requests -> 1 winner, 19 blocked`);

  // 5. 20 parallel overlapping car range requests -> EXACTLY 1 succeeds
  const carResults = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      repo.acquireSlotsAtomic({
        listingId: "SC-CAR-201",
        category: "car",
        // Staggered overlapping ranges (all overlap 12:00-18:00 UTC)
        startIso: i % 2 === 0 ? "2026-12-16T08:00:00.000Z" : "2026-12-16T12:00:00.000Z",
        endIso: i % 2 === 0 ? "2026-12-16T20:00:00.000Z" : "2026-12-17T00:00:00.000Z",
        bookingRef: `BK-CAR-RACE-${i}`,
        holdType: "hold",
        holdMinutes: 30,
        nowIso,
      })
    )
  );
  assert.equal(carResults.filter((r) => r.ok).length, 1, `[${label}] Expected exactly 1 car winner`);
  assert.equal(carResults.filter((r) => !r.ok).length, 19);
  console.log(`PASS [${label}]: 20 parallel overlapping car range requests -> 1 winner, 19 blocked`);

  // 6. Hold expiry releases inventory (lazy expiry inside transaction)
  const shortHold = await repo.acquireSlotsAtomic({
    listingId: "SC-APT-EXPIRE",
    category: "apartment",
    startIso: "2026-12-20T14:00:00.000Z",
    endIso: "2026-12-22T12:00:00.000Z",
    bookingRef: "BK-EXPIRE-1",
    holdType: "hold",
    holdMinutes: 15,
    nowIso: "2026-12-01T10:00:00.000Z",
  });
  assert.equal(shortHold.ok, true);

  // Blocked while active (10:10 < 10:15)
  const blockedDuringHold = await repo.acquireSlotsAtomic({
    listingId: "SC-APT-EXPIRE",
    category: "apartment",
    startIso: "2026-12-20T14:00:00.000Z",
    endIso: "2026-12-22T12:00:00.000Z",
    bookingRef: "BK-EXPIRE-2",
    holdType: "hold",
    holdMinutes: 30,
    nowIso: "2026-12-01T10:10:00.000Z",
  });
  assert.equal(blockedDuringHold.ok, false);

  // Released after expiry (10:20 > 10:15)
  const claimedAfterExpiry = await repo.acquireSlotsAtomic({
    listingId: "SC-APT-EXPIRE",
    category: "apartment",
    startIso: "2026-12-20T14:00:00.000Z",
    endIso: "2026-12-22T12:00:00.000Z",
    bookingRef: "BK-EXPIRE-2",
    holdType: "confirmed",
    nowIso: "2026-12-01T10:20:00.000Z",
  });
  assert.equal(claimedAfterExpiry.ok, true);
  console.log(`PASS [${label}]: Expired hold lazily released and re-booked cleanly`);

  // 7. Payment arriving AFTER hold expiry NEVER causes double sale -> manual review + audit log
  const latePaymentResult = await repo.confirmAfterPaymentAtomic({
    bookingRef: "BK-EXPIRE-1",
    listingId: "SC-APT-EXPIRE",
    category: "apartment",
    startIso: "2026-12-20T14:00:00.000Z",
    endIso: "2026-12-22T12:00:00.000Z",
    paymentReference: "PSK-LATE-999",
    nowIso: "2026-12-01T10:25:00.000Z",
  });
  assert.equal(latePaymentResult.outcome, "late_payment_manual_review");
  assert.ok(latePaymentResult.auditLogId, "Late payment must create an audit log entry");
  if (verifyAuditLogged && latePaymentResult.auditLogId) {
    await verifyAuditLogged(latePaymentResult.auditLogId);
  }
  console.log(`PASS [${label}]: Late payment after hold expiry routed to manual review & audited (no double sale)`);

  // 8. Cancellation releases inventory so another booking can acquire it
  const cancelRes = await repo.cancelAndReleaseSlotsAtomic({
    bookingRef: "BK-EXPIRE-2",
    listingId: "SC-APT-EXPIRE",
    category: "apartment",
    startIso: "2026-12-20T14:00:00.000Z",
    endIso: "2026-12-22T12:00:00.000Z",
    reason: "Customer cancelled 72 hours before check-in",
    actorUid: "op_admin_01",
    actorRole: "operational_admin",
    nowIso: "2026-12-01T11:00:00.000Z",
  });
  assert.equal(cancelRes.releasedKeys.length, 2);

  const rebookedAfterCancel = await repo.acquireSlotsAtomic({
    listingId: "SC-APT-EXPIRE",
    category: "apartment",
    startIso: "2026-12-20T14:00:00.000Z",
    endIso: "2026-12-22T12:00:00.000Z",
    bookingRef: "BK-AFTER-CANCEL",
    holdType: "confirmed",
    nowIso: "2026-12-01T11:05:00.000Z",
  });
  assert.equal(rebookedAfterCancel.ok, true);
  console.log(`PASS [${label}]: Cancellation released slots and permitted subsequent booking`);
}

async function main() {
  // Part A: REAL Firestore Emulator Transaction Integration Test (no mocks)
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      // Rules disabled inside server-privileged transaction test (simulating Admin SDK server route)
      rules: `rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{doc=**} { allow read, write: if true; } } }`,
    },
  });

  try {
    await env.clearFirestore();
    const db = env.unauthenticatedContext().firestore() as unknown as Parameters<
      typeof doc
    >[0];
    const firestoreRepo = new FirestoreAvailabilityRepository(
      db as unknown as ConstructorParameters<typeof FirestoreAvailabilityRepository>[0]
    );

    await runConcurrencyContractTests(
      "integration:firestore-emulator",
      firestoreRepo,
      async (auditLogId) => {
        const snap = await getDoc(doc(db, "auditLogs", auditLogId));
        assert.equal(snap.exists(), true, "Audit log document must exist in Firestore");
        assert.equal(snap.data()?.action, "LATE_PAYMENT_MANUAL_REVIEW_REQUIRED");
      }
    );
  } finally {
    await env.cleanup();
  }

  // Part B: Portable Repository Interface Test (Task 9 #3 — reusable against Supabase/Postgres later)
  const memRepos = createInMemoryRepositories();
  await runConcurrencyContractTests(
    "unit:portable-repository",
    memRepos.bookings,
    async (auditLogId) => {
      const logs = await memRepos.audit.listAll();
      assert.ok(logs.some((l) => l.logId === auditLogId));
    }
  );

  console.log("\nALL DOUBLE-BOOKING INTEGRATION & PORTABLE CONTRACT TESTS PASSED.");
}

main().catch((err) => {
  console.error("DOUBLE-BOOKING TEST FAILED:", err);
  process.exit(1);
});
