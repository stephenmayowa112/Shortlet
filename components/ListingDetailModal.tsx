"use client";

import React, { useMemo, useState } from "react";
import {
  X,
  Heart,
  MessageCircle,
  Video,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Star,
  Download,
  CreditCard,
  Clock,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import {
  calculateCustomerQuote,
  computeHalfOpenNights,
  extractPricingConfig,
  formatNairaFromKobo,
} from "@/lib/domain/pricing";
import { buildWhatsAppDeepLink } from "@/lib/domain/whatsapp";
import type {
  ApartmentSpecs,
  BoatSpecs,
  CarSpecs,
  PublicListing,
} from "@/lib/types";

interface ListingDetailModalProps {
  listing: PublicListing;
  selectedFeatureIds: string[];
  onClose: () => void;
  onNavigateToBookings: () => void;
}

export function ListingDetailModal({
  listing,
  selectedFeatureIds,
  onClose,
  onNavigateToBookings,
}: ListingDetailModalProps) {
  const {
    featureCatalogue,
    guestSavedIds,
    toggleGuestSave,
    systemConfig,
    reviews,
    recordInboundEnquiry,
    requestLiveInspection,
    createVerifiedBooking,
    notify,
  } = useMarketplace();

  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Booking calculator states by category
  const [checkIn, setCheckIn] = useState("2026-12-10");
  const [checkOut, setCheckOut] = useState("2026-12-13");
  const [carMode, setCarMode] = useState<"12h" | "24h" | "3d">("24h");
  const [boatHours, setBoatHours] = useState<number>(3);
  const [boatDate, setBoatDate] = useState("2026-12-12");

  // Guest checkout details (passwordless booking per CUST-02)
  const [customerName, setCustomerName] = useState("Adaeze Nwankwo");
  const [customerContact, setCustomerContact] = useState("adaeze.guest@example.com");

  // Inspection request panel
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [inspectionSlot, setInspectionSlot] = useState("2026-12-08T14:00");

  // Paystack checkout state machine (demonstrating browser redirect alone NEVER confirms)
  const [checkoutStep, setCheckoutStep] = useState<
    "quote" | "awaiting_paystack" | "confirmed"
  >("quote");
  const [pendingBookingRef, setPendingBookingRef] = useState<string>("");
  const [pendingPaystackRef, setPendingPaystackRef] = useState<string>("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const isSaved = guestSavedIds.includes(listing.listingId);

  const pricingConfig = useMemo(
    () => extractPricingConfig(systemConfig),
    [systemConfig]
  );

  // Compute transparent customer quote (NEVER exposes internal ₦10k split)
  const quoteResult = useMemo(() => {
    try {
      if (listing.category === "apartment") {
        const nights = computeHalfOpenNights(checkIn, checkOut);
        return {
          error: null,
          quantity: nights,
          carUnitMode: undefined as "hours" | "days" | undefined,
          startIso: `${checkIn}T14:00:00.000Z`,
          endIso: `${checkOut}T12:00:00.000Z`,
          durationLabel: `${checkIn} to ${checkOut} (${nights} nights)`,
          quote: calculateCustomerQuote({
            category: "apartment",
            quantity: nights,
            unitRateKobo: listing.rateKobo,
            cautionFeeKobo: listing.cautionFeeKobo,
            config: pricingConfig,
          }),
        };
      }

      if (listing.category === "car") {
        const specs = listing.specs as CarSpecs | undefined;
        const is12h = carMode === "12h";
        const is24h = carMode === "24h";
        const quantity = is12h ? 12 : is24h ? 24 : 3;
        const unitMode: "hours" | "days" = is12h || is24h ? "hours" : "days";
        const rate = is12h
          ? specs?.twelveHourRateKobo ?? listing.rateKobo
          : specs?.twentyFourHourRateKobo ?? listing.rateKobo;

        const start = new Date(`${boatDate}T09:00:00.000Z`);
        const end = new Date(
          start.getTime() + (is12h ? 12 : is24h ? 24 : 72) * 60 * 60 * 1000
        );

        return {
          error: null,
          quantity,
          carUnitMode: unitMode,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          durationLabel:
            is12h ? "12-hour rental" : is24h ? "24-hour rental" : "3-day rental",
          quote: calculateCustomerQuote({
            category: "car",
            quantity,
            carUnitMode: unitMode,
            unitRateKobo: rate,
            cautionFeeKobo: listing.cautionFeeKobo,
            config: pricingConfig,
          }),
        };
      }

      // Boat
      const hrs = Math.max(1, Math.min(12, boatHours));
      const start = new Date(`${boatDate}T12:00:00.000Z`);
      const end = new Date(start.getTime() + hrs * 60 * 60 * 1000);
      return {
        error: null,
        quantity: hrs,
        carUnitMode: undefined,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        durationLabel: `${hrs} hours on ${boatDate}`,
        quote: calculateCustomerQuote({
          category: "boat",
          quantity: hrs,
          unitRateKobo: listing.rateKobo,
          cautionFeeKobo: listing.cautionFeeKobo,
          config: pricingConfig,
        }),
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Invalid dates selected.",
        quantity: 1,
        carUnitMode: undefined,
        startIso: "",
        endIso: "",
        durationLabel: "",
        quote: null,
      };
    }
  }, [boatDate, boatHours, carMode, checkIn, checkOut, listing, pricingConfig]);

  const whatsappLink = useMemo(() => {
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "https://shortletconnect.ng";
    return buildWhatsAppDeepLink({
      officialNumber: systemConfig.officialWhatsAppNumber,
      baseUrl,
      listing,
      selectedFeatureIds,
      catalogue: featureCatalogue,
      checkIn: listing.category === "apartment" ? checkIn : undefined,
      checkOut: listing.category === "apartment" ? checkOut : undefined,
      durationLabel:
        listing.category !== "apartment" ? quoteResult.durationLabel : undefined,
    });
  }, [
    checkIn,
    checkOut,
    featureCatalogue,
    listing,
    quoteResult.durationLabel,
    selectedFeatureIds,
    systemConfig.officialWhatsAppNumber,
  ]);

  const approvedApartmentReviews = useMemo(() => {
    if (listing.category !== "apartment") return [];
    return reviews.filter(
      (r) => r.listingId === listing.listingId && r.moderationStatus === "approved"
    );
  }, [listing.category, listing.listingId, reviews]);

  const handleLogSimulatedWhatsAppEnquiry = () => {
    recordInboundEnquiry({
      customerName: customerName.trim() || "Guest Visitor",
      customerContact: customerContact.trim() || "+234 809 555 0101",
      text: whatsappLink.prefilledMessage,
      providerMessageId: `wamid.sim_${Date.now().toString(36)}`,
    });
  };

  const handleRequestInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerContact.trim()) {
      notify("Please enter your name and email or phone to schedule an inspection.");
      return;
    }
    requestLiveInspection({
      listing,
      customerName,
      customerContact,
      requestedSlotIso: new Date(inspectionSlot).toISOString(),
    });
    setShowInspectionForm(false);
  };

  const handleInitiatePaystackCheckout = async () => {
    setCheckoutError(null);
    if (!quoteResult.quote) {
      setCheckoutError(quoteResult.error ?? "Please choose valid dates.");
      return;
    }
    if (!customerName.trim() || !customerContact.includes("@")) {
      setCheckoutError("Please enter your full name and a valid email address for Paystack checkout and receipt delivery.");
      return;
    }

    setCheckoutBusy(true);
    try {
      const bookingRef = `SC-BK-${Date.now().toString(36).toUpperCase()}`;

      // Step 1: Acquire database/server atomic hold preventing double bookings (Invariant 4)
      const holdRes = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.listingId,
          category: listing.category,
          startIso: quoteResult.startIso,
          endIso: quoteResult.endIso,
          quantity: quoteResult.quantity,
          carUnitMode: quoteResult.carUnitMode,
          unitRateKobo:
            listing.category === "car" && carMode === "12h"
              ? (listing.specs as CarSpecs | undefined)?.twelveHourRateKobo ?? listing.rateKobo
              : listing.category === "car"
              ? (listing.specs as CarSpecs | undefined)?.twentyFourHourRateKobo ?? listing.rateKobo
              : listing.rateKobo,
          cautionFeeKobo: listing.cautionFeeKobo,
          extrasKobo: 0,
          bookingRef,
          holdType: "hold",
        }),
      });
      const holdData = await holdRes.json();
      if (!holdRes.ok) {
        throw new Error(holdData.error || "Could not lock availability slot.");
      }

      // Step 2: Initialize Paystack transaction (Sandbox)
      const initRes = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRef,
          customerEmail: customerContact.trim(),
          amountKobo: quoteResult.quote.customerTotalKobo,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        throw new Error(initData.error || "Paystack initialization failed.");
      }

      setPendingBookingRef(bookingRef);
      setPendingPaystackRef(initData.reference);
      setCheckoutStep("awaiting_paystack");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleVerifyPaystackServerSide = async (simulateGatewaySuccess: boolean) => {
    if (!quoteResult.quote || !pendingPaystackRef || !pendingBookingRef) return;
    setCheckoutError(null);
    setCheckoutBusy(true);

    try {
      const verifyRes = await fetch("/api/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: pendingPaystackRef,
          expectedAmountKobo: quoteResult.quote.customerTotalKobo,
          simulateGatewaySuccess,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(
          verifyData.error ||
            "Payment not confirmed by Paystack server-side verification."
        );
      }

      // Confirm slot lock & record booking + separated staff ledger
      createVerifiedBooking({
        bookingRef: pendingBookingRef,
        listing,
        customerName,
        customerContact,
        startIso: quoteResult.startIso,
        endIso: quoteResult.endIso,
        quantity: quoteResult.quantity,
        carUnitMode: quoteResult.carUnitMode,
        paymentReference: pendingPaystackRef,
        paymentVerifiedServerSide: true,
      });

      setCheckoutStep("confirmed");
      notify(`Booking ${pendingBookingRef} confirmed via verified Paystack payment.`);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={listing.title}
      className="fixed inset-0 z-50 bg-[#111318]/70 backdrop-blur-sm overflow-y-auto p-0 sm:p-6"
    >
      <div className="max-w-6xl mx-auto bg-[#F8F7F4] rounded-none sm:rounded-2xl border-0 sm:border border-stone-200 overflow-hidden shadow-2xl min-h-dvh sm:min-h-0 my-0 sm:my-6">
        {/* Top Modal Header */}
        <div className="bg-white border-b border-stone-200 px-4 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs text-stone-500 font-mono truncate">
              {listing.listingId} · {listing.area}, {listing.city}
              {listing.safeStreetLabel ? ` · ${listing.safeStreetLabel}` : ""}
            </p>
            <h2 className="font-display text-base sm:text-xl font-semibold text-[#111318] truncate">
              {listing.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleGuestSave(listing.listingId)}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] sm:min-h-[40px] text-xs font-medium rounded-lg border border-stone-300 bg-white text-[#111318] hover:bg-stone-50 whitespace-nowrap"
            >
              <Heart
                className={`w-4 h-4 ${
                  isSaved ? "fill-red-600 text-red-600" : "text-stone-600"
                }`}
              />
              <span className="hidden xs:inline sm:inline">{isSaved ? "Saved" : "Save"}</span>
            </button>
            <button
              type="button"
              aria-label="Close listing details"
              onClick={onClose}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 p-4 sm:p-8 pb-12">
          {/* Left Column: Watermarked Media, Structured Amenities, Rules & Reviews */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            {/* Gallery */}
            <div className="space-y-3">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-stone-200 border border-stone-200">
                <img
                  src={listing.watermarkedPhotos[activePhotoIdx] ?? listing.watermarkedPhotos[0]}
                  alt={`${listing.title} photo ${activePhotoIdx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-600">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                  {listing.watermarkedPhotos.map((src, idx) => (
                    <button
                      key={src + idx}
                      type="button"
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`w-16 h-12 rounded-md overflow-hidden border-2 shrink-0 transition-colors ${
                        activePhotoIdx === idx
                          ? "border-[#111318]"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={src}
                        alt={`Thumbnail ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>

                <a
                  href={listing.watermarkedPhotos[activePhotoIdx] ?? listing.watermarkedPhotos[0]}
                  download={`${listing.listingId}-watermarked.jpg`}
                  className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 text-xs font-medium text-[#9A6B32] hover:underline shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download watermarked photo
                </a>
              </div>
              <p className="text-[11px] text-stone-500">
                Watermarks are permanently burned into published photos server-side ({`SHORTLET CONNECT · Listed by: ${listing.originatorDisplayName}`}). Source originals remain private. Embedded watermarks discourage uncredited reuse but cannot prevent cropping.
              </p>
            </div>

            {/* Summary & Privacy Notice */}
            <div className="space-y-3">
              <h3 className="font-display text-lg font-semibold text-[#111318]">
                Overview
              </h3>
              <p className="text-sm text-stone-700 leading-relaxed">{listing.summary}</p>
              <p className="text-xs text-stone-500 bg-white border border-stone-200 rounded-lg p-3">
                <strong className="text-[#111318]">Location Privacy:</strong> Broad area ({listing.area}, {listing.city}) is shown publicly. Exact building number and check-in access instructions are released only after authorised booking confirmation.
              </p>
            </div>

            {/* Category-Specific Details (WEB-02) */}
            {listing.category === "apartment" && (
              <div className="space-y-5 pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-[#111318]">
                    Approved Features & House Rules
                  </h3>
                  <span className="text-xs text-stone-500">
                    Partner claims verified at approval
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {listing.featureIds.map((fid) => {
                    const label =
                      featureCatalogue.find((c) => c.featureId === fid)?.label ??
                      fid.replace(/_/g, " ");
                    return (
                      <div
                        key={fid}
                        className="flex items-center gap-2 text-sm text-stone-800 bg-white border border-stone-200 rounded-lg px-3 py-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>

                {listing.rules && (
                  <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2.5 text-sm">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-stone-500">Smoking</p>
                        <p className="font-semibold text-[#111318]">
                          {listing.rules.smokingAllowed ? "Allowed" : "Not allowed"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500">Parties</p>
                        <p className="font-semibold text-[#111318]">
                          {listing.rules.partyAllowed ? "Allowed" : "Not allowed"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500">DJ Equipment</p>
                        <p className="font-semibold text-[#111318]">
                          {listing.rules.djAllowed ? "Allowed" : "Not allowed"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500">Max Gathering</p>
                        <p className="font-mono tabular-nums font-semibold text-[#111318]">
                          {listing.rules.maxGatheringGuests} guests
                        </p>
                      </div>
                    </div>
                    {listing.rules.houseNotes && (
                      <p className="text-xs text-stone-600 pt-2 border-t border-stone-100">
                        {listing.rules.houseNotes}
                      </p>
                    )}
                    {listing.specs && (
                      <p className="text-xs text-stone-500">
                        {(listing.specs as ApartmentSpecs).bedrooms} Bedrooms ·{" "}
                        {(listing.specs as ApartmentSpecs).bathrooms} Bathrooms ·{" "}
                        {(listing.specs as ApartmentSpecs).serviceType === "full_service"
                          ? "Full-service"
                          : "Self-service"}{" "}
                        · Check-in {listing.rules.checkInTime} / Check-out {listing.rules.checkOutTime}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {listing.category === "car" && listing.specs && (
              <div className="space-y-3 pt-4 border-t border-stone-200">
                <h3 className="font-display text-lg font-semibold text-[#111318]">
                  Vehicle & Rental Terms
                </h3>
                <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2 text-sm text-stone-700">
                  <p>
                    <strong className="text-[#111318]">Model:</strong>{" "}
                    {(listing.specs as CarSpecs).makeModel} ({(listing.specs as CarSpecs).year})
                  </p>
                  <p>
                    <strong className="text-[#111318]">12-Hour Rate:</strong>{" "}
                    <span className="font-mono tabular-nums">
                      {formatNairaFromKobo((listing.specs as CarSpecs).twelveHourRateKobo)}
                    </span>{" "}
                    · <strong className="text-[#111318]">24-Hour Rate:</strong>{" "}
                    <span className="font-mono tabular-nums">
                      {formatNairaFromKobo((listing.specs as CarSpecs).twentyFourHourRateKobo)}
                    </span>
                  </p>
                  <p>
                    <strong className="text-[#111318]">Fuel Policy:</strong>{" "}
                    {(listing.specs as CarSpecs).fuelPolicy}
                  </p>
                  <p className="text-xs text-stone-600 pt-2 border-t border-stone-100">
                    {(listing.specs as CarSpecs).rentalTerms}
                  </p>
                </div>
              </div>
            )}

            {listing.category === "boat" && listing.specs && (
              <div className="space-y-3 pt-4 border-t border-stone-200">
                <h3 className="font-display text-lg font-semibold text-[#111318]">
                  Vessel & Safety Terms
                </h3>
                <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2 text-sm text-stone-700">
                  <p>
                    <strong className="text-[#111318]">Vessel:</strong>{" "}
                    {(listing.specs as BoatSpecs).vesselType} · Max Capacity:{" "}
                    <span className="font-mono tabular-nums">
                      {(listing.specs as BoatSpecs).passengerCapacity} passengers
                    </span>
                  </p>
                  <p>
                    <strong className="text-[#111318]">Boarding Area:</strong>{" "}
                    {(listing.specs as BoatSpecs).boardingJettyArea}
                  </p>
                  <p className="text-xs text-stone-600 pt-2 border-t border-stone-100">
                    {(listing.specs as BoatSpecs).safetyAndUsageTerms}
                  </p>
                </div>
              </div>
            )}

            {/* Verified Apartment Reviews ONLY (REV-01: Cars & Boats have no reviews in V1) */}
            {listing.category === "apartment" && (
              <div className="space-y-4 pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-[#111318]">
                    Verified Guest Reviews
                  </h3>
                  {typeof listing.averageRating === "number" && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-mono tabular-nums font-semibold text-[#111318]">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      {listing.averageRating.toFixed(1)} ({approvedApartmentReviews.length})
                    </span>
                  )}
                </div>

                {approvedApartmentReviews.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    No approved reviews yet. Only customers with a completed apartment stay may leave a review.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {approvedApartmentReviews.map((rev) => (
                      <div
                        key={rev.reviewId}
                        className="bg-white border border-stone-200 rounded-xl p-4 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#111318]">
                            {rev.authorDisplayName} · Verified Stay
                          </span>
                          <span className="font-mono tabular-nums text-amber-600">
                            {"★".repeat(rev.rating)}
                            {"☆".repeat(5 - rev.rating)}
                          </span>
                        </div>
                        <p className="text-sm text-stone-700 leading-relaxed">
                          {rev.comment}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Contiguous Quote, WhatsApp Context Link, Inspection & Paystack Checkout */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-5 sticky top-24">
              <div className="flex items-baseline justify-between border-b border-stone-100 pb-4">
                <div>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-[#111318]">
                    {formatNairaFromKobo(listing.rateKobo)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {listing.category === "apartment"
                      ? "per night · half-open [check-in, check-out)"
                      : listing.category === "car"
                      ? "12h or 24h rental day"
                      : "per hour · service fee per 2-hr block"}
                  </p>
                </div>
                {listing.verifiedPropertyBadge && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="w-4 h-4" />
                    Verified
                  </span>
                )}
              </div>

              {/* Date / Duration Controls */}
              {listing.category === "apartment" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="sc-checkin"
                      className="block text-xs font-medium text-stone-600 mb-1"
                    >
                      Check-in
                    </label>
                    <input
                      id="sc-checkin"
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono rounded-lg border border-stone-200 bg-stone-50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sc-checkout"
                      className="block text-xs font-medium text-stone-600 mb-1"
                    >
                      Check-out
                    </label>
                    <input
                      id="sc-checkout"
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono rounded-lg border border-stone-200 bg-stone-50"
                    />
                  </div>
                </div>
              )}

              {listing.category === "car" && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="sc-car-date"
                      className="block text-xs font-medium text-stone-600 mb-1"
                    >
                      Pickup date
                    </label>
                    <input
                      id="sc-car-date"
                      type="date"
                      value={boatDate}
                      onChange={(e) => setBoatDate(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono rounded-lg border border-stone-200 bg-stone-50"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "12h", label: "12 Hours (1 unit)" },
                        { id: "24h", label: "24 Hours (1 unit)" },
                        { id: "3d", label: "3 Days (3 units)" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCarMode(opt.id)}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                          carMode === opt.id
                            ? "bg-[#111318] text-white border-[#111318]"
                            : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {listing.category === "boat" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="sc-boat-date"
                      className="block text-xs font-medium text-stone-600 mb-1"
                    >
                      Charter date
                    </label>
                    <input
                      id="sc-boat-date"
                      type="date"
                      value={boatDate}
                      onChange={(e) => setBoatDate(e.target.value)}
                      className="w-full h-10 px-3 text-sm font-mono rounded-lg border border-stone-200 bg-stone-50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sc-boat-hours"
                      className="block text-xs font-medium text-stone-600 mb-1"
                    >
                      Duration (hours)
                    </label>
                    <select
                      id="sc-boat-hours"
                      value={boatHours}
                      onChange={(e) => setBoatHours(Number(e.target.value))}
                      className="w-full h-10 px-3 text-sm font-mono rounded-lg border border-stone-200 bg-stone-50"
                    >
                      {[2, 3, 4, 5, 6, 8].map((h) => (
                        <option key={h} value={h}>
                          {h} hours ({Math.ceil(h / 2)} × 2-hr blocks)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Itemised Customer Quote (NEVER exposes internal ₦10k allocations) */}
              {quoteResult.error ? (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {quoteResult.error}
                </div>
              ) : (
                quoteResult.quote && (
                  <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-stone-700">
                      <span>Rental principal ({quoteResult.quote.unitLabel})</span>
                      <span className="font-mono tabular-nums">
                        {formatNairaFromKobo(quoteResult.quote.rentalPrincipalKobo)}
                      </span>
                    </div>
                    <div className="flex justify-between text-stone-700">
                      <span>
                        Service charge ({quoteResult.quote.chargeableUnits} × ₦30,000)
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatNairaFromKobo(quoteResult.quote.serviceChargeKobo)}
                      </span>
                    </div>
                    {quoteResult.quote.cautionFeeKobo > 0 && (
                      <div className="flex justify-between text-stone-700">
                        <span>Refundable caution fee (liability)</span>
                        <span className="font-mono tabular-nums">
                          {formatNairaFromKobo(quoteResult.quote.cautionFeeKobo)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-[#111318] pt-2.5 border-t border-stone-200 text-base">
                      <span>Total Payable (NGN)</span>
                      <span className="font-mono tabular-nums">
                        {formatNairaFromKobo(quoteResult.quote.customerTotalKobo)}
                      </span>
                    </div>
                  </div>
                )
              )}

              {/* Passwordless Guest Contact Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="sc-guest-name"
                    className="block text-xs font-medium text-stone-600 mb-1"
                  >
                    Guest full name
                  </label>
                  <input
                    id="sc-guest-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-stone-200 bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sc-guest-contact"
                    className="block text-xs font-medium text-stone-600 mb-1"
                  >
                    Email (for receipt & OTP)
                  </label>
                  <input
                    id="sc-guest-contact"
                    type="email"
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-stone-200 bg-white"
                  />
                </div>
              </div>

              {checkoutError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Paystack Checkout Flow (FIN-01 & Invariant 3) */}
              {checkoutStep === "quote" && (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={checkoutBusy || !quoteResult.quote}
                    onClick={() => void handleInitiatePaystackCheckout()}
                    className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-[#111318] text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-50 transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    {checkoutBusy ? "Locking slot..." : "Lock Availability & Pay via Paystack"}
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <a
                      href={whatsappLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleLogSimulatedWhatsAppEnquiry}
                      className="h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F5132] text-white text-xs sm:text-sm font-semibold hover:bg-emerald-900 transition-colors whitespace-nowrap"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      Chat With Us
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowInspectionForm((v) => !v)}
                      className="h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white text-[#111318] text-xs sm:text-sm font-semibold hover:bg-stone-50 transition-colors whitespace-nowrap"
                    >
                      <Video className="w-4 h-4 shrink-0" />
                      Live Inspection
                    </button>
                  </div>
                </div>
              )}

              {checkoutStep === "awaiting_paystack" && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold">
                    <Clock className="w-4 h-4" />
                    Availability Locked ({pendingBookingRef}) — Awaiting Server Verification
                  </div>
                  <p className="text-xs text-stone-700 leading-relaxed">
                    Paystack Sandbox Reference:{" "}
                    <span className="font-mono font-semibold">{pendingPaystackRef}</span>.
                    Per Shortlet Connect security rules, a browser redirect alone never confirms a booking.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={checkoutBusy}
                      onClick={() => void handleVerifyPaystackServerSide(false)}
                      className="w-full py-2 px-3 text-xs font-medium rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                    >
                      Test Unpaid Browser Redirect (Must Reject)
                    </button>
                    <button
                      type="button"
                      disabled={checkoutBusy}
                      onClick={() => void handleVerifyPaystackServerSide(true)}
                      className="w-full py-2.5 px-3 text-xs font-semibold rounded-lg bg-[#0F5132] text-white hover:bg-emerald-900"
                    >
                      {checkoutBusy
                        ? "Verifying HMAC webhook..."
                        : "Complete Paystack Payment & Verify Server-Side"}
                    </button>
                  </div>
                </div>
              )}

              {checkoutStep === "confirmed" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-900 text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    Booking Confirmed ({pendingBookingRef})
                  </div>
                  <p className="text-xs text-emerald-900/90 leading-relaxed">
                    Paystack HMAC-SHA512 webhook and server reference{" "}
                    <span className="font-mono">{pendingPaystackRef}</span> verified. Access your receipt and status anytime via OTP in My Bookings.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToBookings();
                    }}
                    className="w-full py-2.5 px-3 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
                  >
                    Open My Bookings (OTP Access)
                  </button>
                </div>
              )}

              {/* Live Inspection Request Drawer (INS-01) */}
              {showInspectionForm && (
                <form
                  onSubmit={handleRequestInspection}
                  className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3"
                >
                  <h4 className="text-xs font-semibold text-[#111318]">
                    Request Admin-Coordinated Live Video Inspection
                  </h4>
                  <p className="text-xs text-stone-600">
                    An assigned operational admin will schedule an external video meeting link with you, the authorized listing agent, and the on-site representative.
                  </p>
                  <div>
                    <label
                      htmlFor="sc-insp-time"
                      className="block text-xs font-medium text-stone-600 mb-1"
                    >
                      Preferred date & time (WAT / Africa/Lagos)
                    </label>
                    <input
                      id="sc-insp-time"
                      type="datetime-local"
                      value={inspectionSlot}
                      onChange={(e) => setInspectionSlot(e.target.value)}
                      required
                      className="w-full h-10 px-3 text-sm font-mono rounded-lg border border-stone-200 bg-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
                  >
                    Submit Inspection Request
                  </button>
                </form>
              )}

              {/* Context-Aware WhatsApp Deep Link Preview (MSG-03) */}
              <details className="text-xs text-stone-600 border-t border-stone-100 pt-3">
                <summary className="cursor-pointer font-medium text-[#111318]">
                  Preview official WhatsApp prefilled enquiry
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-stone-50 border border-stone-200 whitespace-pre-wrap font-mono text-[11px] text-stone-700">
                  {whatsappLink.prefilledMessage}
                </pre>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  Customer must press Send in WhatsApp. Private owner contacts, restricted addresses, and internal splits are never included.
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
