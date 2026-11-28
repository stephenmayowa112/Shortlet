import {
  doc,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import type { ListingCategory } from "@/lib/types";
import type {
  HoldRequest,
  HoldResult,
  PaymentConfirmationResult,
} from "@/lib/repositories/types";

/**
 * Generates deterministic Firestore slot document IDs for overlap prevention (Task 3):
 * - Apartment: half-open [checkIn, checkOut) calendar night keys (`apt_{listingId}_{YYYY-MM-DD}`)
 *   -> adjacent stays where checkOut == nextCheckIn share ZERO slot documents and are allowed.
 * - Boat: 2-hour UTC bucket keys (`boat_{listingId}_{YYYY-MM-DD}_B{00..11}`) over [start, end)
 *   -> aligns with PRD 2-hour boat billing blocks and guarantees overlap prevention.
 * - Car: 1-hour UTC bucket keys (`car_{listingId}_{YYYY-MM-DD}_H{00..23}`) over [start, end)
 *   -> blocks any overlapping 12h/24h/multi-day car ranges while allowing back-to-back handovers.
 */
export function expandDeterministicSlotIds(
  listingId: string,
  category: ListingCategory,
  startIso: string,
  endIso: string
): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid time range: endIso must be strictly after startIso.");
  }

  const safeListingId = listingId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const keys: string[] = [];

  if (category === "apartment") {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    if (limit <= cursor) {
      throw new Error("Apartment stays require at least 1 full night.");
    }
    while (cursor < limit) {
      const ymd = cursor.toISOString().slice(0, 10);
      keys.push(`apt_${safeListingId}_${ymd}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }

  if (category === "boat") {
    const twoHourMs = 2 * 60 * 60 * 1000;
    const startBucket = Math.floor(start.getTime() / twoHourMs);
    const endBucket = Math.ceil(end.getTime() / twoHourMs);
    for (let b = startBucket; b < endBucket; b++) {
      const bucketStart = new Date(b * twoHourMs);
      const ymd = bucketStart.toISOString().slice(0, 10);
      const idx = String(Math.floor(bucketStart.getUTCHours() / 2)).padStart(2, "0");
      keys.push(`boat_${safeListingId}_${ymd}_B${idx}`);
    }
    return keys;
  }

  // Car: 1-hour UTC buckets over [start, end)
  const hourMs = 60 * 60 * 1000;
  const startBucket = Math.floor(start.getTime() / hourMs);
  const endBucket = Math.ceil(end.getTime() / hourMs);
  for (let b = startBucket; b < endBucket; b++) {
    const bucketStart = new Date(b * hourMs);
    const ymd = bucketStart.toISOString().slice(0, 10);
    const hh = String(bucketStart.getUTCHours()).padStart(2, "0");
    keys.push(`car_${safeListingId}_${ymd}_H${hh}`);
  }
  return keys;
}

interface FirestoreSlotDoc {
  slotKey: string;
  listingId: string;
  bookingRef: string;
  holdType: "hold" | "confirmed";
  expiresAtIso?: string;
  createdAt: string;
}

class SlotConflictError extends Error {
  constructor(public readonly conflictingKey: string) {
    super(`Slot conflict on ${conflictingKey}`);
  }
}

/**
 * Real Firestore Transaction Availability Repository (Task 3).
 * Executes atomic multi-slot read+check+write inside `runTransaction` against Firestore
 * (verified against the real Firebase Firestore Emulator under 20+ parallel requests).
 */
export class FirestoreAvailabilityRepository {
  constructor(private readonly db: Firestore) {}

  public async acquireSlotsAtomic(req: HoldRequest): Promise<HoldResult> {
    const nowIso = req.nowIso ?? new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();
    const slotIds = expandDeterministicSlotIds(
      req.listingId,
      req.category,
      req.startIso,
      req.endIso
    );
    const expiresAtIso =
      req.holdType === "hold"
        ? new Date(nowMs + (req.holdMinutes ?? 30) * 60 * 1000).toISOString()
        : undefined;

    try {
      await runTransaction(this.db, async (tx) => {
        const refs = slotIds.map((id) => doc(this.db, "availabilitySlots", id));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));

        for (let i = 0; i < snaps.length; i++) {
          const snap = snaps[i];
          if (!snap.exists()) continue;
          const existing = snap.data() as FirestoreSlotDoc;
          if (existing.bookingRef === req.bookingRef) continue;
          if (existing.holdType === "confirmed") {
            throw new SlotConflictError(slotIds[i]);
          }
          // Lazy expiry: if hold has expired (expiresAtIso <= now), allow atomic overwrite
          if (existing.expiresAtIso && new Date(existing.expiresAtIso).getTime() > nowMs) {
            throw new SlotConflictError(slotIds[i]);
          }
        }

        for (let i = 0; i < refs.length; i++) {
          const payload: FirestoreSlotDoc = {
            slotKey: slotIds[i],
            listingId: req.listingId,
            bookingRef: req.bookingRef,
            holdType: req.holdType,
            createdAt: nowIso,
            ...(expiresAtIso ? { expiresAtIso } : {}),
          };
          tx.set(refs[i], payload);
        }
      });

      return { ok: true, acquiredKeys: slotIds, expiresAtIso };
    } catch (err) {
      if (err instanceof SlotConflictError) {
        return {
          ok: false,
          conflictingKey: err.conflictingKey,
          reason: `Inventory slot ${err.conflictingKey} is already held or confirmed.`,
        };
      }
      throw err;
    }
  }

  /**
   * Confirms a booking ONLY if its hold is still active and exclusively owned by `bookingRef`.
   * If payment arrives AFTER hold expiry (whether or not someone else re-booked the slot),
   * this NEVER causes a double sale — it routes the payment to manual review/refund and
   * writes an immutable audit log entry inside the same transaction.
   */
  public async confirmAfterPaymentAtomic(params: {
    bookingRef: string;
    listingId: string;
    category: ListingCategory;
    startIso: string;
    endIso: string;
    paymentReference: string;
    nowIso?: string;
  }): Promise<PaymentConfirmationResult> {
    const nowIso = params.nowIso ?? new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();
    const slotIds = expandDeterministicSlotIds(
      params.listingId,
      params.category,
      params.startIso,
      params.endIso
    );

    return runTransaction(this.db, async (tx) => {
      const refs = slotIds.map((id) => doc(this.db, "availabilitySlots", id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      let allConfirmedSameBooking = true;
      let holdExpiredOrStolenReason: string | null = null;

      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        if (!snap.exists()) {
          allConfirmedSameBooking = false;
          holdExpiredOrStolenReason = `Hold slot ${slotIds[i]} no longer exists (released/expired).`;
          break;
        }
        const existing = snap.data() as FirestoreSlotDoc;
        if (existing.bookingRef !== params.bookingRef) {
          allConfirmedSameBooking = false;
          holdExpiredOrStolenReason = `Slot ${slotIds[i]} is now held/confirmed by ${existing.bookingRef}.`;
          break;
        }
        if (existing.holdType !== "confirmed") {
          allConfirmedSameBooking = false;
          if (existing.expiresAtIso && new Date(existing.expiresAtIso).getTime() <= nowMs) {
            holdExpiredOrStolenReason = `Hold on ${slotIds[i]} expired at ${existing.expiresAtIso} before payment arrived at ${nowIso}.`;
            break;
          }
        }
      }

      if (allConfirmedSameBooking) {
        return {
          outcome: "already_confirmed",
          reason: "Booking slots already confirmed for this booking reference.",
        };
      }

      if (holdExpiredOrStolenReason) {
        const auditLogId = `AUD-LATE-${params.bookingRef}-${nowMs}`;
        tx.set(doc(this.db, "auditLogs", auditLogId), {
          actorUid: "system_paystack",
          actorRole: "system",
          action: "LATE_PAYMENT_MANUAL_REVIEW_REQUIRED",
          targetType: "booking",
          targetId: params.bookingRef,
          reason: `${holdExpiredOrStolenReason} Payment ${params.paymentReference} routed to manual review/refund to prevent double sale.`,
          afterSummary: `status=refunded_disputed, paymentReference=${params.paymentReference}`,
          createdAt: nowIso,
        });
        tx.set(
          doc(this.db, "bookings", params.bookingRef),
          {
            bookingRef: params.bookingRef,
            status: "refunded_disputed",
            paymentReference: params.paymentReference,
            paymentVerified: true,
            updatedAt: nowIso,
          },
          { merge: true }
        );
        return {
          outcome: "late_payment_manual_review",
          auditLogId,
          reason: holdExpiredOrStolenReason,
        };
      }

      // Upgrade hold -> confirmed atomically
      for (let i = 0; i < refs.length; i++) {
        tx.set(refs[i], {
          slotKey: slotIds[i],
          listingId: params.listingId,
          bookingRef: params.bookingRef,
          holdType: "confirmed",
          createdAt: nowIso,
        } satisfies FirestoreSlotDoc);
      }

      tx.set(
        doc(this.db, "bookings", params.bookingRef),
        {
          bookingRef: params.bookingRef,
          status: "confirmed",
          paymentReference: params.paymentReference,
          paymentVerified: true,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      return {
        outcome: "confirmed",
        reason: "Active hold upgraded to confirmed atomically.",
      };
    });
  }

  /**
   * Cancels a booking and atomically deletes only slot locks owned by `bookingRef`.
   */
  public async cancelAndReleaseSlotsAtomic(params: {
    bookingRef: string;
    listingId: string;
    category: ListingCategory;
    startIso: string;
    endIso: string;
    reason: string;
    actorUid: string;
    actorRole: "partner" | "operational_admin" | "super_admin" | "system";
    nowIso?: string;
  }): Promise<{ releasedKeys: string[] }> {
    const nowIso = params.nowIso ?? new Date().toISOString();
    const slotIds = expandDeterministicSlotIds(
      params.listingId,
      params.category,
      params.startIso,
      params.endIso
    );

    const releasedKeys: string[] = [];
    await runTransaction(this.db, async (tx) => {
      const refs = slotIds.map((id) => doc(this.db, "availabilitySlots", id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        if (!snap.exists()) continue;
        const existing = snap.data() as FirestoreSlotDoc;
        if (existing.bookingRef === params.bookingRef) {
          tx.delete(refs[i]);
          releasedKeys.push(slotIds[i]);
        }
      }

      tx.set(
        doc(this.db, "bookings", params.bookingRef),
        {
          bookingRef: params.bookingRef,
          status: "cancelled",
          updatedAt: nowIso,
        },
        { merge: true }
      );

      tx.set(doc(this.db, "auditLogs", `AUD-CANCEL-${params.bookingRef}-${Date.now()}`), {
        actorUid: params.actorUid,
        actorRole: params.actorRole,
        action: "BOOKING_CANCELLED_SLOTS_RELEASED",
        targetType: "booking",
        targetId: params.bookingRef,
        reason: params.reason,
        afterSummary: `releasedSlots=${releasedKeys.length}`,
        createdAt: nowIso,
      });
    });

    return { releasedKeys };
  }
}
