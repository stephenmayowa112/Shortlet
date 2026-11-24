import type { ListingCategory } from "@/lib/types";

export interface SlotHold {
  slotKey: string;
  listingId: string;
  bookingRef: string;
  holdType: "hold" | "confirmed";
  expiresAtIso?: string;
  createdAt: string;
}

/**
 * Generates deterministic atomic slot keys for overlap prevention:
 * - Apartment: half-open [checkIn, checkOut) nightly keys (e.g. apt-1_2026-12-01)
 * - Car: hourly/half-day block keys over [startIso, endIso)
 * - Boat: hourly block keys over [startIso, endIso)
 */
export function expandSlotKeys(
  listingId: string,
  category: ListingCategory,
  startIso: string,
  endIso: string
): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid time range: end must be strictly after start.");
  }

  const keys: string[] = [];

  if (category === "apartment") {
    // Half-open [checkIn, checkOut) nights in UTC calendar dates
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    if (limit <= cursor) {
      throw new Error("Apartment stays require at least 1 full night.");
    }
    while (cursor < limit) {
      const ymd = cursor.toISOString().slice(0, 10);
      keys.push(`${listingId}_night_${ymd}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }

  // Car and boat use hourly slots in half-open [start, end) range
  const hourMs = 60 * 60 * 1000;
  const startBucket = Math.floor(start.getTime() / hourMs);
  const endBucket = Math.ceil(end.getTime() / hourMs);
  const prefix = category === "car" ? "carh" : "boath";

  for (let b = startBucket; b < endBucket; b++) {
    keys.push(`${listingId}_${prefix}_${b}`);
  }
  return keys;
}

/**
 * Concurrency-safe in-process lock manager mirroring Firestore transaction semantics
 * (used for server-side atomic checks and deterministic concurrency tests).
 */
export class AtomicAvailabilityLockStore {
  private slots = new Map<string, SlotHold>();

  public async acquireHold(params: {
    listingId: string;
    category: ListingCategory;
    startIso: string;
    endIso: string;
    bookingRef: string;
    holdType: "hold" | "confirmed";
    holdMinutes?: number;
    nowIso?: string;
  }): Promise<{ ok: true; acquiredKeys: string[] } | { ok: false; conflictingKey: string }> {
    const now = new Date(params.nowIso ?? new Date().toISOString());
    const keys = expandSlotKeys(params.listingId, params.category, params.startIso, params.endIso);

    // Atomic check phase (no await between check and write -> single JS turn serializability)
    for (const key of keys) {
      const existing = this.slots.get(key);
      if (!existing) continue;
      if (existing.bookingRef === params.bookingRef) continue;
      if (existing.holdType === "confirmed") {
        return { ok: false, conflictingKey: key };
      }
      if (existing.expiresAtIso && new Date(existing.expiresAtIso) > now) {
        return { ok: false, conflictingKey: key };
      }
    }

    const expiresAtIso =
      params.holdType === "hold"
        ? new Date(now.getTime() + (params.holdMinutes ?? 30) * 60 * 1000).toISOString()
        : undefined;

    for (const key of keys) {
      this.slots.set(key, {
        slotKey: key,
        listingId: params.listingId,
        bookingRef: params.bookingRef,
        holdType: params.holdType,
        expiresAtIso,
        createdAt: now.toISOString(),
      });
    }

    return { ok: true, acquiredKeys: keys };
  }

  public releaseBooking(bookingRef: string): void {
    for (const [k, v] of this.slots.entries()) {
      if (v.bookingRef === bookingRef) {
        this.slots.delete(k);
      }
    }
  }
}

export const serverAvailabilityStore = new AtomicAvailabilityLockStore();
