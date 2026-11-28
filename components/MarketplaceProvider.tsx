"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  auth,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from "@/lib/firebase/client";
import { fetchApprovedPublicListingsCountFromFirestore } from "@/lib/repositories/client-listings";
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_BOOKINGS,
  INITIAL_FEATURE_CATALOGUE,
  INITIAL_INSPECTIONS,
  INITIAL_LEDGER_ENTRIES,
  INITIAL_PARTNER_PROFILES,
  INITIAL_PRIVATE_LISTINGS,
  INITIAL_REVIEWS,
  INITIAL_STAFF_ACCOUNTS,
  INITIAL_SUPPORT_ISSUES,
  INITIAL_SYSTEM_CONFIG,
  INITIAL_TICKETS,
} from "@/lib/seed-data";
import { toPublicListing } from "@/lib/domain/privacy";
import { detectPotentialDuplicates } from "@/lib/domain/duplicate-detection";
import { calculateStaffQuote, extractPricingConfig } from "@/lib/domain/pricing";
import { transitionBookingStatus } from "@/lib/domain/booking-lifecycle";
import { whatsappAdapter } from "@/lib/adapters/whatsapp-provider";
import type {
  ApartmentReview,
  AuditLogEntry,
  BookingRecord,
  BookingStatus,
  CautionDepositStatus,
  EnquiryTicket,
  FeatureCatalogueItem,
  LedgerEntry,
  ListingApprovalStatus,
  LiveInspection,
  PartnerProfile,
  PartnerVerificationStatus,
  PrivateListingRecord,
  PublicListing,
  StaffAccount,
  SupportIssue,
  SystemConfig,
  UserRole,
} from "@/lib/types";

const SAVED_STORAGE_KEY = "sc_guest_saved_listing_ids_v1";

export interface CustomerOtpSession {
  sessionToken: string;
  contact: string;
  verifiedAtIso: string;
  expiresAtIso: string;
}

interface MarketplaceContextValue {
  // Auth & Role workspace
  firebaseUser: User | null;
  authReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  activePartnerUid: string;
  setActivePartnerUid: (uid: string) => void;
  activeOpsAdminUid: string;
  setActiveOpsAdminUid: (uid: string) => void;

  // Customer Passwordless OTP Session (CUST-02, CUST-03)
  customerSession: CustomerOtpSession | null;
  setCustomerSession: (session: CustomerOtpSession | null) => void;

  // Local guest saved listings & merged verified saves (CUST-01, CUST-03)
  guestSavedIds: string[];
  verifiedSavedIds: string[];
  toggleGuestSave: (listingId: string) => void;
  mergeGuestSavesIntoVerifiedProfile: () => void;

  // Core data collections
  publicListings: PublicListing[];
  privateListings: PrivateListingRecord[];
  featureCatalogue: FeatureCatalogueItem[];
  partnerProfiles: PartnerProfile[];
  staffAccounts: StaffAccount[];
  bookings: BookingRecord[];
  ledgerEntries: LedgerEntry[];
  tickets: EnquiryTicket[];
  inspections: LiveInspection[];
  reviews: ApartmentReview[];
  supportIssues: SupportIssue[];
  auditLogs: AuditLogEntry[];
  systemConfig: SystemConfig;

  // Actions — Partner & Listing Lifecycle
  registerPartnerProfile: (profile: Omit<PartnerProfile, "verificationStatus" | "createdAt" | "updatedAt">) => void;
  reviewPartnerProfile: (partnerUid: string, status: PartnerVerificationStatus, reason: string) => void;
  submitPartnerListing: (listing: Omit<PrivateListingRecord, "listingId" | "status" | "duplicateFlagIds" | "verifiedPropertyBadge" | "createdAt" | "updatedAt">) => { listingId: string; duplicateCount: number };
  reviewListingSubmission: (listingId: string, status: ListingApprovalStatus, reason: string, verifiedPropertyBadge?: boolean) => void;
  resolveOwnershipClaim: (listingId: string, resolution: "verified_owner_assigned" | "rejected", reason: string) => void;

  // Actions — Booking, Paystack & Caution Refunds
  createVerifiedBooking: (params: {
    bookingRef: string;
    listing: PublicListing;
    customerName: string;
    customerContact: string;
    startIso: string;
    endIso: string;
    quantity: number;
    carUnitMode?: "hours" | "days";
    paymentReference: string;
    paymentVerifiedServerSide: boolean;
  }) => BookingRecord;
  updateBookingState: (bookingRef: string, to: BookingStatus, reason: string, superAdminException?: boolean) => void;
  proposeCautionAction: (bookingRef: string, action: "release_proposed" | "deduction_proposed" | "disputed", deductionKobo: number, notes: string) => void;
  approveCautionRefund: (bookingRef: string, refundRef: string, reason: string) => void;
  markLedgerSettled: (entryId: string, status: LedgerEntry["settlementStatus"], reason: string) => void;

  // Actions — Messaging & Inspections
  recordInboundEnquiry: (params: { customerName: string; customerContact: string; text: string; providerMessageId: string }) => { created: boolean; duplicate: boolean; ticketRef?: string };
  assignTicket: (ticketRef: string, adminUid: string, reason: string) => void;
  linkTicketToListing: (ticketRef: string, listingId: string) => void;
  replyToTicket: (ticketRef: string, body: string, internalNote?: string) => void;
  requestLiveInspection: (params: { listing: PublicListing; customerName: string; customerContact: string; requestedSlotIso: string }) => LiveInspection;
  updateInspection: (inspectionRef: string, patch: Partial<Pick<LiveInspection, "scheduledAtIso" | "meetingUrl" | "participants" | "status" | "outcomeNotes">>) => void;

  // Actions — Reviews & Support
  submitApartmentReview: (params: { bookingRef: string; listingId: string; authorDisplayName: string; rating: number; comment: string }) => { ok: boolean; error?: string };
  moderateReview: (reviewId: string, status: ApartmentReview["moderationStatus"], reason: string) => void;
  createSupportIssue: (params: { bookingRef: string; listingId: string; severity: SupportIssue["severity"]; summary: string }) => void;
  updateSupportIssue: (issueId: string, status: SupportIssue["status"], resolutionNotes?: string) => void;

  // Actions — Super Admin Catalogue, Staff & Config
  upsertFeatureCatalogueItem: (item: Omit<FeatureCatalogueItem, "updatedAt">) => void;
  toggleFeatureActive: (featureId: string) => void;
  updateStaffStatus: (uid: string, status: StaffAccount["status"], reason: string) => void;
  addOperationalAdmin: (displayName: string, email: string) => { ok: boolean; error?: string };
  updateSystemConfig: (patch: Partial<SystemConfig>, reason: string) => void;

  // Toast feedback
  toastMessage: string | null;
  notify: (msg: string) => void;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeRole, setActiveRole] = useState<UserRole>("guest");
  const [activePartnerUid, setActivePartnerUid] = useState<string>("partner_wave");
  const [activeOpsAdminUid, setActiveOpsAdminUid] = useState<string>("ops_admin_01");
  const [customerSession, setCustomerSession] = useState<CustomerOtpSession | null>(null);

  const enableDemoSeed =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true";

  const [guestSavedIds, setGuestSavedIds] = useState<string[]>([]);
  const [verifiedSavedIds, setVerifiedSavedIds] = useState<string[]>(
    enableDemoSeed ? ["SC-APT-101"] : []
  );

  const [privateListings, setPrivateListings] = useState<PrivateListingRecord[]>(
    enableDemoSeed ? INITIAL_PRIVATE_LISTINGS : []
  );
  const [featureCatalogue, setFeatureCatalogue] =
    useState<FeatureCatalogueItem[]>(INITIAL_FEATURE_CATALOGUE);
  const [partnerProfiles, setPartnerProfiles] = useState<PartnerProfile[]>(
    enableDemoSeed ? INITIAL_PARTNER_PROFILES : []
  );
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>(
    enableDemoSeed ? INITIAL_STAFF_ACCOUNTS : []
  );
  const [bookings, setBookings] = useState<BookingRecord[]>(
    enableDemoSeed ? INITIAL_BOOKINGS : []
  );
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(
    enableDemoSeed ? INITIAL_LEDGER_ENTRIES : []
  );
  const [tickets, setTickets] = useState<EnquiryTicket[]>(
    enableDemoSeed ? INITIAL_TICKETS : []
  );
  const [inspections, setInspections] = useState<LiveInspection[]>(
    enableDemoSeed ? INITIAL_INSPECTIONS : []
  );
  const [reviews, setReviews] = useState<ApartmentReview[]>(
    enableDemoSeed ? INITIAL_REVIEWS : []
  );
  const [supportIssues, setSupportIssues] = useState<SupportIssue[]>(
    enableDemoSeed ? INITIAL_SUPPORT_ISSUES : []
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(
    enableDemoSeed ? INITIAL_AUDIT_LOGS : []
  );
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(INITIAL_SYSTEM_CONFIG);
  const [rrIndex, setRrIndex] = useState<number>(0);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Load guest saves from browser localStorage (CUST-01)
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setGuestSavedIds(parsed.filter((x): x is string => typeof x === "string"));
          }
        }
      } catch {
        // Ignore storage unavailable
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Boot Firebase connection check + auth listener
  useEffect(() => {
    void testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user?.email === "stephenmayowa112@gmail.com" && user.emailVerified) {
        // Hydrate approved public listings from Firestore if present
        void (async () => {
          try {
            const count = await fetchApprovedPublicListingsCountFromFirestore();
            if (count > 0) {
              console.info(`Connected to Firestore (${count} public listings synced).`);
            }
          } catch (error) {
            // Surface structured Firestore permission diagnostics without crashing public UI
            try {
              handleFirestoreError(error, OperationType.LIST, "publicListings");
            } catch {
              // Logged cleanly by handleFirestoreError
            }
          }
        })();
      }
    });
    return () => unsub();
  }, []);

  const appendAudit = useCallback(
    (entry: Omit<AuditLogEntry, "logId" | "createdAt">) => {
      const now = new Date().toISOString();
      const full: AuditLogEntry = {
        ...entry,
        logId: `AUD-${Date.now().toString(36).toUpperCase()}`,
        createdAt: now,
      };
      setAuditLogs((prev) => [full, ...prev]);
    },
    []
  );

  // Explicit allow-list derived public listings (Invariant 1: ONLY Approved listings)
  const publicListings = useMemo(() => {
    return privateListings
      .map((rec) => toPublicListing(rec))
      .filter((item): item is PublicListing => item !== null);
  }, [privateListings]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      if (cred.user.email === "stephenmayowa112@gmail.com") {
        setActiveRole("super_admin");
        notify(`Signed in as Super Admin (${cred.user.email}).`);
      } else {
        notify(`Signed in as ${cred.user.displayName ?? cred.user.email}.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Google sign-in was cancelled.");
    }
  }, [notify]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setActiveRole("guest");
    notify("Signed out safely.");
  }, [notify]);

  const toggleGuestSave = useCallback(
    (listingId: string) => {
      setGuestSavedIds((prev) => {
        const next = prev.includes(listingId)
          ? prev.filter((id) => id !== listingId)
          : [...prev, listingId];
        try {
          window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  const mergeGuestSavesIntoVerifiedProfile = useCallback(() => {
    if (!customerSession) return;
    setVerifiedSavedIds((prev) => Array.from(new Set([...prev, ...guestSavedIds])));
    notify(`Merged ${guestSavedIds.length} device saved listing(s) into your verified profile.`);
  }, [customerSession, guestSavedIds, notify]);

  const registerPartnerProfile = useCallback(
    (profile: Omit<PartnerProfile, "verificationStatus" | "createdAt" | "updatedAt">) => {
      const now = new Date().toISOString();
      const created: PartnerProfile = {
        ...profile,
        verificationStatus: "pending_review",
        createdAt: now,
        updatedAt: now,
      };
      setPartnerProfiles((prev) => [
        created,
        ...prev.filter((p) => p.ownerUid !== profile.ownerUid),
      ]);
      setActivePartnerUid(created.ownerUid);
      appendAudit({
        actorUid: created.ownerUid,
        actorRole: "partner",
        action: "PARTNER_REGISTRATION_SUBMITTED",
        targetType: "partner_profile",
        targetId: created.ownerUid,
        reason: `New ${created.partnerType} registration submitted with ${created.idType}; OTP channel verified=${created.channelVerified}.`,
        afterSummary: `status=pending_review, attribution=${created.displayAttribution}`,
      });
      notify("Partner registration submitted — status is Pending Review until Super Admin approval.");
    },
    [appendAudit, notify]
  );

  const reviewPartnerProfile = useCallback(
    (partnerUid: string, status: PartnerVerificationStatus, reason: string) => {
      const target = partnerProfiles.find((p) => p.ownerUid === partnerUid);
      if (!target) return;
      const now = new Date().toISOString();
      setPartnerProfiles((prev) =>
        prev.map((p) =>
          p.ownerUid === partnerUid
            ? { ...p, verificationStatus: status, reviewNotes: reason, updatedAt: now }
            : p
        )
      );
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: `PARTNER_${status.toUpperCase()}`,
        targetType: "partner_profile",
        targetId: partnerUid,
        reason: reason.trim() || `Status updated to ${status}`,
        beforeSummary: `verificationStatus=${target.verificationStatus}`,
        afterSummary: `verificationStatus=${status}`,
      });
      notify(`Partner ${target.legalName} marked ${status.replace(/_/g, " ")}.`);
    },
    [appendAudit, firebaseUser?.uid, notify, partnerProfiles]
  );

  const submitPartnerListing = useCallback(
    (
      listing: Omit<
        PrivateListingRecord,
        "listingId" | "status" | "duplicateFlagIds" | "verifiedPropertyBadge" | "createdAt" | "updatedAt"
      >
    ) => {
      const partner = partnerProfiles.find((p) => p.ownerUid === listing.originatorUid);
      if (!partner || partner.verificationStatus !== "approved") {
        throw new Error(
          "Only approved, active partners may submit listings. Suspended or unapproved partners are blocked."
        );
      }

      const now = new Date().toISOString();
      const prefix =
        listing.category === "apartment"
          ? "SC-APT"
          : listing.category === "car"
          ? "SC-CAR"
          : "SC-BOAT";
      const listingId = `${prefix}-${Math.floor(400 + Math.random() * 599)}`;

      const matches = detectPotentialDuplicates(
        { ...listing, listingId },
        privateListings
      );
      const duplicateFlagIds = matches.map((m) => m.existingListingId);

      const created: PrivateListingRecord = {
        ...listing,
        listingId,
        status: "pending_review",
        duplicateFlagIds,
        verifiedPropertyBadge: false,
        ownershipClaimStatus: "none",
        createdAt: now,
        updatedAt: now,
      };

      setPrivateListings((prev) => [created, ...prev]);
      appendAudit({
        actorUid: listing.originatorUid,
        actorRole: "partner",
        action: "LISTING_SUBMITTED",
        targetType: "listing",
        targetId: listingId,
        reason:
          duplicateFlagIds.length > 0
            ? `Submitted with ${duplicateFlagIds.length} duplicate flag(s): ${duplicateFlagIds.join(", ")}`
            : "New listing submitted for Super Admin review.",
        afterSummary: `status=pending_review, category=${listing.category}`,
      });

      notify(
        duplicateFlagIds.length > 0
          ? `Listing ${listingId} submitted (Pending Review) — flagged for duplicate check against ${duplicateFlagIds.join(", ")}.`
          : `Listing ${listingId} submitted and is Pending Super Admin Review.`
      );
      return { listingId, duplicateCount: duplicateFlagIds.length };
    },
    [appendAudit, notify, partnerProfiles, privateListings]
  );

  const reviewListingSubmission = useCallback(
    (
      listingId: string,
      status: ListingApprovalStatus,
      reason: string,
      verifiedPropertyBadge?: boolean
    ) => {
      const target = privateListings.find((l) => l.listingId === listingId);
      if (!target) return;
      const now = new Date().toISOString();

      setPrivateListings((prev) =>
        prev.map((l) =>
          l.listingId === listingId
            ? {
                ...l,
                status,
                verifiedPropertyBadge:
                  typeof verifiedPropertyBadge === "boolean"
                    ? verifiedPropertyBadge
                    : l.verifiedPropertyBadge,
                updatedAt: now,
              }
            : l
        )
      );

      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: `LISTING_${status.toUpperCase()}`,
        targetType: "listing",
        targetId: listingId,
        reason: reason.trim() || `Listing status changed to ${status}`,
        beforeSummary: `status=${target.status}, verifiedBadge=${target.verifiedPropertyBadge}`,
        afterSummary: `status=${status}, verifiedBadge=${verifiedPropertyBadge ?? target.verifiedPropertyBadge}`,
      });
      notify(`Listing ${listingId} updated to ${status.replace(/_/g, " ")}.`);
    },
    [appendAudit, firebaseUser?.uid, notify, privateListings]
  );

  const resolveOwnershipClaim = useCallback(
    (
      listingId: string,
      resolution: "verified_owner_assigned" | "rejected",
      reason: string
    ) => {
      const target = privateListings.find((l) => l.listingId === listingId);
      if (!target) return;
      const now = new Date().toISOString();
      setPrivateListings((prev) =>
        prev.map((l) =>
          l.listingId === listingId
            ? { ...l, ownershipClaimStatus: resolution, updatedAt: now }
            : l
        )
      );
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: "OWNERSHIP_CLAIM_RESOLVED",
        targetType: "listing",
        targetId: listingId,
        reason,
        beforeSummary: `ownershipClaimStatus=${target.ownershipClaimStatus ?? "none"}`,
        afterSummary: `ownershipClaimStatus=${resolution}`,
      });
      notify(`Ownership claim on ${listingId} resolved (${resolution.replace(/_/g, " ")}).`);
    },
    [appendAudit, firebaseUser?.uid, notify, privateListings]
  );

  const createVerifiedBooking = useCallback(
    (params: {
      bookingRef: string;
      listing: PublicListing;
      customerName: string;
      customerContact: string;
      startIso: string;
      endIso: string;
      quantity: number;
      carUnitMode?: "hours" | "days";
      paymentReference: string;
      paymentVerifiedServerSide: boolean;
    }) => {
      const pricingCfg = extractPricingConfig(systemConfig);
      const staffQuote = calculateStaffQuote({
        category: params.listing.category,
        quantity: params.quantity,
        carUnitMode: params.carUnitMode,
        unitRateKobo: params.listing.rateKobo,
        cautionFeeKobo: params.listing.cautionFeeKobo,
        config: pricingCfg,
      });

      const activeAdmins = staffAccounts
        .filter((s) => s.role === "operational_admin" && s.status === "active")
        .map((s) => s.uid);
      const assignedAdminUid = activeAdmins[0] ?? "ops_admin_01";
      const now = new Date().toISOString();

      const status: BookingStatus = params.paymentVerifiedServerSide
        ? "confirmed"
        : "awaiting_payment";

      const newBooking: BookingRecord = {
        bookingRef: params.bookingRef,
        listingId: params.listing.listingId,
        listingTitle: params.listing.title,
        category: params.listing.category,
        customerContact: params.customerContact.trim().toLowerCase(),
        customerName: params.customerName.trim(),
        assignedAdminUid,
        partnerUid: params.listing.originatorPartnerId,
        startIso: params.startIso,
        endIso: params.endIso,
        units: staffQuote.chargeableUnits,
        rentalPrincipalKobo: staffQuote.rentalPrincipalKobo,
        serviceChargeKobo: staffQuote.serviceChargeKobo,
        cautionFeeKobo: staffQuote.cautionFeeKobo,
        extrasKobo: staffQuote.extrasKobo,
        customerTotalKobo: staffQuote.customerTotalKobo,
        currency: "NGN",
        status,
        paymentReference: params.paymentReference,
        paymentVerified: params.paymentVerifiedServerSide,
        cautionDepositStatus:
          staffQuote.cautionFeeKobo > 0
            ? params.paymentVerifiedServerSide
              ? "collected"
              : "pending_collection"
            : "not_applicable",
        statusHistory: [
          {
            from: null,
            to: status,
            actorUid: "system",
            actorRole: "system",
            bookingRef: params.bookingRef,
            reason: params.paymentVerifiedServerSide
              ? `Paystack server-side verified (${params.paymentReference})`
              : "Awaiting server-side verified payment",
            atIso: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      setBookings((prev) => [newBooking, ...prev]);

      // Write separated internal ledger entries (FIN-02 — staff-only, NEVER returned to customer)
      if (params.paymentVerifiedServerSide) {
        const prefix = `LED-${Date.now().toString(36).toUpperCase()}`;
        const newLedger: LedgerEntry[] = [
          {
            entryId: `${prefix}-RP`,
            bookingRef: params.bookingRef,
            category: "rental_principal",
            amountKobo: staffQuote.rentalPrincipalKobo,
            currency: "NGN",
            settlementStatus: "payable",
            paystackReference: params.paymentReference,
            notes: `Main rental money for ${params.listing.listingId}`,
            createdAt: now,
          },
          {
            entryId: `${prefix}-SC`,
            bookingRef: params.bookingRef,
            category: "service_charge_gross",
            amountKobo: staffQuote.serviceChargeKobo,
            currency: "NGN",
            settlementStatus: "collected",
            paystackReference: params.paymentReference,
            notes: `${staffQuote.chargeableUnits} chargeable unit(s) gross service charge`,
            createdAt: now,
          },
          {
            entryId: `${prefix}-AD`,
            bookingRef: params.bookingRef,
            category: "coordinating_admin_allocation",
            amountKobo: staffQuote.internalAllocations.coordinatingAdminKobo,
            currency: "NGN",
            settlementStatus: "pending",
            coordinatingAdminUid: assignedAdminUid,
            paystackReference: params.paymentReference,
            notes: "₦10,000/unit coordinating admin allocation",
            createdAt: now,
          },
          {
            entryId: `${prefix}-FN`,
            bookingRef: params.bookingRef,
            category: "founder_allocation",
            amountKobo: staffQuote.internalAllocations.founderKobo,
            currency: "NGN",
            settlementStatus: "collected",
            paystackReference: params.paymentReference,
            notes: "₦10,000/unit founder/business owner allocation",
            createdAt: now,
          },
          {
            entryId: `${prefix}-OP`,
            bookingRef: params.bookingRef,
            category: "ads_ops_allocation",
            amountKobo: staffQuote.internalAllocations.adsAndOpsKobo,
            currency: "NGN",
            settlementStatus: "collected",
            paystackReference: params.paymentReference,
            notes: "₦10,000/unit advertising & website operations allocation",
            createdAt: now,
          },
        ];
        if (staffQuote.cautionFeeKobo > 0) {
          newLedger.push({
            entryId: `${prefix}-CD`,
            bookingRef: params.bookingRef,
            category: "caution_deposit_liability",
            amountKobo: staffQuote.cautionFeeKobo,
            currency: "NGN",
            settlementStatus: "collected",
            paystackReference: params.paymentReference,
            notes: "Refundable caution deposit held as liability (not revenue)",
            createdAt: now,
          });
        }
        setLedgerEntries((prev) => [...newLedger, ...prev]);

        appendAudit({
          actorUid: "system",
          actorRole: "system",
          action: "PAYMENT_VERIFIED_BOOKING_CONFIRMED",
          targetType: "booking",
          targetId: params.bookingRef,
          reason: `Paystack server verification succeeded (${params.paymentReference}).`,
          afterSummary: `status=confirmed, totalKobo=${staffQuote.customerTotalKobo}`,
        });
      }

      return newBooking;
    },
    [appendAudit, staffAccounts, systemConfig]
  );

  const updateBookingState = useCallback(
    (
      bookingRef: string,
      to: BookingStatus,
      reason: string,
      superAdminException = false
    ) => {
      const existing = bookings.find((b) => b.bookingRef === bookingRef);
      if (!existing) return;
      const actorRole = activeRole === "super_admin" ? "super_admin" : "operational_admin";
      const actorUid =
        actorRole === "super_admin"
          ? firebaseUser?.uid ?? "super_admin_01"
          : activeOpsAdminUid;

      try {
        const updated = transitionBookingStatus({
          booking: existing,
          to,
          actorUid,
          actorRole,
          reason,
          superAdminException,
        });
        setBookings((prev) =>
          prev.map((b) => (b.bookingRef === bookingRef ? updated : b))
        );
        appendAudit({
          actorUid,
          actorRole,
          action: `BOOKING_${to.toUpperCase()}`,
          targetType: "booking",
          targetId: bookingRef,
          reason,
          beforeSummary: `status=${existing.status}`,
          afterSummary: `status=${to}`,
        });
        notify(`Booking ${bookingRef} moved to ${to.replace(/_/g, " ")}.`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Invalid status transition.");
      }
    },
    [activeOpsAdminUid, activeRole, appendAudit, bookings, firebaseUser?.uid, notify]
  );

  const proposeCautionAction = useCallback(
    (
      bookingRef: string,
      action: "release_proposed" | "deduction_proposed" | "disputed",
      deductionKobo: number,
      notes: string
    ) => {
      const target = bookings.find((b) => b.bookingRef === bookingRef);
      if (!target) return;
      const now = new Date().toISOString();
      setBookings((prev) =>
        prev.map((b) =>
          b.bookingRef === bookingRef
            ? {
                ...b,
                cautionDepositStatus: action,
                cautionDeductionKobo: deductionKobo,
                updatedAt: now,
              }
            : b
        )
      );
      appendAudit({
        actorUid: activeOpsAdminUid,
        actorRole: "operational_admin",
        action: `CAUTION_${action.toUpperCase()}`,
        targetType: "booking",
        targetId: bookingRef,
        reason: notes || `Caution deposit action proposed: ${action}`,
        beforeSummary: `cautionDepositStatus=${target.cautionDepositStatus}`,
        afterSummary: `cautionDepositStatus=${action}, deductionKobo=${deductionKobo}`,
      });
      notify(`Caution deposit proposal recorded for ${bookingRef} — awaiting Super Admin approval.`);
    },
    [activeOpsAdminUid, appendAudit, bookings, notify]
  );

  const approveCautionRefund = useCallback(
    (bookingRef: string, refundRef: string, reason: string) => {
      const target = bookings.find((b) => b.bookingRef === bookingRef);
      if (!target) return;
      const now = new Date().toISOString();
      const approverUid = firebaseUser?.uid ?? "super_admin_01";
      const refundAmount = Math.max(
        0,
        target.cautionFeeKobo - (target.cautionDeductionKobo ?? 0)
      );

      setBookings((prev) =>
        prev.map((b) =>
          b.bookingRef === bookingRef
            ? {
                ...b,
                cautionDepositStatus: "refunded" as CautionDepositStatus,
                cautionRefundRef: refundRef,
                cautionApproverUid: approverUid,
                updatedAt: now,
              }
            : b
        )
      );

      setLedgerEntries((prev) => [
        {
          entryId: `LED-RFD-${Date.now().toString(36).toUpperCase()}`,
          bookingRef,
          category: "caution_refund_payout",
          amountKobo: refundAmount,
          currency: "NGN",
          settlementStatus: "paid",
          paystackReference: refundRef,
          notes: `Approved by ${approverUid}: ${reason}`,
          createdAt: now,
        },
        ...prev,
      ]);

      appendAudit({
        actorUid: approverUid,
        actorRole: "super_admin",
        action: "CAUTION_REFUND_APPROVED",
        targetType: "booking",
        targetId: bookingRef,
        reason,
        beforeSummary: `cautionDepositStatus=${target.cautionDepositStatus}`,
        afterSummary: `cautionDepositStatus=refunded, ref=${refundRef}, amountKobo=${refundAmount}`,
      });
      notify(`Caution refund ${refundRef} approved and customer notified.`);
    },
    [appendAudit, bookings, firebaseUser?.uid, notify]
  );

  const markLedgerSettled = useCallback(
    (entryId: string, status: LedgerEntry["settlementStatus"], reason: string) => {
      const target = ledgerEntries.find((e) => e.entryId === entryId);
      if (!target) return;
      setLedgerEntries((prev) =>
        prev.map((e) => (e.entryId === entryId ? { ...e, settlementStatus: status } : e))
      );
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: "LEDGER_SETTLEMENT_UPDATED",
        targetType: "ledger_entry",
        targetId: entryId,
        reason,
        beforeSummary: `settlementStatus=${target.settlementStatus}`,
        afterSummary: `settlementStatus=${status}`,
      });
      notify(`Ledger entry ${entryId} marked ${status}.`);
    },
    [appendAudit, firebaseUser?.uid, ledgerEntries, notify]
  );

  const recordInboundEnquiry = useCallback(
    (params: {
      customerName: string;
      customerContact: string;
      text: string;
      providerMessageId: string;
    }) => {
      const allSeenIds = tickets.flatMap((t) => t.providerMessageIds);
      if (whatsappAdapter.isDuplicateMessage(params.providerMessageId, allSeenIds)) {
        return { created: false, duplicate: true };
      }

      const parsed = whatsappAdapter.parseListingIdFromText(params.text);
      const matchedListing = parsed.detectedListingId
        ? publicListings.find((l) => l.listingId === parsed.detectedListingId)
        : undefined;

      const activeAdminUids = staffAccounts
        .filter((s) => s.role === "operational_admin" && s.status === "active")
        .map((s) => s.uid);

      let assignedAdminUid: string | undefined = undefined;
      if (systemConfig.roundRobinEnabled && activeAdminUids.length > 0) {
        const pick = whatsappAdapter.pickNextRoundRobinAdmin(activeAdminUids, rrIndex);
        assignedAdminUid = pick.adminUid ?? undefined;
        setRrIndex(pick.nextIndex);
      }

      const assignedStaff = staffAccounts.find((s) => s.uid === assignedAdminUid);
      const now = new Date().toISOString();
      const ticketRef = `TKT-WA-${Math.floor(1050 + Math.random() * 8900)}`;

      const created: EnquiryTicket = {
        ticketRef,
        listingId: matchedListing?.listingId ?? parsed.detectedListingId,
        listingTitle: matchedListing?.title,
        customerContact: params.customerContact,
        customerName: params.customerName,
        assignedAdminUid,
        assignedAdminName: assignedStaff?.displayName,
        status: "open",
        lastMessageText: params.text,
        internalNotes: parsed.needsManualLookup
          ? "Prefilled listing ID not detected — use Manual Listing Lookup to attach listing."
          : "Auto-matched listing ID from official WhatsApp enquiry.",
        messages: [
          {
            messageId: `msg_${Date.now().toString(36)}`,
            providerMessageId: params.providerMessageId,
            sender: "customer",
            senderName: params.customerName,
            body: params.text,
            atIso: now,
          },
        ],
        providerMessageIds: [params.providerMessageId],
        createdAt: now,
        updatedAt: now,
      };

      setTickets((prev) => [created, ...prev]);
      notify(`Inbound WhatsApp ticket ${ticketRef} logged in official shared inbox.`);
      return { created: true, duplicate: false, ticketRef };
    },
    [notify, publicListings, rrIndex, staffAccounts, systemConfig.roundRobinEnabled, tickets]
  );

  const assignTicket = useCallback(
    (ticketRef: string, adminUid: string, reason: string) => {
      const target = tickets.find((t) => t.ticketRef === ticketRef);
      const admin = staffAccounts.find((s) => s.uid === adminUid);
      if (!target || !admin) return;
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketRef === ticketRef
            ? {
                ...t,
                assignedAdminUid: admin.uid,
                assignedAdminName: admin.displayName,
                status: t.status === "open" ? "in_progress" : t.status,
                updatedAt: now,
              }
            : t
        )
      );
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: "TICKET_REASSIGNED",
        targetType: "ticket",
        targetId: ticketRef,
        reason: reason.trim() || `Assigned to ${admin.displayName}`,
        beforeSummary: `assignedAdminUid=${target.assignedAdminUid ?? "unassigned"}`,
        afterSummary: `assignedAdminUid=${admin.uid}`,
      });
      notify(`Ticket ${ticketRef} assigned to ${admin.displayName}.`);
    },
    [appendAudit, firebaseUser?.uid, notify, staffAccounts, tickets]
  );

  const linkTicketToListing = useCallback(
    (ticketRef: string, listingId: string) => {
      const listing = publicListings.find((l) => l.listingId === listingId);
      if (!listing) return;
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketRef === ticketRef
            ? {
                ...t,
                listingId: listing.listingId,
                listingTitle: listing.title,
                updatedAt: now,
              }
            : t
        )
      );
      notify(`Linked ticket ${ticketRef} to ${listing.listingId}.`);
    },
    [notify, publicListings]
  );

  const replyToTicket = useCallback(
    (ticketRef: string, body: string, internalNote?: string) => {
      const admin = staffAccounts.find((s) => s.uid === activeOpsAdminUid);
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketRef === ticketRef
            ? {
                ...t,
                lastMessageText: body.trim() || t.lastMessageText,
                internalNotes:
                  internalNote !== undefined ? internalNote : t.internalNotes,
                messages: body.trim()
                  ? [
                      ...t.messages,
                      {
                        messageId: `m_${Date.now().toString(36)}`,
                        sender: "admin",
                        senderName: admin?.displayName ?? "Operational Admin",
                        body: body.trim(),
                        atIso: now,
                      },
                    ]
                  : t.messages,
                updatedAt: now,
              }
            : t
        )
      );
      notify(`Updated conversation on ${ticketRef}.`);
    },
    [activeOpsAdminUid, notify, staffAccounts]
  );

  const requestLiveInspection = useCallback(
    (params: {
      listing: PublicListing;
      customerName: string;
      customerContact: string;
      requestedSlotIso: string;
    }) => {
      const now = new Date().toISOString();
      const admin = staffAccounts.find(
        (s) => s.role === "operational_admin" && s.status === "active"
      );
      const created: LiveInspection = {
        inspectionRef: `INS-${Date.now().toString(36).toUpperCase()}`,
        listingId: params.listing.listingId,
        listingTitle: params.listing.title,
        customerContact: params.customerContact.trim().toLowerCase(),
        customerName: params.customerName.trim(),
        assignedAdminUid: admin?.uid,
        assignedAdminName: admin?.displayName,
        requestedSlotIso: params.requestedSlotIso,
        participants: [
          `${params.customerName.trim()} (Guest)`,
          `${params.listing.originatorDisplayName} (Authorized Agent)`,
          "On-site Representative",
          `${admin?.displayName ?? "Assigned Admin"} (Admin)`,
        ],
        status: "requested",
        createdAt: now,
        updatedAt: now,
      };
      setInspections((prev) => [created, ...prev]);
      notify(`Live video inspection requested (${created.inspectionRef}). An admin will confirm your meeting link.`);
      return created;
    },
    [notify, staffAccounts]
  );

  const updateInspection = useCallback(
    (
      inspectionRef: string,
      patch: Partial<
        Pick<
          LiveInspection,
          "scheduledAtIso" | "meetingUrl" | "participants" | "status" | "outcomeNotes"
        >
      >
    ) => {
      const now = new Date().toISOString();
      setInspections((prev) =>
        prev.map((i) =>
          i.inspectionRef === inspectionRef ? { ...i, ...patch, updatedAt: now } : i
        )
      );
      notify(`Inspection ${inspectionRef} updated.`);
    },
    [notify]
  );

  const submitApartmentReview = useCallback(
    (params: {
      bookingRef: string;
      listingId: string;
      authorDisplayName: string;
      rating: number;
      comment: string;
    }) => {
      const booking = bookings.find((b) => b.bookingRef === params.bookingRef);
      if (!booking) {
        return { ok: false, error: "Booking reference not found." };
      }
      if (booking.category !== "apartment") {
        return { ok: false, error: "Reviews are enabled for completed apartment stays only in Version 1." };
      }
      if (booking.status !== "completed") {
        return { ok: false, error: "Only completed apartment bookings are eligible to leave a review." };
      }
      if (reviews.some((r) => r.bookingRef === params.bookingRef)) {
        return { ok: false, error: "A review has already been submitted for this booking." };
      }
      if (params.rating < 1 || params.rating > 5) {
        return { ok: false, error: "Rating must be between 1 and 5 stars." };
      }

      const now = new Date().toISOString();
      const review: ApartmentReview = {
        reviewId: `REV-${params.bookingRef}`,
        bookingRef: params.bookingRef,
        listingId: params.listingId,
        authorDisplayName: params.authorDisplayName,
        rating: Math.round(params.rating),
        comment: params.comment.trim(),
        moderationStatus: "pending",
        createdAt: now,
        updatedAt: now,
      };
      setReviews((prev) => [review, ...prev]);
      notify("Thank you! Your verified apartment review has been submitted for policy moderation.");
      return { ok: true };
    },
    [bookings, notify, reviews]
  );

  const moderateReview = useCallback(
    (
      reviewId: string,
      status: ApartmentReview["moderationStatus"],
      reason: string
    ) => {
      const target = reviews.find((r) => r.reviewId === reviewId);
      if (!target) return;
      if ((status === "hidden" || status === "removed") && reason.trim().length < 8) {
        notify("Policy requires a documented moderation reason (spam, abuse, fake, or policy violation). Genuine negative reviews must not be removed.");
        return;
      }
      const now = new Date().toISOString();
      const nextReviews = reviews.map((r) =>
        r.reviewId === reviewId
          ? { ...r, moderationStatus: status, moderationReason: reason.trim(), updatedAt: now }
          : r
      );
      setReviews(nextReviews);

      // Recompute approved average rating on the apartment listing
      const approvedForListing = nextReviews.filter(
        (r) => r.listingId === target.listingId && r.moderationStatus === "approved"
      );
      const avg =
        approvedForListing.length > 0
          ? Number(
              (
                approvedForListing.reduce((acc, r) => acc + r.rating, 0) /
                approvedForListing.length
              ).toFixed(1)
            )
          : undefined;

      setPrivateListings((prev) =>
        prev.map((l) =>
          l.listingId === target.listingId
            ? { ...l, averageRating: avg, reviewCount: approvedForListing.length }
            : l
        )
      );

      appendAudit({
        actorUid:
          activeRole === "super_admin"
            ? firebaseUser?.uid ?? "super_admin_01"
            : activeOpsAdminUid,
        actorRole: activeRole === "super_admin" ? "super_admin" : "operational_admin",
        action: `REVIEW_${status.toUpperCase()}`,
        targetType: "review",
        targetId: reviewId,
        reason: reason.trim() || `Review marked ${status}`,
        beforeSummary: `moderationStatus=${target.moderationStatus}`,
        afterSummary: `moderationStatus=${status}`,
      });
      notify(`Review ${reviewId} marked ${status}.`);
    },
    [activeOpsAdminUid, activeRole, appendAudit, firebaseUser?.uid, notify, reviews]
  );

  const createSupportIssue = useCallback(
    (params: {
      bookingRef: string;
      listingId: string;
      severity: SupportIssue["severity"];
      summary: string;
    }) => {
      const now = new Date().toISOString();
      const created: SupportIssue = {
        issueId: `SUP-${Date.now().toString(36).toUpperCase()}`,
        bookingRef: params.bookingRef,
        listingId: params.listingId,
        assignedAdminUid: activeOpsAdminUid,
        severity: params.severity,
        summary: params.summary.trim(),
        status: params.severity === "escalated_super_admin" ? "escalated" : "open",
        createdAt: now,
        updatedAt: now,
      };
      setSupportIssues((prev) => [created, ...prev]);
      notify(`Support issue ${created.issueId} logged against ${params.bookingRef}.`);
    },
    [activeOpsAdminUid, notify]
  );

  const updateSupportIssue = useCallback(
    (issueId: string, status: SupportIssue["status"], resolutionNotes?: string) => {
      if (status === "closed" && (!resolutionNotes || resolutionNotes.trim().length < 6)) {
        notify("Closing a support issue requires resolution notes (SUP-01).");
        return;
      }
      const now = new Date().toISOString();
      setSupportIssues((prev) =>
        prev.map((s) =>
          s.issueId === issueId
            ? {
                ...s,
                status,
                severity: status === "escalated" ? "escalated_super_admin" : s.severity,
                resolutionNotes: resolutionNotes ?? s.resolutionNotes,
                updatedAt: now,
              }
            : s
        )
      );
      notify(`Support issue ${issueId} updated to ${status}.`);
    },
    [notify]
  );

  const upsertFeatureCatalogueItem = useCallback(
    (item: Omit<FeatureCatalogueItem, "updatedAt">) => {
      const now = new Date().toISOString();
      setFeatureCatalogue((prev) => {
        const exists = prev.some((f) => f.featureId === item.featureId);
        if (exists) {
          return prev.map((f) =>
            f.featureId === item.featureId ? { ...item, updatedAt: now } : f
          );
        }
        return [...prev, { ...item, updatedAt: now }];
      });
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: "FEATURE_CATALOGUE_UPDATED",
        targetType: "feature_catalogue",
        targetId: item.featureId,
        reason: `Saved feature label '${item.label}' (${item.synonyms.length} synonyms).`,
      });
      notify(`Apartment filter '${item.label}' saved with stable ID ${item.featureId}.`);
    },
    [appendAudit, firebaseUser?.uid, notify]
  );

  const toggleFeatureActive = useCallback(
    (featureId: string) => {
      const now = new Date().toISOString();
      setFeatureCatalogue((prev) =>
        prev.map((f) =>
          f.featureId === featureId ? { ...f, active: !f.active, updatedAt: now } : f
        )
      );
      notify(`Updated filter status for ${featureId}.`);
    },
    [notify]
  );

  const updateStaffStatus = useCallback(
    (uid: string, status: StaffAccount["status"], reason: string) => {
      const target = staffAccounts.find((s) => s.uid === uid);
      if (!target) return;
      setStaffAccounts((prev) =>
        prev.map((s) => (s.uid === uid ? { ...s, status } : s))
      );
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: `STAFF_${status.toUpperCase()}`,
        targetType: "staff_account",
        targetId: uid,
        reason,
        beforeSummary: `status=${target.status}`,
        afterSummary: `status=${status}`,
      });
      notify(`Staff account ${target.displayName} is now ${status}.`);
    },
    [appendAudit, firebaseUser?.uid, notify, staffAccounts]
  );

  const addOperationalAdmin = useCallback(
    (displayName: string, email: string) => {
      const activeOpsCount = staffAccounts.filter(
        (s) => s.role === "operational_admin" && s.status === "active"
      ).length;
      if (activeOpsCount >= systemConfig.operationalAdminCap) {
        return {
          ok: false,
          error: `Operational admin limit (${systemConfig.operationalAdminCap}) reached. Increase the configurable limit in System Config to add more.`,
        };
      }
      const created: StaffAccount = {
        uid: `ops_admin_${Date.now().toString(36)}`,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        role: "operational_admin",
        status: "active",
        mfaEnforced: false,
        createdAt: new Date().toISOString(),
      };
      setStaffAccounts((prev) => [...prev, created]);
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: "OPERATIONAL_ADMIN_CREATED",
        targetType: "staff_account",
        targetId: created.uid,
        reason: `Added operational admin ${created.email}.`,
      });
      notify(`Operational Admin ${created.displayName} added.`);
      return { ok: true };
    },
    [appendAudit, firebaseUser?.uid, notify, staffAccounts, systemConfig.operationalAdminCap]
  );

  const updateSystemConfig = useCallback(
    (patch: Partial<SystemConfig>, reason: string) => {
      const next: SystemConfig = {
        ...systemConfig,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      if (
        next.adminSplitKobo + next.founderSplitKobo + next.adsOpsSplitKobo !==
        next.serviceChargeUnitKobo
      ) {
        notify("The three internal splits must always sum exactly to the service charge unit.");
        return;
      }
      setSystemConfig(next);
      appendAudit({
        actorUid: firebaseUser?.uid ?? "super_admin_01",
        actorRole: "super_admin",
        action: "SYSTEM_CONFIG_UPDATED",
        targetType: "system_config",
        targetId: "global",
        reason,
        beforeSummary: `adminCap=${systemConfig.operationalAdminCap}, rr=${systemConfig.roundRobinEnabled}, vidWm=${systemConfig.videoWatermarkEnabled}`,
        afterSummary: `adminCap=${next.operationalAdminCap}, rr=${next.roundRobinEnabled}, vidWm=${next.videoWatermarkEnabled}`,
      });
      notify("Global system configuration updated and logged.");
    },
    [appendAudit, firebaseUser?.uid, notify, systemConfig]
  );

  const value: MarketplaceContextValue = {
    firebaseUser,
    authReady,
    signInWithGoogle,
    signOutUser,
    activeRole,
    setActiveRole,
    activePartnerUid,
    setActivePartnerUid,
    activeOpsAdminUid,
    setActiveOpsAdminUid,
    customerSession,
    setCustomerSession,
    guestSavedIds,
    verifiedSavedIds,
    toggleGuestSave,
    mergeGuestSavesIntoVerifiedProfile,
    publicListings,
    privateListings,
    featureCatalogue,
    partnerProfiles,
    staffAccounts,
    bookings,
    ledgerEntries,
    tickets,
    inspections,
    reviews,
    supportIssues,
    auditLogs,
    systemConfig,
    registerPartnerProfile,
    reviewPartnerProfile,
    submitPartnerListing,
    reviewListingSubmission,
    resolveOwnershipClaim,
    createVerifiedBooking,
    updateBookingState,
    proposeCautionAction,
    approveCautionRefund,
    markLedgerSettled,
    recordInboundEnquiry,
    assignTicket,
    linkTicketToListing,
    replyToTicket,
    requestLiveInspection,
    updateInspection,
    submitApartmentReview,
    moderateReview,
    createSupportIssue,
    updateSupportIssue,
    upsertFeatureCatalogueItem,
    toggleFeatureActive,
    updateStaffStatus,
    addOperationalAdmin,
    updateSystemConfig,
    toastMessage,
    notify,
  };

  return (
    <MarketplaceContext.Provider value={value}>
      {children}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) {
    throw new Error("useMarketplace must be used inside MarketplaceProvider.");
  }
  return ctx;
}
