"use client";

import React, { useMemo, useState } from "react";
import {
  Heart,
  KeyRound,
  Receipt,
  Video,
  Star,
  CheckCircle2,
  Shield,
  LogOut,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { formatAfricaLagos, formatNairaFromKobo } from "@/lib/domain/pricing";
import { toCustomerBookingView } from "@/lib/domain/privacy";
import type { PublicListing } from "@/lib/types";

interface CustomerBookingsViewProps {
  mode: "saved" | "bookings";
  onOpenListing: (listing: PublicListing) => void;
}

export function CustomerBookingsView({
  mode,
  onOpenListing,
}: CustomerBookingsViewProps) {
  const {
    publicListings,
    guestSavedIds,
    verifiedSavedIds,
    toggleGuestSave,
    mergeGuestSavesIntoVerifiedProfile,
    customerSession,
    setCustomerSession,
    bookings,
    inspections,
    reviews,
    submitApartmentReview,
    notify,
  } = useMarketplace();

  // OTP flow state (CUST-02)
  const [contactInput, setContactInput] = useState("adaeze.guest@example.com");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sandboxPreviewCode, setSandboxPreviewCode] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);

  // Apartment review form state (REV-01)
  const [reviewingBookingRef, setReviewingBookingRef] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState("");

  const savedListingObjects = useMemo(() => {
    const activeIds = customerSession
      ? Array.from(new Set([...verifiedSavedIds, ...guestSavedIds]))
      : guestSavedIds;
    return publicListings.filter((l) => activeIds.includes(l.listingId));
  }, [customerSession, guestSavedIds, publicListings, verifiedSavedIds]);

  // Strict customer isolation: ONLY show bookings matching verified OTP contact, serialized via explicit allow-list
  const myVerifiedBookings = useMemo(() => {
    if (!customerSession) return [];
    const normalized = customerSession.contact.trim().toLowerCase();
    return bookings
      .filter((b) => b.customerContact.trim().toLowerCase() === normalized)
      .map((b) => toCustomerBookingView(b));
  }, [bookings, customerSession]);

  const myInspections = useMemo(() => {
    if (!customerSession) return [];
    const normalized = customerSession.contact.trim().toLowerCase();
    return inspections.filter(
      (i) => i.customerContact.trim().toLowerCase() === normalized
    );
  }, [customerSession, inspections]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    setOtpBusy(true);
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: contactInput.trim(),
          channel,
          purpose: "customer_bookings",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send code.");
      setChallengeId(data.challengeId);
      setSandboxPreviewCode(data.sandboxPreviewCode);
      setOtpCode("");
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setOtpError(null);
    setOtpBusy(true);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          code: otpCode.trim(),
          contact: contactInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      setCustomerSession(data.session);
      setChallengeId(null);
      setSandboxPreviewCode(null);
      notify(`Verified passwordless access for ${data.session.contact}.`);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setOtpBusy(false);
    }
  };

  const handleSubmitReview = (e: React.FormEvent, bookingRef: string, listingId: string) => {
    e.preventDefault();
    const res = submitApartmentReview({
      bookingRef,
      listingId,
      authorDisplayName: customerSession?.contact.split("@")[0] ?? "Verified Guest",
      rating: reviewRating,
      comment: reviewComment,
    });
    if (!res.ok) {
      notify(res.error ?? "Unable to submit review.");
      return;
    }
    setReviewingBookingRef(null);
    setReviewComment("");
    setReviewRating(5);
  };

  if (mode === "saved") {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#111318]">
              Saved Listings
            </h1>
            <p className="text-sm text-stone-600 mt-1">
              {customerSession
                ? `Showing listings saved to your verified profile (${customerSession.contact}) and this device.`
                : "Guest favourites are stored locally on this browser without login. Clearing browser storage clears local saves; no cross-device sync is promised for guests."}
            </p>
          </div>
          {customerSession && guestSavedIds.length > 0 && (
            <button
              type="button"
              onClick={mergeGuestSavesIntoVerifiedProfile}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
            >
              Merge {guestSavedIds.length} Device Save(s) to Profile
            </button>
          )}
        </div>

        {savedListingObjects.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-12 text-center space-y-3">
            <Heart className="w-7 h-7 text-stone-400 mx-auto" />
            <h2 className="font-display text-lg font-semibold text-[#111318]">
              No saved listings yet
            </h2>
            <p className="text-sm text-stone-600 max-w-md mx-auto">
              Tap the heart icon on any approved apartment, car, or boat to keep it here for quick comparison.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedListingObjects.map((listing) => (
              <div
                key={listing.listingId}
                className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col"
              >
                <div className="relative aspect-[4/3] bg-stone-200">
                  <img
                    src={listing.watermarkedPhotos[0]}
                    alt={listing.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove saved listing"
                    onClick={() => toggleGuestSave(listing.listingId)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow"
                  >
                    <Heart className="w-4 h-4 fill-red-600 text-red-600" />
                  </button>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <p className="text-xs text-stone-500">
                      {listing.category} · {listing.area}
                    </p>
                    <h3 className="font-display text-base font-semibold text-[#111318] mt-1">
                      {listing.title}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                    <span className="font-mono tabular-nums text-sm font-semibold text-[#111318]">
                      {formatNairaFromKobo(listing.rateKobo)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenListing(listing)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#9A6B32] hover:underline"
                    >
                      Open Listing <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // My Bookings Passwordless OTP Dashboard (CUST-02, CUST-03)
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#111318]">
            My Bookings & Receipts
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Passwordless OTP verification protects your personal booking history, live inspection links, payment receipts, and caution refund status.
          </p>
        </div>
        {customerSession && (
          <button
            type="button"
            onClick={() => setCustomerSession(null)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-300 bg-white text-[#111318] hover:bg-stone-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            End Verified Session ({customerSession.contact})
          </button>
        )}
      </div>

      {!customerSession ? (
        <div className="max-w-lg mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#9A6B32]">
              <KeyRound className="w-4 h-4" />
              Passwordless Verification Required
            </div>
            <h2 className="font-display text-xl font-semibold text-[#111318]">
              Verify your email or phone to view bookings
            </h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              Bookings are never exposed from a phone number or reference alone. Complete a time-limited, single-use OTP to access your own records.
            </p>
          </div>

          {!challengeId ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setChannel("email")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border ${
                    channel === "email"
                      ? "bg-[#111318] text-white border-[#111318]"
                      : "bg-stone-50 text-stone-700 border-stone-200"
                  }`}
                >
                  Email OTP
                </button>
                <button
                  type="button"
                  onClick={() => setChannel("sms")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border ${
                    channel === "sms"
                      ? "bg-[#111318] text-white border-[#111318]"
                      : "bg-stone-50 text-stone-700 border-stone-200"
                  }`}
                >
                  SMS OTP
                </button>
              </div>

              <div>
                <label
                  htmlFor="sc-otp-contact"
                  className="block text-xs font-medium text-stone-600 mb-1"
                >
                  {channel === "email" ? "Booking email address" : "Booking phone number"}
                </label>
                <input
                  id="sc-otp-contact"
                  type={channel === "email" ? "email" : "tel"}
                  required
                  value={contactInput}
                  onChange={(e) => setContactInput(e.target.value)}
                  placeholder={
                    channel === "email" ? "adaeze.guest@example.com" : "+234 803 000 0000"
                  }
                  className="w-full h-11 px-3.5 text-sm rounded-lg border border-stone-300 bg-white focus:ring-2 focus:ring-[#9A6B32] focus:outline-none"
                />
                {process.env.NODE_ENV !== "production" && (
                  <p className="text-[11px] text-stone-500 mt-1">
                    Demo guest record available for{" "}
                    <span className="font-mono text-[#111318]">adaeze.guest@example.com</span>.
                  </p>
                )}
              </div>

              {otpError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  {otpError}
                </p>
              )}

              <button
                type="submit"
                disabled={otpBusy}
                className="w-full h-11 rounded-lg bg-[#111318] text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-50"
              >
                {otpBusy ? "Sending single-use code..." : "Send Verification Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {sandboxPreviewCode && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-950">
                  Sandbox OTP Preview for{" "}
                  <span className="font-mono">{contactInput}</span>:{" "}
                  <strong className="font-mono text-sm tracking-widest">
                    {sandboxPreviewCode}
                  </strong>{" "}
                  (expires in 5 minutes, single-use, max 3 attempts).
                </div>
              )}

              <div>
                <label
                  htmlFor="sc-otp-code"
                  className="block text-xs font-medium text-stone-600 mb-1"
                >
                  Enter 6-digit verification code
                </label>
                <input
                  id="sc-otp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full h-11 px-3.5 text-base font-mono tracking-[0.25em] rounded-lg border border-stone-300 bg-white"
                />
              </div>

              {otpError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  {otpError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChallengeId(null);
                    setOtpError(null);
                  }}
                  className="px-4 h-11 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={otpBusy}
                  className="flex-1 h-11 rounded-lg bg-[#111318] text-white text-sm font-semibold hover:bg-stone-800"
                >
                  {otpBusy ? "Verifying..." : "Verify & Open My Bookings"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Consent Merge Banner for Device Guest Saves (CUST-03) */}
          {guestSavedIds.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-[#9A6B32] shrink-0" />
                <p className="text-sm text-stone-700">
                  You have <strong>{guestSavedIds.length}</strong> listing(s) saved locally on this device. Merge them into your verified profile?
                </p>
              </div>
              <button
                type="button"
                onClick={mergeGuestSavesIntoVerifiedProfile}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
              >
                Consent & Merge Saved Listings
              </button>
            </div>
          )}

          {/* Bookings & Receipts List */}
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#111318]">
              Your Bookings ({myVerifiedBookings.length})
            </h2>

            {myVerifiedBookings.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-sm text-stone-600">
                No bookings are linked to <span className="font-mono">{customerSession.contact}</span> yet.
              </div>
            ) : (
              <div className="space-y-4">
                {myVerifiedBookings.map((bk) => {
                  const alreadyReviewed = reviews.some((r) => r.bookingRef === bk.bookingRef);
                  const eligibleForReview =
                    bk.category === "apartment" && bk.status === "completed" && !alreadyReviewed;

                  return (
                    <div
                      key={bk.bookingRef}
                      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-4">
                        <div>
                          <p className="text-xs font-mono text-stone-500">
                            {bk.bookingRef} · {bk.category.toUpperCase()} · Status:{" "}
                            <span className="text-[#111318] font-semibold">
                              {bk.status.replace(/_/g, " ")}
                            </span>
                          </p>
                          <h3 className="font-display text-lg font-semibold text-[#111318] mt-1">
                            {bk.listingTitle}
                          </h3>
                          <p className="text-xs text-stone-600 mt-1">
                            {formatAfricaLagos(bk.startIso)} → {formatAfricaLagos(bk.endIso)} (WAT)
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-mono tabular-nums text-lg font-semibold text-[#111318]">
                            {formatNairaFromKobo(bk.customerTotalKobo)}
                          </p>
                          <p className="text-xs text-emerald-800 inline-flex items-center gap-1">
                            <Receipt className="w-3.5 h-3.5" />
                            {bk.paymentVerified
                              ? `Receipt ${bk.paymentReference}`
                              : "Awaiting verified payment"}
                          </p>
                        </div>
                      </div>

                      {/* Transparent Customer Receipt (NEVER exposes internal ₦10k allocations) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <p className="text-stone-500">Rental Principal</p>
                          <p className="font-mono tabular-nums font-semibold text-[#111318] mt-0.5">
                            {formatNairaFromKobo(bk.rentalPrincipalKobo)}
                          </p>
                        </div>
                        <div>
                          <p className="text-stone-500">Service Charge</p>
                          <p className="font-mono tabular-nums font-semibold text-[#111318] mt-0.5">
                            {formatNairaFromKobo(bk.serviceChargeKobo)}
                          </p>
                        </div>
                        <div>
                          <p className="text-stone-500">Caution Deposit</p>
                          <p className="font-mono tabular-nums font-semibold text-[#111318] mt-0.5">
                            {formatNairaFromKobo(bk.cautionFeeKobo)}
                          </p>
                        </div>
                        <div>
                          <p className="text-stone-500">Caution Refund Status</p>
                          <p className="font-semibold text-[#111318] mt-0.5 capitalize">
                            {bk.cautionDepositStatus.replace(/_/g, " ")}
                            {bk.cautionRefundRef ? ` (${bk.cautionRefundRef})` : ""}
                          </p>
                        </div>
                      </div>

                      {/* Verified Apartment Review Form (REV-01) */}
                      {eligibleForReview && (
                        <div className="pt-3 border-t border-stone-100">
                          {reviewingBookingRef === bk.bookingRef ? (
                            <form
                              onSubmit={(e) =>
                                handleSubmitReview(e, bk.bookingRef, bk.listingId)
                              }
                              className="space-y-3 bg-stone-50 p-4 rounded-xl border border-stone-200"
                            >
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-[#111318]">
                                  Rate your completed apartment stay (1–5 stars)
                                </label>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => setReviewRating(star)}
                                      className="p-1"
                                    >
                                      <Star
                                        className={`w-5 h-5 ${
                                          star <= reviewRating
                                            ? "fill-amber-500 text-amber-500"
                                            : "text-stone-300"
                                        }`}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <textarea
                                required
                                minLength={8}
                                rows={3}
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder="Share an honest review of the apartment, accuracy of inspection, and check-in..."
                                className="w-full p-3 text-sm rounded-lg border border-stone-300 bg-white"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setReviewingBookingRef(null)}
                                  className="px-3 py-1.5 text-xs font-medium text-stone-600"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                                >
                                  Submit Verified Review
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReviewingBookingRef(bk.bookingRef)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A6B32] hover:underline"
                            >
                              <Star className="w-4 h-4" />
                              Leave a Verified Apartment Review
                            </button>
                          )}
                        </div>
                      )}

                      {alreadyReviewed && bk.category === "apartment" && (
                        <p className="text-xs text-emerald-800 inline-flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified review submitted for this booking.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live Inspection Requests & Meeting Links (CUST-03) */}
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#111318]">
              Live Video Inspections ({myInspections.length})
            </h2>
            {myInspections.length === 0 ? (
              <p className="text-sm text-stone-600">
                No scheduled inspections linked to {customerSession.contact}.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myInspections.map((insp) => (
                  <div
                    key={insp.inspectionRef}
                    className="bg-white border border-stone-200 rounded-xl p-5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span className="font-mono">{insp.inspectionRef}</span>
                      <span className="font-semibold text-[#111318] capitalize">
                        {insp.status}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#111318]">
                      {insp.listingTitle}
                    </h3>
                    <p className="text-xs text-stone-600">
                      Scheduled:{" "}
                      {formatAfricaLagos(insp.scheduledAtIso ?? insp.requestedSlotIso)} (WAT)
                    </p>
                    {insp.meetingUrl ? (
                      <a
                        href={insp.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A6B32] hover:underline"
                      >
                        <Video className="w-4 h-4" />
                        Join External Video Inspection
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <p className="text-xs text-stone-500">
                        Admin is coordinating your external video meeting link.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
