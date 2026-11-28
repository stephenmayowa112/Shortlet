import crypto from "node:crypto";
import type {
  AuditLogEntry,
  BookingRecord,
  BookingStatus,
  EnquiryTicket,
  PrivateListingRecord,
  PublicListing,
  SystemConfig,
} from "@/lib/types";
import { expandDeterministicSlotIds } from "@/lib/repositories/firestore-availability-repo";
import type {
  AppendLedgerInput,
  AuditRepository,
  BookingsRepository,
  ConfigRepository,
  HoldRequest,
  HoldResult,
  IdentityDocsRepository,
  ImmutableLedgerRecord,
  LedgerRepository,
  ListingsRepository,
  PaymentConfirmationResult,
  PaymentsRepository,
  RepositoryBundle,
  StoredIdentityDocument,
  StoredPaymentRecord,
  StoredUserAccount,
  TicketsRepository,
  UsersRepository,
} from "@/lib/repositories/types";

interface MemorySlot {
  slotKey: string;
  listingId: string;
  bookingRef: string;
  holdType: "hold" | "confirmed";
  expiresAtIso?: string;
  createdAt: string;
}

const DEFAULT_CONFIG: SystemConfig = {
  operationalAdminCap: 10,
  serviceChargeUnitKobo: 3_000_000,
  adminSplitKobo: 1_000_000,
  founderSplitKobo: 1_000_000,
  adsOpsSplitKobo: 1_000_000,
  carPartialDayCutoffHours: 24,
  roundRobinEnabled: true,
  videoWatermarkEnabled: process.env.VIDEO_WATERMARK_ENABLED === "true",
  identityDocRetentionDays: 365,
  officialWhatsAppNumber: process.env.NEXT_PUBLIC_OFFICIAL_WHATSAPP_NUMBER ?? "2348090001234",
  updatedAt: new Date().toISOString(),
};

/**
 * Clean, portable in-memory implementation of RepositoryBundle.
 * Enforces identical domain invariants (integer kobo, append-only ledger & audit,
 * atomic slot locks, late-payment protection) for Starter Tier runtime & portable tests.
 * Swapping to Supabase/Postgres later only requires replacing this module behind RepositoryBundle.
 */
export function createInMemoryRepositories(): RepositoryBundle {
  const publicListings = new Map<string, PublicListing>();
  const privateListings = new Map<string, PrivateListingRecord>();
  const bookings = new Map<string, BookingRecord>();
  const slots = new Map<string, MemorySlot>();
  const payments = new Map<string, StoredPaymentRecord>();
  const ledgerEntries: ImmutableLedgerRecord[] = [];
  const tickets = new Map<string, EnquiryTicket>();
  const users = new Map<string, StoredUserAccount>();
  const auditLogs: AuditLogEntry[] = [];
  const identityDocs = new Map<string, StoredIdentityDocument>();
  let systemConfig: SystemConfig = { ...DEFAULT_CONFIG };

  const auditRepo: AuditRepository = {
    async append(entry) {
      const record: AuditLogEntry = {
        ...entry,
        logId: `AUD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex")}`,
        createdAt: entry.createdAt ?? new Date().toISOString(),
      };
      auditLogs.unshift(Object.freeze({ ...record }));
      return record;
    },
    async listAll() {
      return auditLogs.map((a) => ({ ...a }));
    },
  };

  const listingsRepo: ListingsRepository = {
    async getApprovedPublicListings() {
      return Array.from(publicListings.values()).filter((l) => l.status === "approved");
    },
    async getPublicListingById(listingId) {
      const found = publicListings.get(listingId);
      return found && found.status === "approved" ? found : null;
    },
    async getPrivateListingById(listingId) {
      return privateListings.get(listingId) ?? null;
    },
    async savePrivateListing(listing) {
      privateListings.set(listing.listingId, { ...listing });
    },
    async publishApprovedListing(listing) {
      if (listing.status !== "approved") {
        throw new Error("Only approved listings can be published to publicListings.");
      }
      publicListings.set(listing.listingId, { ...listing });
    },
  };

  const bookingsRepo: BookingsRepository = {
    async acquireSlotsAtomic(req: HoldRequest): Promise<HoldResult> {
      const nowIso = req.nowIso ?? new Date().toISOString();
      const nowMs = new Date(nowIso).getTime();
      const slotIds = expandDeterministicSlotIds(
        req.listingId,
        req.category,
        req.startIso,
        req.endIso
      );

      for (const id of slotIds) {
        const existing = slots.get(id);
        if (!existing) continue;
        if (existing.bookingRef === req.bookingRef) continue;
        if (existing.holdType === "confirmed") {
          return {
            ok: false,
            conflictingKey: id,
            reason: `Inventory slot ${id} is already confirmed.`,
          };
        }
        if (existing.expiresAtIso && new Date(existing.expiresAtIso).getTime() > nowMs) {
          return {
            ok: false,
            conflictingKey: id,
            reason: `Inventory slot ${id} is actively held until ${existing.expiresAtIso}.`,
          };
        }
      }

      const expiresAtIso =
        req.holdType === "hold"
          ? new Date(nowMs + (req.holdMinutes ?? 30) * 60 * 1000).toISOString()
          : undefined;

      for (const id of slotIds) {
        slots.set(id, {
          slotKey: id,
          listingId: req.listingId,
          bookingRef: req.bookingRef,
          holdType: req.holdType,
          expiresAtIso,
          createdAt: nowIso,
        });
      }

      return { ok: true, acquiredKeys: slotIds, expiresAtIso };
    },

    async confirmAfterPaymentAtomic(params): Promise<PaymentConfirmationResult> {
      const nowIso = params.nowIso ?? new Date().toISOString();
      const nowMs = new Date(nowIso).getTime();
      const slotIds = expandDeterministicSlotIds(
        params.listingId,
        params.category,
        params.startIso,
        params.endIso
      );

      let allConfirmed = true;
      let problem: string | null = null;

      for (const id of slotIds) {
        const existing = slots.get(id);
        if (!existing) {
          allConfirmed = false;
          problem = `Hold slot ${id} expired or was released.`;
          break;
        }
        if (existing.bookingRef !== params.bookingRef) {
          allConfirmed = false;
          problem = `Slot ${id} is now owned by ${existing.bookingRef}.`;
          break;
        }
        if (existing.holdType !== "confirmed") {
          allConfirmed = false;
          if (existing.expiresAtIso && new Date(existing.expiresAtIso).getTime() <= nowMs) {
            problem = `Hold on ${id} expired at ${existing.expiresAtIso} before payment arrived.`;
            break;
          }
        }
      }

      if (allConfirmed) {
        return { outcome: "already_confirmed", reason: "Booking already confirmed." };
      }

      if (problem) {
        const log = await auditRepo.append({
          actorUid: "system_paystack",
          actorRole: "system",
          action: "LATE_PAYMENT_MANUAL_REVIEW_REQUIRED",
          targetType: "booking",
          targetId: params.bookingRef,
          reason: `${problem} Payment ${params.paymentReference} routed to manual review/refund to prevent double sale.`,
          afterSummary: `status=refunded_disputed, paymentReference=${params.paymentReference}`,
          createdAt: nowIso,
        });
        const existingBk = bookings.get(params.bookingRef);
        if (existingBk) {
          bookings.set(params.bookingRef, {
            ...existingBk,
            status: "refunded_disputed",
            paymentReference: params.paymentReference,
            paymentVerified: true,
            updatedAt: nowIso,
          });
        }
        return { outcome: "late_payment_manual_review", auditLogId: log.logId, reason: problem };
      }

      for (const id of slotIds) {
        slots.set(id, {
          slotKey: id,
          listingId: params.listingId,
          bookingRef: params.bookingRef,
          holdType: "confirmed",
          createdAt: nowIso,
        });
      }

      const existingBk = bookings.get(params.bookingRef);
      if (existingBk) {
        bookings.set(params.bookingRef, {
          ...existingBk,
          status: "confirmed",
          paymentReference: params.paymentReference,
          paymentVerified: true,
          updatedAt: nowIso,
        });
      }

      return { outcome: "confirmed", reason: "Active hold upgraded to confirmed." };
    },

    async cancelAndReleaseSlotsAtomic(params) {
      const nowIso = params.nowIso ?? new Date().toISOString();
      const slotIds = expandDeterministicSlotIds(
        params.listingId,
        params.category,
        params.startIso,
        params.endIso
      );
      const releasedKeys: string[] = [];
      for (const id of slotIds) {
        const existing = slots.get(id);
        if (existing && existing.bookingRef === params.bookingRef) {
          slots.delete(id);
          releasedKeys.push(id);
        }
      }
      const existingBk = bookings.get(params.bookingRef);
      if (existingBk) {
        bookings.set(params.bookingRef, {
          ...existingBk,
          status: "cancelled",
          updatedAt: nowIso,
        });
      }
      await auditRepo.append({
        actorUid: params.actorUid,
        actorRole: params.actorRole,
        action: "BOOKING_CANCELLED_SLOTS_RELEASED",
        targetType: "booking",
        targetId: params.bookingRef,
        reason: params.reason,
        afterSummary: `releasedSlots=${releasedKeys.length}`,
        createdAt: nowIso,
      });
      return { releasedKeys };
    },

    async getBooking(bookingRef) {
      return bookings.get(bookingRef) ?? null;
    },

    async listBookingsByContact(normalizedContact) {
      const target = normalizedContact.trim().toLowerCase();
      return Array.from(bookings.values()).filter(
        (b) => b.customerContact.trim().toLowerCase() === target
      );
    },

    async saveBooking(booking) {
      bookings.set(booking.bookingRef, { ...booking });
    },

    async updateBookingStatus(bookingRef, nextStatus: BookingStatus, patch) {
      const existing = bookings.get(bookingRef);
      if (!existing) return null;
      const updated: BookingRecord = {
        ...existing,
        ...patch,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      bookings.set(bookingRef, updated);
      return updated;
    },
  };

  const paymentsRepo: PaymentsRepository = {
    async createOrBindPayment(record) {
      const existingByRef = payments.get(record.paymentReference);
      if (existingByRef && existingByRef.bookingRef !== record.bookingRef) {
        throw new Error(
          `Payment reference ${record.paymentReference} is already bound to booking ${existingByRef.bookingRef}.`
        );
      }
      payments.set(record.paymentReference, { ...record });
    },
    async getPaymentByReference(reference) {
      return payments.get(reference) ?? null;
    },
    async getPaymentByBookingRef(bookingRef) {
      for (const p of payments.values()) {
        if (p.bookingRef === bookingRef) return p;
      }
      return null;
    },
    async updatePayment(reference, patch) {
      const existing = payments.get(reference);
      if (!existing) return null;
      const updated: StoredPaymentRecord = { ...existing, ...patch };
      payments.set(reference, updated);
      return updated;
    },
    async listAllPayments() {
      return Array.from(payments.values());
    },
  };

  const ledgerRepo: LedgerRepository = {
    async appendEntry(input: AppendLedgerInput) {
      if (!Number.isInteger(input.amountKobo)) {
        throw new Error(`Ledger amountKobo must be an integer, got: ${input.amountKobo}`);
      }
      if (input.category !== "reversal_adjustment" && input.amountKobo < 0) {
        throw new Error("Non-reversal ledger entries must have non-negative integer amountKobo.");
      }
      if (input.currency !== "NGN") {
        throw new Error("Only NGN ledger currency is supported in V1.");
      }
      const record: ImmutableLedgerRecord = Object.freeze({
        entryId:
          input.entryId ??
          `LED-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex")}`,
        bookingRef: input.bookingRef,
        category: input.category,
        amountKobo: input.amountKobo,
        currency: input.currency,
        settlementStatus: input.settlementStatus,
        coordinatingAdminUid: input.coordinatingAdminUid,
        paystackReference: input.paystackReference,
        reversesEntryId: input.reversesEntryId,
        notes: input.notes,
        createdAt: input.createdAt ?? new Date().toISOString(),
      });
      ledgerEntries.push(record);
      return record;
    },

    async appendReversal({ reversesEntryId, reason, actorUid, nowIso }) {
      const original = ledgerEntries.find((e) => e.entryId === reversesEntryId);
      if (!original) {
        throw new Error(`Cannot reverse unknown ledger entry: ${reversesEntryId}`);
      }
      if (!reason.trim()) {
        throw new Error("A reversal reason is required for append-only ledger corrections.");
      }
      const reversal = await ledgerRepo.appendEntry({
        bookingRef: original.bookingRef,
        category: "reversal_adjustment",
        amountKobo: -original.amountKobo,
        currency: "NGN",
        settlementStatus: "disputed",
        paystackReference: original.paystackReference,
        reversesEntryId: original.entryId,
        notes: `Reversal of ${original.entryId} (${original.category}) by ${actorUid}: ${reason}`,
        createdAt: nowIso,
      });
      await auditRepo.append({
        actorUid,
        actorRole: "super_admin",
        action: "LEDGER_REVERSAL_APPENDED",
        targetType: "ledger",
        targetId: reversal.entryId,
        reason,
        beforeSummary: `originalEntry=${original.entryId}, amountKobo=${original.amountKobo}`,
        afterSummary: `reversalEntry=${reversal.entryId}, amountKobo=${reversal.amountKobo}`,
        createdAt: nowIso,
      });
      return reversal;
    },

    async listByBookingRef(bookingRef) {
      return ledgerEntries.filter((e) => e.bookingRef === bookingRef).map((e) => ({ ...e }));
    },

    async listAll() {
      return ledgerEntries.map((e) => ({ ...e }));
    },
  };

  const ticketsRepo: TicketsRepository = {
    async getTicket(ticketRef) {
      return tickets.get(ticketRef) ?? null;
    },
    async saveTicket(ticket) {
      tickets.set(ticket.ticketRef, { ...ticket });
    },
    async listAll() {
      return Array.from(tickets.values());
    },
  };

  const usersRepo: UsersRepository = {
    async getUser(uid) {
      return users.get(uid) ?? null;
    },
    async getUserByEmail(email) {
      const lower = email.trim().toLowerCase();
      for (const u of users.values()) {
        if (u.email.toLowerCase() === lower) return u;
      }
      return null;
    },
    async saveUser(user) {
      users.set(user.uid, { ...user });
    },
    async setStatus(uid, status) {
      const existing = users.get(uid);
      if (!existing) return null;
      const updated: StoredUserAccount = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
      };
      users.set(uid, updated);
      return updated;
    },
  };

  const identityDocsRepo: IdentityDocsRepository = {
    async saveMetadata(doc) {
      identityDocs.set(doc.docId, { ...doc });
    },
    async getMetadata(docId) {
      return identityDocs.get(docId) ?? null;
    },
    async listExpired(nowIso) {
      const nowMs = new Date(nowIso).getTime();
      return Array.from(identityDocs.values()).filter(
        (d) => !d.deletedAtIso && new Date(d.retainUntilIso).getTime() <= nowMs
      );
    },
    async markDeleted(docId, deletedAtIso) {
      const existing = identityDocs.get(docId);
      if (existing) {
        identityDocs.set(docId, { ...existing, deletedAtIso });
      }
    },
  };

  const configRepo: ConfigRepository = {
    async getConfig() {
      return { ...systemConfig };
    },
    async updateConfig(patch) {
      systemConfig = {
        ...systemConfig,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return { ...systemConfig };
    },
  };

  return {
    listings: listingsRepo,
    bookings: bookingsRepo,
    payments: paymentsRepo,
    ledger: ledgerRepo,
    tickets: ticketsRepo,
    users: usersRepo,
    audit: auditRepo,
    identityDocs: identityDocsRepo,
    config: configRepo,
  };
}
