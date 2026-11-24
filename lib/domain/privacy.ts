import type { BookingRecord, PrivateListingRecord, PublicListing } from "@/lib/types";

/**
 * Explicit ALLOW-LIST serializer for public listings (Non-negotiable Invariant 1).
 * NEVER uses a deny-list. Strictly excludes:
 * - exactBuildingNumber
 * - propertyManagerPhone
 * - legalOwnerPrivateContact
 * - privateOriginalMediaRefs (unprocessed originals)
 * - vehicleOrVesselIdentifier
 * - authorityEvidenceNote
 * - duplicateFlagIds
 * - internal financial splits
 */
export function toPublicListing(record: PrivateListingRecord): PublicListing | null {
  if (record.status !== "approved") {
    return null;
  }

  return {
    listingId: record.listingId,
    category: record.category,
    status: "approved",
    title: record.title,
    summary: record.summary,
    city: record.city,
    area: record.area,
    safeStreetLabel: record.safeStreetLabel,
    rateKobo: record.rateKobo,
    rentalBasis: record.rentalBasis,
    cautionFeeKobo: record.cautionFeeKobo,
    currency: "NGN",
    originatorPartnerId: record.originatorUid,
    originatorDisplayName: record.originatorDisplayName,
    verifiedPropertyBadge: Boolean(record.verifiedPropertyBadge),
    watermarkedPhotos: [...record.watermarkedPhotos],
    watermarkedVideoUrl: record.watermarkedVideoUrl,
    featureIds: [...record.featureIds],
    rules: record.rules ? { ...record.rules } : undefined,
    specs: record.specs ? { ...record.specs } : undefined,
    averageRating: record.averageRating,
    reviewCount: record.reviewCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Operational Admin listing view (Non-negotiable Invariant 2 & PART-04):
 * Operational Admins may contact the authorised agent / review listing details,
 * but MUST NEVER receive `legalOwnerPrivateContact`.
 */
export function toOperationalAdminListing(
  record: PrivateListingRecord
): Omit<PrivateListingRecord, "legalOwnerPrivateContact"> {
  const { legalOwnerPrivateContact: _stripped, ...safeForOpsAdmin } = record;
  void _stripped;
  return safeForOpsAdmin;
}

/**
 * Explicit ALLOW-LIST serializer for customer booking view (CUST-03 & Invariant 7).
 * Never exposes internal ₦10k allocations or ledger categories.
 */
export function toCustomerBookingView(booking: BookingRecord) {
  return {
    bookingRef: booking.bookingRef,
    listingId: booking.listingId,
    listingTitle: booking.listingTitle,
    category: booking.category,
    customerName: booking.customerName,
    startIso: booking.startIso,
    endIso: booking.endIso,
    units: booking.units,
    rentalPrincipalKobo: booking.rentalPrincipalKobo,
    serviceChargeKobo: booking.serviceChargeKobo,
    cautionFeeKobo: booking.cautionFeeKobo,
    extrasKobo: booking.extrasKobo,
    customerTotalKobo: booking.customerTotalKobo,
    currency: booking.currency,
    status: booking.status,
    paymentReference: booking.paymentReference,
    paymentVerified: booking.paymentVerified,
    cautionDepositStatus: booking.cautionDepositStatus,
    cautionRefundRef: booking.cautionRefundRef,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}
