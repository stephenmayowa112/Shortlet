"use client";

import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  SlidersHorizontal,
  Heart,
  Star,
  MapPin,
  ShieldCheck,
  Video,
  MessageCircle,
  X,
  Building2,
  Car,
  Ship,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { filterPublicListings } from "@/lib/domain/search";
import type {
  ApartmentSpecs,
  BoatSpecs,
  CarSpecs,
  FeatureGroup,
  ListingCategory,
  PublicListing,
} from "@/lib/types";

interface MarketplaceViewProps {
  onSelectListing: (listing: PublicListing, activeFeatureIds: string[]) => void;
  onNavigateToPortals: () => void;
}

const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  entertainment: "Entertainment",
  views: "Views & Outdoor",
  arrangement: "Arrangement",
  service: "Service Level",
  booking_payment: "Booking & Payment",
  house_rules: "House Rules",
};

export function MarketplaceView({
  onSelectListing,
  onNavigateToPortals,
}: MarketplaceViewProps) {
  const { publicListings, featureCatalogue, guestSavedIds, toggleGuestSave } =
    useMarketplace();

  const [category, setCategory] = useState<ListingCategory | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [maxPriceNaira, setMaxPriceNaira] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [smokingAllowedOnly, setSmokingAllowedOnly] = useState(false);
  const [partyAllowedOnly, setPartyAllowedOnly] = useState(false);
  const [djAllowedOnly, setDjAllowedOnly] = useState(false);
  const [minGatheringCapacity, setMinGatheringCapacity] = useState("");

  const activeCatalogue = useMemo(
    () =>
      featureCatalogue
        .filter((f) => f.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [featureCatalogue]
  );

  const groupedCatalogue = useMemo(() => {
    const groups: Record<FeatureGroup, typeof activeCatalogue> = {
      entertainment: [],
      views: [],
      arrangement: [],
      service: [],
      booking_payment: [],
      house_rules: [],
    };
    for (const item of activeCatalogue) {
      groups[item.group]?.push(item);
    }
    return groups;
  }, [activeCatalogue]);

  const filteredListings = useMemo(() => {
    const maxKobo = maxPriceNaira.trim()
      ? Math.round(Number(maxPriceNaira) * 100)
      : undefined;
    const minCap = minGatheringCapacity.trim()
      ? Math.max(0, Math.floor(Number(minGatheringCapacity)))
      : undefined;

    return filterPublicListings(
      publicListings,
      {
        category,
        keyword,
        location,
        maxPriceKobo: Number.isFinite(maxKobo) ? maxKobo : undefined,
        selectedFeatureIds,
        smokingAllowedOnly,
        partyAllowedOnly,
        djAllowedOnly,
        minGatheringCapacity: Number.isFinite(minCap) ? minCap : undefined,
      },
      featureCatalogue
    );
  }, [
    category,
    djAllowedOnly,
    featureCatalogue,
    keyword,
    location,
    maxPriceNaira,
    minGatheringCapacity,
    partyAllowedOnly,
    publicListings,
    selectedFeatureIds,
    smokingAllowedOnly,
  ]);

  const activeFilterCount =
    selectedFeatureIds.length +
    (smokingAllowedOnly ? 1 : 0) +
    (partyAllowedOnly ? 1 : 0) +
    (djAllowedOnly ? 1 : 0) +
    (minGatheringCapacity ? 1 : 0);

  const toggleFeature = (featureId: string) => {
    setSelectedFeatureIds((prev) =>
      prev.includes(featureId)
        ? prev.filter((id) => id !== featureId)
        : [...prev, featureId]
    );
  };

  const clearAllFilters = () => {
    setCategory("all");
    setKeyword("");
    setLocation("");
    setMaxPriceNaira("");
    setSelectedFeatureIds([]);
    setSmokingAllowedOnly(false);
    setPartyAllowedOnly(false);
    setDjAllowedOnly(false);
    setMinGatheringCapacity("");
  };

  const categoryCounts = useMemo(() => {
    return {
      apartment: publicListings.filter((l) => l.category === "apartment").length,
      car: publicListings.filter((l) => l.category === "car").length,
      boat: publicListings.filter((l) => l.category === "boat").length,
    };
  }, [publicListings]);

  return (
    <div className="space-y-10 sm:space-y-16 pb-12 sm:pb-20">
      {/* 1. Architectural Hero Banner (flows naturally on mobile so search & filters never clip) */}
      <section className="relative bg-[#111318]">
        <div className="relative min-h-[460px] sm:min-h-[540px] w-full flex flex-col justify-end">
          <img
            src="/images/hero_lagos_penthouse.jpg"
            alt="Luxury penthouse terrace overlooking the Lagos Lagoon at golden hour"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111318] via-[#111318]/65 to-[#111318]/35" />

          <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-7 sm:pb-12">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-3xl space-y-3 sm:space-y-4"
            >
              <p className="text-xs sm:text-sm font-medium tracking-wide text-stone-200">
                Lagos Managed Hospitality · Apartments · Chauffeur Cars · Lagoon Yachts
              </p>
              <h1
                className="font-display font-semibold text-white tracking-tight leading-[1.1]"
                style={{
                  fontSize: "clamp(1.75rem, 4.2vw, 3.5rem)",
                  textWrap: "balance",
                }}
              >
                Verified shortlets, executive cars, and private yachts — coordinated by one dedicated desk.
              </h1>
              <p className="text-sm sm:text-base text-stone-200/90 max-w-2xl leading-relaxed">
                Every listing is manually vetted before publication. Request an admin-hosted live video inspection, receive an itemised quote with upfront fees, and pay securely through Paystack.
              </p>
            </motion.div>

            {/* Interactive Search & Category Bar */}
            <div className="mt-6 sm:mt-7 bg-white rounded-xl p-3 sm:p-4 shadow-xl border border-stone-200/90 max-w-5xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-stone-200/80">
                <div
                  role="tablist"
                  aria-label="Listing categories"
                  className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg overflow-x-auto no-scrollbar max-w-full"
                >
                  {(
                    [
                      { id: "all", label: `All (${publicListings.length})` },
                      { id: "apartment", label: `Apartments (${categoryCounts.apartment})` },
                      { id: "car", label: `Cars (${categoryCounts.car})` },
                      { id: "boat", label: `Boats (${categoryCounts.boat})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={category === tab.id}
                      onClick={() => setCategory(tab.id)}
                      className={`px-3 min-h-[38px] sm:min-h-[34px] text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        category === tab.id
                          ? "bg-[#111318] text-white"
                          : "text-stone-600 hover:text-[#111318]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(category === "all" || category === "apartment") && (
                  <button
                    type="button"
                    onClick={() => setMoreFiltersOpen((v) => !v)}
                    className={`inline-flex items-center justify-center gap-2 px-3.5 min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto ${
                      moreFiltersOpen || activeFilterCount > 0
                        ? "border-[#111318] bg-[#111318] text-white"
                        : "border-stone-300 text-[#111318] hover:bg-stone-100"
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    More Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">
                <div className="sm:col-span-5 relative">
                  <label htmlFor="sc-keyword-search" className="sr-only">
                    Search keywords or amenities
                  </label>
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="sc-keyword-search"
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Try “private pool”, “cinema”, “self compound”"
                    className="w-full h-11 pl-10 pr-3 text-base sm:text-sm rounded-lg border border-stone-200 bg-stone-50/60 text-[#111318] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#9A6B32] focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-4 relative">
                  <label htmlFor="sc-location-search" className="sr-only">
                    Area or city
                  </label>
                  <MapPin className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="sc-location-search"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Area (Lekki Phase 1, Old Ikoyi, VI)"
                    className="w-full h-11 pl-10 pr-3 text-base sm:text-sm rounded-lg border border-stone-200 bg-stone-50/60 text-[#111318] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#9A6B32] focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="sc-max-price" className="sr-only">
                    Maximum rate in Naira
                  </label>
                  <input
                    id="sc-max-price"
                    type="number"
                    min={0}
                    step={10000}
                    value={maxPriceNaira}
                    onChange={(e) => setMaxPriceNaira(e.target.value)}
                    placeholder="Max rate (₦)"
                    className="w-full h-11 px-3.5 text-base sm:text-sm font-mono tabular-nums rounded-lg border border-stone-200 bg-stone-50/60 text-[#111318] placeholder:font-sans placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#9A6B32] focus:bg-white"
                  />
                </div>
              </div>

              {/* Structured "More Filters" Panel for Apartments (WEB-04) */}
              {moreFiltersOpen && (category === "all" || category === "apartment") && (
                <div className="mt-4 pt-4 border-t border-stone-200 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-stone-600">
                      Matches verified apartment features and amenities. Unspecified features are never treated as present.
                    </p>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-xs font-medium text-[#9A6B32] hover:underline"
                    >
                      Reset all filters
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {(Object.keys(groupedCatalogue) as FeatureGroup[]).map((groupKey) => {
                      const items = groupedCatalogue[groupKey];
                      if (!items || items.length === 0) return null;
                      return (
                        <fieldset key={groupKey} className="space-y-2">
                          <legend className="text-xs font-semibold text-[#111318] tracking-wide">
                            {FEATURE_GROUP_LABELS[groupKey]}
                          </legend>
                          <div className="space-y-1.5">
                            {items.map((feat) => {
                              const checked = selectedFeatureIds.includes(feat.featureId);
                              return (
                                <label
                                  key={feat.featureId}
                                  className="flex items-center gap-2.5 text-sm text-stone-700 cursor-pointer select-none"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFeature(feat.featureId)}
                                    className="w-4 h-4 rounded border-stone-300 text-[#111318] focus:ring-[#9A6B32]"
                                  />
                                  <span>{feat.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-stone-100">
                    <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smokingAllowedOnly}
                        onChange={(e) => setSmokingAllowedOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-stone-300 text-[#111318]"
                      />
                      Smoking explicitly allowed
                    </label>
                    <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={partyAllowedOnly}
                        onChange={(e) => setPartyAllowedOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-stone-300 text-[#111318]"
                      />
                      Party explicitly allowed
                    </label>
                    <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={djAllowedOnly}
                        onChange={(e) => setDjAllowedOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-stone-300 text-[#111318]"
                      />
                      DJ explicitly allowed
                    </label>
                    <div>
                      <label
                        htmlFor="sc-min-capacity"
                        className="block text-xs font-medium text-stone-600 mb-1"
                      >
                        Min. gathering capacity
                      </label>
                      <input
                        id="sc-min-capacity"
                        type="number"
                        min={1}
                        max={200}
                        value={minGatheringCapacity}
                        onChange={(e) => setMinGatheringCapacity(e.target.value)}
                        placeholder="e.g. 15 guests"
                        className="w-full h-9 px-3 text-sm font-mono tabular-nums rounded-lg border border-stone-200 bg-white text-[#111318]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Category Quick-Entry Strip (WEB-01) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              cat: "apartment" as const,
              title: "Shortlet Apartments",
              subtitle: "₦30,000 service charge per booked night · Live video inspection available",
              icon: Building2,
            },
            {
              cat: "car" as const,
              title: "Executive Cars",
              subtitle: "₦30,000 service charge per 12h/24h chargeable day · Chauffeur options",
              icon: Car,
            },
            {
              cat: "boat" as const,
              title: "Lagoon Boats & Yachts",
              subtitle: "₦30,000 per 2-hour block (rounded up) · Licensed crew & safety gear",
              icon: Ship,
            },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = category === item.cat;
            return (
              <button
                key={item.cat}
                type="button"
                onClick={() => setCategory(isSelected ? "all" : item.cat)}
                className={`text-left p-6 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-[#111318] text-white border-[#111318]"
                    : "bg-white text-[#111318] border-stone-200 hover:border-stone-400"
                }`}
              >
                <div className="flex items-center mb-3">
                  <Icon
                    className={`w-5 h-5 ${
                      isSelected ? "text-amber-300" : "text-[#9A6B32]"
                    }`}
                  />
                </div>
                <h2 className="font-display text-lg font-semibold">{item.title}</h2>
                <p
                  className={`mt-1.5 text-sm leading-relaxed ${
                    isSelected ? "text-stone-300" : "text-stone-600"
                  }`}
                >
                  {item.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Approved Inventory Collection Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#111318] tracking-tight">
              Featured Collection
            </h2>
            <p className="text-sm text-stone-600 mt-1">
              Showing {filteredListings.length} of {publicListings.length} curated listing
              {publicListings.length === 1 ? "" : "s"}.
            </p>
          </div>
          {(keyword || location || maxPriceNaira || activeFilterCount > 0 || category !== "all") && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-[#111318]"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </div>

        {filteredListings.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
            <p className="font-display text-lg font-semibold text-[#111318]">
              No listings match those exact filters
            </p>
            <p className="text-sm text-stone-600 max-w-md mx-auto">
              Shortlet Connect only matches verified, explicitly declared attributes. Try removing one constraint or broadening your location.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-2 inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
            >
              Show All Listings
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {filteredListings.map((listing) => {
              const isSaved = guestSavedIds.includes(listing.listingId);

              const metaParts: string[] = [
                listing.category.charAt(0).toUpperCase() + listing.category.slice(1),
                listing.area,
              ];

              if (listing.category === "apartment" && listing.specs) {
                const s = listing.specs as ApartmentSpecs;
                metaParts.push(`${s.bedrooms} Beds`);
                if (listing.rules?.maxGatheringGuests) {
                  metaParts.push(`Up to ${listing.rules.maxGatheringGuests} guests`);
                }
              } else if (listing.category === "car" && listing.specs) {
                const s = listing.specs as CarSpecs;
                metaParts.push(s.chauffeurIncluded ? "Chauffeur included" : "Self-drive");
              } else if (listing.category === "boat" && listing.specs) {
                const s = listing.specs as BoatSpecs;
                metaParts.push(`Up to ${s.passengerCapacity} passengers`);
              }

              const featureSummary = listing.featureIds
                .slice(0, 3)
                .map(
                  (fid) =>
                    featureCatalogue.find((c) => c.featureId === fid)?.label ??
                    fid.replace(/_/g, " ")
                )
                .join(" · ");

              return (
                <article
                  key={listing.listingId}
                  className="group bg-white border border-stone-200/90 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* 4:3 Watermarked Photography */}
                  <div className="relative aspect-[4/3] bg-stone-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => onSelectListing(listing, selectedFeatureIds)}
                      className="w-full h-full block text-left focus-visible:outline-none"
                    >
                      <img
                        src={listing.watermarkedPhotos[0]}
                        alt={listing.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </button>

                    <button
                      type="button"
                      aria-label={isSaved ? "Remove from saved listings" : "Save listing for later"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGuestSave(listing.listingId);
                      }}
                      className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center text-[#111318] shadow-sm hover:bg-white transition-colors"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isSaved ? "fill-red-600 text-red-600" : "text-stone-700"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Clean Unboxed Metadata & Pricing */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                        <span className="truncate">{metaParts.join(" · ")}</span>
                        {listing.category === "apartment" &&
                          typeof listing.averageRating === "number" && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#111318] shrink-0">
                              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                              {listing.averageRating.toFixed(1)}
                            </span>
                          )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectListing(listing, selectedFeatureIds)}
                        className="text-left block w-full"
                      >
                        <h3 className="font-display text-base font-semibold text-[#111318] leading-snug group-hover:text-[#9A6B32] transition-colors">
                          {listing.title}
                        </h3>
                      </button>

                      {featureSummary && (
                        <p className="text-xs text-stone-500 leading-relaxed">
                          {featureSummary}
                        </p>
                      )}

                      <p className="text-xs text-stone-500">
                        Listed by: {listing.originatorDisplayName}
                        {listing.verifiedPropertyBadge ? " · Verified Property" : ""}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-stone-500">
                        Click to view rates &amp; quote
                      </p>

                      <button
                        type="button"
                        onClick={() => onSelectListing(listing, selectedFeatureIds)}
                        className="px-4 min-h-[44px] sm:min-h-[38px] text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        View Rates &amp; Details
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Managed Trust & Hospitality Standards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-2">
            <Video className="w-5 h-5 text-[#9A6B32]" />
            <h3 className="font-display text-lg font-semibold text-[#111318]">
              Admin-Run Live Video Inspections
            </h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              Before paying, request a scheduled live video walkthrough coordinated by your assigned Shortlet Connect admin alongside the listing agent and on-site housekeeper.
            </p>
          </div>
          <div className="space-y-2">
            <ShieldCheck className="w-5 h-5 text-[#9A6B32]" />
            <h3 className="font-display text-lg font-semibold text-[#111318]">
              Protected Privacy & Zero Double Bookings
            </h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              Exact building numbers and owner contacts stay private until booking confirmation. Database-level slot locks prevent overlapping reservations across nights, cars, and boat blocks.
            </p>
          </div>
          <div className="space-y-3">
            <MessageCircle className="w-5 h-5 text-[#9A6B32]" />
            <h3 className="font-display text-lg font-semibold text-[#111318]">
              Partner With Shortlet Connect
            </h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              Agents, property owners, and managers receive individual verified dashboards with permanent watermark attribution on every published photograph.
            </p>
            <button
              type="button"
              onClick={onNavigateToPortals}
              className="text-sm font-semibold text-[#9A6B32] hover:underline"
            >
              Open Partner & Admin Portals →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
