import type {
  ApartmentRules,
  FeatureCatalogueItem,
  ListingCategory,
  PublicListing,
} from "@/lib/types";

export interface MarketplaceSearchParams {
  category: ListingCategory | "all";
  keyword: string;
  location: string;
  maxPriceKobo?: number;
  selectedFeatureIds: string[];
  smokingAllowedOnly?: boolean;
  partyAllowedOnly?: boolean;
  djAllowedOnly?: boolean;
  minGatheringCapacity?: number;
}

/**
 * Matches free-text keywords against the managed FeatureCatalogue (labels + synonyms),
 * location/area, and title — NEVER treating unspecified features as present (WEB-04).
 */
export function resolveKeywordFeatureMatches(
  keyword: string,
  catalogue: FeatureCatalogueItem[]
): {
  matchedFeatureIds: string[];
  impliedSmokingAllowed: boolean;
  impliedPartyAllowed: boolean;
  impliedDjAllowed: boolean;
  residualTerms: string[];
} {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return {
      matchedFeatureIds: [],
      impliedSmokingAllowed: false,
      impliedPartyAllowed: false,
      impliedDjAllowed: false,
      residualTerms: [],
    };
  }

  const matchedFeatureIds = new Set<string>();
  let remaining = normalized;
  let impliedSmokingAllowed = false;
  let impliedPartyAllowed = false;
  let impliedDjAllowed = false;

  const activeCatalogue = catalogue.filter((item) => item.active);

  // Match longer phrases first (e.g., "private swimming pool" before "pool")
  const candidates: Array<{ phrase: string; featureId: string }> = [];
  for (const item of activeCatalogue) {
    candidates.push({ phrase: item.label.toLowerCase(), featureId: item.featureId });
    for (const syn of item.synonyms) {
      if (syn.trim()) {
        candidates.push({ phrase: syn.trim().toLowerCase(), featureId: item.featureId });
      }
    }
  }
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);

  for (const candidate of candidates) {
    if (remaining.includes(candidate.phrase)) {
      matchedFeatureIds.add(candidate.featureId);
      if (candidate.featureId === "smoking_allowed") impliedSmokingAllowed = true;
      if (candidate.featureId === "party_allowed") impliedPartyAllowed = true;
      if (candidate.featureId === "dj_allowed") impliedDjAllowed = true;
      remaining = remaining.replaceAll(candidate.phrase, " ").trim();
    }
  }

  const residualTerms = remaining
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  return {
    matchedFeatureIds: Array.from(matchedFeatureIds),
    impliedSmokingAllowed,
    impliedPartyAllowed,
    impliedDjAllowed,
    residualTerms,
  };
}

/**
 * Filters ONLY approved public listings by category, location, price,
 * structured feature checkboxes, house rules, capacity, and synonym-aware keyword search.
 */
export function filterPublicListings(
  listings: PublicListing[],
  params: MarketplaceSearchParams,
  catalogue: FeatureCatalogueItem[]
): PublicListing[] {
  const kwResult = resolveKeywordFeatureMatches(params.keyword, catalogue);
  const requiredFeatureIds = new Set<string>([
    ...params.selectedFeatureIds,
    ...kwResult.matchedFeatureIds,
  ]);

  const locQuery = params.location.trim().toLowerCase();

  return listings.filter((listing) => {
    // Non-negotiable Invariant 1: ONLY Approved listings appear in public results
    if (listing.status !== "approved") return false;

    if (params.category !== "all" && listing.category !== params.category) {
      return false;
    }

    if (locQuery) {
      const hay = `${listing.city} ${listing.area} ${listing.safeStreetLabel ?? ""}`.toLowerCase();
      if (!hay.includes(locQuery)) return false;
    }

    if (params.maxPriceKobo && params.maxPriceKobo > 0 && listing.rateKobo > params.maxPriceKobo) {
      return false;
    }

    // Structured feature filtering (apartments carry the detailed catalogue; unspecified is NEVER treated as present)
    if (requiredFeatureIds.size > 0) {
      if (listing.category !== "apartment") {
        // Non-apartments don't carry apartment amenities unless explicitly listed
        for (const fid of requiredFeatureIds) {
          if (!listing.featureIds.includes(fid)) return false;
        }
      } else {
        for (const fid of requiredFeatureIds) {
          if (fid === "smoking_allowed") {
            if (listing.rules?.smokingAllowed !== true) return false;
          } else if (fid === "party_allowed") {
            if (listing.rules?.partyAllowed !== true && !listing.featureIds.includes("party_allowed")) {
              return false;
            }
          } else if (fid === "dj_allowed") {
            if (listing.rules?.djAllowed !== true && !listing.featureIds.includes("dj_allowed")) {
              return false;
            }
          } else if (!listing.featureIds.includes(fid)) {
            return false;
          }
        }
      }
    }

    const rules: ApartmentRules | undefined = listing.rules;
    if ((params.smokingAllowedOnly || kwResult.impliedSmokingAllowed) && rules?.smokingAllowed !== true) {
      return false;
    }
    if ((params.partyAllowedOnly || kwResult.impliedPartyAllowed) && rules?.partyAllowed !== true) {
      return false;
    }
    if ((params.djAllowedOnly || kwResult.impliedDjAllowed) && rules?.djAllowed !== true) {
      return false;
    }
    if (
      params.minGatheringCapacity &&
      params.minGatheringCapacity > 0 &&
      (rules?.maxGatheringGuests ?? 0) < params.minGatheringCapacity
    ) {
      return false;
    }

    // Residual text search (matches title, area, city, category-specific make/model/vessel)
    if (kwResult.residualTerms.length > 0) {
      const searchableText = [
        listing.title,
        listing.city,
        listing.area,
        listing.safeStreetLabel ?? "",
        listing.category,
        listing.originatorDisplayName,
      ]
        .join(" ")
        .toLowerCase();

      for (const term of kwResult.residualTerms) {
        if (!searchableText.includes(term)) return false;
      }
    }

    return true;
  });
}
