export type ListingCategory = "apartment" | "car" | "boat";

export type UserRole =
  | "guest"
  | "customer"
  | "partner"
  | "operational_admin"
  | "super_admin";

export type PartnerType = "agent" | "owner" | "manager";

export type AcceptedIdType =
  | "nin_slip"
  | "international_passport"
  | "drivers_licence"
  | "pvc";

export type PartnerVerificationStatus =
  | "pending_review"
  | "more_info_requested"
  | "approved"
  | "rejected"
  | "suspended";

export type ListingApprovalStatus =
  | "pending_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "suspended";

export type RentalBasis = "per_night" | "per_12h_or_24h_day" | "per_hour";

export type BookingStatus =
  | "requested"
  | "quoted"
  | "awaiting_payment"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "completed"
  | "cancelled"
  | "refunded_disputed";

export type CautionDepositStatus =
  | "not_applicable"
  | "pending_collection"
  | "collected"
  | "release_proposed"
  | "deduction_proposed"
  | "refunded"
  | "disputed";

export type FeatureGroup =
  | "entertainment"
  | "views"
  | "arrangement"
  | "service"
  | "booking_payment"
  | "house_rules";

export interface FeatureCatalogueItem {
  featureId: string;
  label: string;
  group: FeatureGroup;
  active: boolean;
  synonyms: string[];
  sortOrder: number;
  updatedAt: string;
}

export interface ApartmentRules {
  smokingAllowed: boolean;
  partyAllowed: boolean;
  djAllowed: boolean;
  maxGatheringGuests: number;
  checkInTime: string;
  checkOutTime: string;
  houseNotes?: string;
}

export interface ApartmentSpecs {
  bedrooms: number;
  bathrooms: number;
  maxOvernightGuests: number;
  serviceType: "self_service" | "full_service";
  monthlyPaymentAvailable: boolean;
}

export interface CarSpecs {
  makeModel: string;
  year: number;
  chauffeurIncluded: boolean;
  fuelPolicy: string;
  twelveHourRateKobo: number;
  twentyFourHourRateKobo: number;
  rentalTerms: string;
}

export interface BoatSpecs {
  vesselType: string;
  passengerCapacity: number;
  minimumHours: number;
  boardingJettyArea: string;
  safetyAndUsageTerms: string;
}

export interface PublicListing {
  listingId: string;
  category: ListingCategory;
  status: "approved";
  title: string;
  summary: string;
  city: string;
  area: string;
  safeStreetLabel?: string;
  rateKobo: number;
  rentalBasis: RentalBasis;
  cautionFeeKobo: number;
  currency: "NGN";
  originatorPartnerId: string;
  originatorDisplayName: string;
  verifiedPropertyBadge: boolean;
  watermarkedPhotos: string[];
  watermarkedVideoUrl?: string;
  featureIds: string[];
  rules?: ApartmentRules;
  specs?: ApartmentSpecs | CarSpecs | BoatSpecs;
  averageRating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateListingRecord {
  listingId: string;
  originatorUid: string;
  originatorDisplayName: string;
  designatedAgentUid?: string;
  category: ListingCategory;
  status: ListingApprovalStatus;
  title: string;
  summary: string;
  city: string;
  area: string;
  safeStreetLabel?: string;
  exactBuildingNumber?: string;
  propertyManagerPhone?: string;
  vehicleOrVesselIdentifier?: string;
  authorityEvidenceNote?: string;
  rateKobo: number;
  cautionFeeKobo: number;
  rentalBasis: RentalBasis;
  featureIds: string[];
  rules?: ApartmentRules;
  specs?: ApartmentSpecs | CarSpecs | BoatSpecs;
  watermarkedPhotos: string[];
  privateOriginalMediaRefs: string[];
  watermarkedVideoUrl?: string;
  duplicateFlagIds: string[];
  verifiedPropertyBadge: boolean;
  legalOwnerPrivateContact?: {
    name: string;
    phone: string;
    email?: string;
  };
  ownershipClaimStatus?: "none" | "claim_pending" | "verified_owner_assigned" | "rejected";
  averageRating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerProfile {
  ownerUid: string;
  partnerType: PartnerType;
  legalName: string;
  agencyName?: string;
  displayAttribution: string;
  email: string;
  phone: string;
  channelVerified: boolean;
  idType: AcceptedIdType;
  privateIdDocRef: string;
  verificationStatus: PartnerVerificationStatus;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingStatusHistoryEntry {
  from: BookingStatus | null;
  to: BookingStatus;
  actorUid: string;
  actorRole: UserRole | "system";
  bookingRef: string;
  reason: string;
  atIso: string;
}

export interface BookingRecord {
  bookingRef: string;
  listingId: string;
  listingTitle: string;
  category: ListingCategory;
  customerUid?: string;
  customerContact: string;
  customerName: string;
  assignedAdminUid?: string;
  partnerUid?: string;
  startIso: string;
  endIso: string;
  units: number;
  rentalPrincipalKobo: number;
  serviceChargeKobo: number;
  cautionFeeKobo: number;
  extrasKobo: number;
  customerTotalKobo: number;
  currency: "NGN";
  status: BookingStatus;
  paymentReference?: string;
  paymentVerified: boolean;
  cautionDepositStatus: CautionDepositStatus;
  cautionDeductionKobo?: number;
  cautionRefundRef?: string;
  cautionApproverUid?: string;
  statusHistory: BookingStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export type LedgerCategory =
  | "rental_principal"
  | "service_charge_gross"
  | "coordinating_admin_allocation"
  | "founder_allocation"
  | "ads_ops_allocation"
  | "caution_deposit_liability"
  | "caution_refund_payout";

export interface LedgerEntry {
  entryId: string;
  bookingRef: string;
  category: LedgerCategory;
  amountKobo: number;
  currency: "NGN";
  settlementStatus: "pending" | "collected" | "payable" | "paid" | "disputed";
  coordinatingAdminUid?: string;
  paystackReference?: string;
  notes?: string;
  createdAt: string;
}

export interface TicketMessage {
  messageId: string;
  providerMessageId?: string;
  sender: "customer" | "admin" | "partner_note";
  senderName: string;
  body: string;
  atIso: string;
}

export interface EnquiryTicket {
  ticketRef: string;
  listingId?: string;
  listingTitle?: string;
  customerContact: string;
  customerName: string;
  assignedAdminUid?: string;
  assignedAdminName?: string;
  status: "open" | "in_progress" | "quoted" | "closed";
  lastMessageText: string;
  internalNotes: string;
  messages: TicketMessage[];
  providerMessageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LiveInspection {
  inspectionRef: string;
  listingId: string;
  listingTitle: string;
  customerContact: string;
  customerName: string;
  assignedAdminUid?: string;
  assignedAdminName?: string;
  requestedSlotIso: string;
  scheduledAtIso?: string;
  meetingUrl?: string;
  participants: string[];
  status: "requested" | "scheduled" | "completed" | "cancelled" | "no_show";
  outcomeNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApartmentReview {
  reviewId: string;
  bookingRef: string;
  listingId: string;
  authorUid?: string;
  authorDisplayName: string;
  rating: number;
  comment: string;
  moderationStatus: "pending" | "approved" | "hidden" | "removed";
  moderationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportIssue {
  issueId: string;
  bookingRef: string;
  listingId: string;
  assignedAdminUid?: string;
  severity: "low" | "medium" | "high" | "escalated_super_admin";
  summary: string;
  status: "open" | "escalated" | "closed";
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  logId: string;
  actorUid: string;
  actorRole: "partner" | "operational_admin" | "super_admin" | "system";
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  beforeSummary?: string;
  afterSummary?: string;
  createdAt: string;
}

export interface SystemConfig {
  operationalAdminCap: number;
  serviceChargeUnitKobo: number;
  adminSplitKobo: number;
  founderSplitKobo: number;
  adsOpsSplitKobo: number;
  carPartialDayCutoffHours: number;
  roundRobinEnabled: boolean;
  videoWatermarkEnabled: boolean;
  identityDocRetentionDays: number;
  officialWhatsAppNumber: string;
  updatedAt: string;
}

export interface StaffAccount {
  uid: string;
  displayName: string;
  email: string;
  role: "operational_admin" | "super_admin";
  status: "active" | "suspended" | "deactivated";
  mfaEnforced: boolean;
  createdAt: string;
}
