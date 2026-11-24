import type { FeatureCatalogueItem, PublicListing } from "@/lib/types";

export interface WhatsAppEnquiryContext {
  officialNumber: string;
  baseUrl: string;
  listing: PublicListing;
  selectedFeatureIds?: string[];
  catalogue?: FeatureCatalogueItem[];
  checkIn?: string;
  checkOut?: string;
  durationLabel?: string;
}

/**
 * Builds a context-aware WhatsApp deep link (MSG-03) to the single official Shortlet Connect number.
 * Contains: listing name, stable listing ID, canonical direct URL, selected search filters, and booking details.
 * NEVER includes private owner contacts, exact restricted addresses, or internal financial splits.
 */
export function buildWhatsAppDeepLink(ctx: WhatsAppEnquiryContext): {
  url: string;
  prefilledMessage: string;
  canonicalListingUrl: string;
} {
  const digitsOnly = ctx.officialNumber.replace(/\D/g, "") || "2348090001234";
  const cleanBase = ctx.baseUrl.replace(/\/$/, "");
  const canonicalListingUrl = `${cleanBase}/?listing=${encodeURIComponent(ctx.listing.listingId)}`;

  const featureLabels = (ctx.selectedFeatureIds ?? [])
    .map((id) => ctx.catalogue?.find((c) => c.featureId === id)?.label ?? id.replace(/_/g, " "))
    .filter(Boolean);

  const lines: string[] = [
    `Hello Shortlet Connect, I would like to enquire about:`,
    `Listing: ${ctx.listing.title}`,
    `Listing ID: ${ctx.listing.listingId}`,
    `Category: ${ctx.listing.category.charAt(0).toUpperCase() + ctx.listing.category.slice(1)} (${ctx.listing.area}, ${ctx.listing.city})`,
    `Direct Link: ${canonicalListingUrl}`,
  ];

  if (featureLabels.length > 0) {
    lines.push(`Selected Preferences: ${featureLabels.join(", ")}`);
  }

  if (ctx.checkIn && ctx.checkOut) {
    lines.push(`Requested Dates: ${ctx.checkIn} to ${ctx.checkOut}`);
  } else if (ctx.durationLabel) {
    lines.push(`Requested Duration: ${ctx.durationLabel}`);
  }

  lines.push(`Please confirm availability and provide an itemised quote.`);

  const prefilledMessage = lines.join("\n");
  const url = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(prefilledMessage)}`;

  return { url, prefilledMessage, canonicalListingUrl };
}
