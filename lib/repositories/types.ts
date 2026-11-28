import type {
  AuditLogEntry,
  BookingRecord,
  BookingStatus,
  EnquiryTicket,
  LedgerCategory,
  LedgerEntry,
  ListingCategory,
  PrivateListingRecord,
  PublicListing,
  SystemConfig,
  UserRole,
} from "@/lib/types";

export interface StoredUserAccount {
  uid: string;
  role: UserRole;
  status: "active" | "pending_review" | "suspended" | "deactivated";
  displayName: string;
  email: string;
  phone?: string;
  mfaEnforced: boolean;
  totpSecretBase32?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPaymentRecord {
  paymentReference: string;
  bookingRef: string;
  expectedAmountKobo: number;
  paidAmountKobo?: number;
  currency: "NGN";
  status:
    | "initialized"
    | "verified"
    | "failed"
    | "underpaid_review"
    | "overpaid_review"
    | "late_payment_review";
  verifiedAtIso?: string;
  gatewayEventIds: string[];
  createdAt: string;
}

export interface StoredIdentityDocument {
  docId: string;
  partnerUid: string;
  idType: "nin_slip" | "international_passport" | "drivers_licence" | "pvc";
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  byteSize: number;
  encryptedStorageKey: string;
  ivHex: string;
  authTagHex: string;
  retainUntilIso: string;
  deletedAtIso?: string;
  uploadedAt: string;
}

export interface HoldRequest {
  listingId: string;
  category: ListingCategory;
  startIso: string;
  endIso: string;
  bookingRef: string;
  holdType: "hold" | "confirmed";
  holdMinutes?: number;
  nowIso?: string;
}

export type HoldResult =
  | { ok: true; acquiredKeys: string[]; expiresAtIso?: string }
  | { ok: false; conflictingKey: string; reason: string };

export interface PaymentConfirmationResult {
  outcome: "confirmed" | "late_payment_manual_review" | "already_confirmed";
  auditLogId?: string;
  reason: string;
}

export interface ListingsRepository {
  getApprovedPublicListings(): Promise<PublicListing[]>;
  getPublicListingById(listingId: string): Promise<PublicListing | null>;
  getPrivateListingById(listingId: string): Promise<PrivateListingRecord | null>;
  savePrivateListing(listing: PrivateListingRecord): Promise<void>;
  publishApprovedListing(listing: PublicListing): Promise<void>;
}

export interface BookingsRepository {
  acquireSlotsAtomic(req: HoldRequest): Promise<HoldResult>;
  confirmAfterPaymentAtomic(params: {
    bookingRef: string;
    listingId: string;
    category: ListingCategory;
    startIso: string;
    endIso: string;
    paymentReference: string;
    nowIso?: string;
  }): Promise<PaymentConfirmationResult>;
  cancelAndReleaseSlotsAtomic(params: {
    bookingRef: string;
    listingId: string;
    category: ListingCategory;
    startIso: string;
    endIso: string;
    reason: string;
    actorUid: string;
    actorRole: "partner" | "operational_admin" | "super_admin" | "system";
    nowIso?: string;
  }): Promise<{ releasedKeys: string[] }>;
  getBooking(bookingRef: string): Promise<BookingRecord | null>;
  listBookingsByContact(normalizedContact: string): Promise<BookingRecord[]>;
  saveBooking(booking: BookingRecord): Promise<void>;
  updateBookingStatus(
    bookingRef: string,
    nextStatus: BookingStatus,
    patch?: Partial<BookingRecord>
  ): Promise<BookingRecord | null>;
}

export interface PaymentsRepository {
  createOrBindPayment(record: StoredPaymentRecord): Promise<void>;
  getPaymentByReference(reference: string): Promise<StoredPaymentRecord | null>;
  getPaymentByBookingRef(bookingRef: string): Promise<StoredPaymentRecord | null>;
  updatePayment(
    reference: string,
    patch: Partial<StoredPaymentRecord>
  ): Promise<StoredPaymentRecord | null>;
  listAllPayments(): Promise<StoredPaymentRecord[]>;
}

export interface AppendLedgerInput {
  entryId?: string;
  bookingRef: string;
  category: LedgerCategory | "reversal_adjustment";
  /** Integer kobo only (negative allowed ONLY for reversal_adjustment entries). */
  amountKobo: number;
  currency: "NGN";
  settlementStatus: LedgerEntry["settlementStatus"];
  coordinatingAdminUid?: string;
  paystackReference?: string;
  reversesEntryId?: string;
  notes?: string;
  createdAt?: string;
}

export interface ImmutableLedgerRecord extends Omit<LedgerEntry, "category"> {
  category: LedgerCategory | "reversal_adjustment";
  reversesEntryId?: string;
}

export interface LedgerRepository {
  /** Strictly append-only; never updates or deletes existing rows. */
  appendEntry(input: AppendLedgerInput): Promise<ImmutableLedgerRecord>;
  appendReversal(params: {
    reversesEntryId: string;
    reason: string;
    actorUid: string;
    nowIso?: string;
  }): Promise<ImmutableLedgerRecord>;
  listByBookingRef(bookingRef: string): Promise<ImmutableLedgerRecord[]>;
  listAll(): Promise<ImmutableLedgerRecord[]>;
}

export interface TicketsRepository {
  getTicket(ticketRef: string): Promise<EnquiryTicket | null>;
  saveTicket(ticket: EnquiryTicket): Promise<void>;
  listAll(): Promise<EnquiryTicket[]>;
}

export interface UsersRepository {
  getUser(uid: string): Promise<StoredUserAccount | null>;
  getUserByEmail(email: string): Promise<StoredUserAccount | null>;
  saveUser(user: StoredUserAccount): Promise<void>;
  setStatus(uid: string, status: StoredUserAccount["status"]): Promise<StoredUserAccount | null>;
}

export interface AuditRepository {
  /** Strictly append-only audit trail. */
  append(entry: Omit<AuditLogEntry, "logId" | "createdAt"> & { createdAt?: string }): Promise<AuditLogEntry>;
  listAll(): Promise<AuditLogEntry[]>;
}

export interface IdentityDocsRepository {
  saveMetadata(doc: StoredIdentityDocument): Promise<void>;
  getMetadata(docId: string): Promise<StoredIdentityDocument | null>;
  listExpired(nowIso: string): Promise<StoredIdentityDocument[]>;
  markDeleted(docId: string, deletedAtIso: string): Promise<void>;
}

export interface ConfigRepository {
  getConfig(): Promise<SystemConfig>;
  updateConfig(patch: Partial<SystemConfig>): Promise<SystemConfig>;
}

export interface RepositoryBundle {
  listings: ListingsRepository;
  bookings: BookingsRepository;
  payments: PaymentsRepository;
  ledger: LedgerRepository;
  tickets: TicketsRepository;
  users: UsersRepository;
  audit: AuditRepository;
  identityDocs: IdentityDocsRepository;
  config: ConfigRepository;
}
