"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Film,
  ImagePlus,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { formatAfricaLagos, formatNairaFromKobo } from "@/lib/domain/pricing";
import type {
  AcceptedIdType,
  ListingCategory,
  PartnerType,
  PrivateListingRecord,
  RentalBasis,
} from "@/lib/types";

type PartnerTab = "listings" | "submit" | "studio" | "register";

export function PartnerPortal() {
  const {
    partnerProfiles,
    activePartnerUid,
    setActivePartnerUid,
    privateListings,
    bookings,
    featureCatalogue,
    systemConfig,
    registerPartnerProfile,
    submitPartnerListing,
    notify,
  } = useMarketplace();

  const [tab, setTab] = useState<PartnerTab>("listings");

  // Strict Partner Isolation (Invariant 2): Active partner only sees their own profile, listings & bookings
  const activePartner = useMemo(
    () => partnerProfiles.find((p) => p.ownerUid === activePartnerUid) ?? partnerProfiles[0],
    [partnerProfiles, activePartnerUid]
  );

  const myListings = useMemo(
    () => privateListings.filter((l) => l.originatorUid === activePartner?.ownerUid),
    [privateListings, activePartner?.ownerUid]
  );

  const myBookings = useMemo(
    () => bookings.filter((b) => b.partnerUid === activePartner?.ownerUid),
    [bookings, activePartner?.ownerUid]
  );

  const activeFeatures = useMemo(
    () => featureCatalogue.filter((f) => f.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [featureCatalogue]
  );

  // --- Listing Submission Form State (PART-01, PART-05, PART-06, MEDIA-01, MEDIA-02) ---
  const [category, setCategory] = useState<ListingCategory>("apartment");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [city, setCity] = useState("Lagos");
  const [area, setArea] = useState("Lekki Phase 1");
  const [safeStreetLabel, setSafeStreetLabel] = useState("");
  const [exactBuildingNumber, setExactBuildingNumber] = useState(""); // Optional per PART-06
  const [propertyManagerPhone, setPropertyManagerPhone] = useState(""); // Optional per PART-06
  const [vehicleOrVesselIdentifier, setVehicleOrVesselIdentifier] = useState("");
  const [authorityEvidenceNote, setAuthorityEvidenceNote] = useState("");
  const [rateNaira, setRateNaira] = useState("180000");
  const [cautionNaira, setCautionNaira] = useState("100000");
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([
    "private_pool",
    "ps5",
    "full_service",
  ]);
  const [bedrooms, setBedrooms] = useState("2");
  const [bathrooms, setBathrooms] = useState("2");
  const [maxOvernightGuests, setMaxOvernightGuests] = useState("4");
  const [smokingAllowed, setSmokingAllowed] = useState(false);
  const [partyAllowed, setPartyAllowed] = useState(false);
  const [djAllowed, setDjAllowed] = useState(false);
  const [maxGatheringGuests, setMaxGatheringGuests] = useState("6");
  const [carMakeModel, setCarMakeModel] = useState("Mercedes-Benz GLE 450");
  const [car12hNaira, setCar12hNaira] = useState("240000");
  const [car24hNaira, setCar24hNaira] = useState("380000");
  const [boatVesselType, setBoatVesselType] = useState("42ft Cruiser Yacht");
  const [boatCapacity, setBoatCapacity] = useState("12");
  const [boatJetty, setBoatJetty] = useState("Lekki Phase 1 Waterfront Jetty");

  // Media watermarking states
  const [watermarkedPhotos, setWatermarkedPhotos] = useState<string[]>([]);
  const [privateOriginalRefs, setPrivateOriginalRefs] = useState<string[]>([]);
  const [watermarkLoading, setWatermarkLoading] = useState(false);
  const [watermarkNotice, setWatermarkNotice] = useState<string | null>(null);
  const [videoJobStatus, setVideoJobStatus] = useState<{
    jobId: string;
    status: string;
    notice: string;
    previewUrl?: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- AI Listing Photo Studio State (gemini-nano-banana-2.1) ---
  const [studioPrompt, setStudioPrompt] = useState(
    "Architectural twilight photo of a modern 3-bedroom luxury shortlet living room in Lekki Phase 1 Lagos, warm walnut cabinetry, floor-to-ceiling glass, soft recessed lighting, editorial hospitality photography"
  );
  const [studioAspect, setStudioAspect] = useState<"4:3" | "16:9" | "1:1" | "3:4">("4:3");
  const [studioSourceBase64, setStudioSourceBase64] = useState<string | null>(null);
  const [studioSourceMime, setStudioSourceMime] = useState<"image/jpeg" | "image/png" | "image/webp" | undefined>(undefined);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioResultUrl, setStudioResultUrl] = useState<string | null>(null);

  // --- Partner Registration State (PART-07, PART-08, PART-09) ---
  const [regType, setRegType] = useState<PartnerType>("agent");
  const [regLegalName, setRegLegalName] = useState("");
  const [regAgencyName, setRegAgencyName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regIdType, setRegIdType] = useState<AcceptedIdType>("nin_slip");
  const [regIdFileName, setRegIdFileName] = useState<string>("");
  const [regOtpRequested, setRegOtpRequested] = useState(false);
  const [regChallengeId, setRegChallengeId] = useState<string | null>(null);
  const [regDemoOtp, setRegDemoOtp] = useState<string | null>(null);
  const [regOtpCode, setRegOtpCode] = useState("");
  const [regChannelVerified, setRegChannelVerified] = useState(false);
  const [regOtpLoading, setRegOtpLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const toggleFeature = (featureId: string) => {
    setSelectedFeatureIds((prev) =>
      prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePartner) return;
    setWatermarkLoading(true);
    setWatermarkNotice(null);
    setSubmitError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read selected file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/media/watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: "photo",
          base64DataUrl: dataUrl,
          agentDisplayName: activePartner.displayAttribution,
          submitterType: activePartner.partnerType,
        }),
      });
      const json = (await res.json()) as {
        watermarkedDataUrl?: string;
        privateOriginalRef?: string;
        notice?: string;
        error?: string;
      };
      if (!res.ok || !json.watermarkedDataUrl) {
        throw new Error(json.error ?? "Server-side watermarking failed.");
      }
      setWatermarkedPhotos((prev) => [...prev, json.watermarkedDataUrl!]);
      if (json.privateOriginalRef) {
        setPrivateOriginalRefs((prev) => [...prev, json.privateOriginalRef!]);
      }
      setWatermarkNotice(
        json.notice ??
          "Permanent Shortlet Connect watermark applied server-side. Original stored privately."
      );
      notify("Photo processed with permanent server-side watermark.");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to watermark photo.");
    } finally {
      setWatermarkLoading(false);
      e.target.value = "";
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePartner) return;
    const previewUrl = URL.createObjectURL(file);
    try {
      const res = await fetch("/api/media/watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: "video",
          listingId: "DRAFT",
          privateOriginalRef: `private_media/videos/${file.name}`,
          agentDisplayName: activePartner.displayAttribution,
          submitterType: activePartner.partnerType,
          videoWatermarkEnabled: systemConfig.videoWatermarkEnabled,
        }),
      });
      const json = (await res.json()) as {
        job?: { jobId: string; status: string; notice: string };
        error?: string;
      };
      if (!res.ok || !json.job) {
        throw new Error(json.error ?? "Video upload processing failed.");
      }
      setVideoJobStatus({ ...json.job, previewUrl });
      notify(`Video queued (${json.job.status.replace(/_/g, " ")}).`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Video upload failed.");
    } finally {
      e.target.value = "";
    }
  };

  const handleListingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!activePartner) return;

    if (activePartner.verificationStatus !== "approved") {
      setSubmitError(
        `Your account status is "${activePartner.verificationStatus.replace(/_/g, " ")}". Only approved, active partners may submit listings.`
      );
      return;
    }

    if (!title.trim() || !summary.trim() || !area.trim()) {
      setSubmitError("Please provide a title, area, and clear listing summary.");
      return;
    }

    const rateKobo = Math.max(10000, Math.round(Number(rateNaira || "0") * 100));
    const cautionFeeKobo = Math.max(0, Math.round(Number(cautionNaira || "0") * 100));
    const rentalBasis: RentalBasis =
      category === "apartment"
        ? "per_night"
        : category === "car"
        ? "per_12h_or_24h_day"
        : "per_hour";

    const fallbackPhoto =
      category === "apartment"
        ? `/api/media/public/apt_lekki_pool_villa.jpg?agent=${encodeURIComponent(activePartner.displayAttribution)}`
        : category === "car"
        ? `/api/media/public/car_lagos_suv_fleet.jpg?agent=${encodeURIComponent(activePartner.displayAttribution)}`
        : `/api/media/public/boat_lagos_yacht_cruise.jpg?agent=${encodeURIComponent(activePartner.displayAttribution)}`;

    const payload: Omit<
      PrivateListingRecord,
      "listingId" | "status" | "duplicateFlagIds" | "verifiedPropertyBadge" | "createdAt" | "updatedAt"
    > = {
      originatorUid: activePartner.ownerUid,
      originatorDisplayName: activePartner.displayAttribution,
      category,
      title: title.trim(),
      summary: summary.trim(),
      city: city.trim() || "Lagos",
      area: area.trim(),
      safeStreetLabel: safeStreetLabel.trim() || undefined,
      exactBuildingNumber: exactBuildingNumber.trim() || undefined,
      propertyManagerPhone: propertyManagerPhone.trim() || undefined,
      vehicleOrVesselIdentifier: vehicleOrVesselIdentifier.trim() || undefined,
      authorityEvidenceNote: authorityEvidenceNote.trim() || undefined,
      rateKobo,
      cautionFeeKobo,
      rentalBasis,
      featureIds: category === "apartment" ? selectedFeatureIds : [],
      rules:
        category === "apartment"
          ? {
              smokingAllowed,
              partyAllowed,
              djAllowed,
              maxGatheringGuests: Math.max(1, Number(maxGatheringGuests) || 4),
              checkInTime: "14:00 WAT",
              checkOutTime: "12:00 WAT",
            }
          : undefined,
      specs:
        category === "apartment"
          ? {
              bedrooms: Math.max(1, Number(bedrooms) || 1),
              bathrooms: Math.max(1, Number(bathrooms) || 1),
              maxOvernightGuests: Math.max(1, Number(maxOvernightGuests) || 2),
              serviceType: selectedFeatureIds.includes("full_service")
                ? "full_service"
                : "self_service",
              monthlyPaymentAvailable: selectedFeatureIds.includes("monthly_payment"),
            }
          : category === "car"
          ? {
              makeModel: carMakeModel.trim() || title.trim(),
              year: 2024,
              chauffeurIncluded: true,
              fuelPolicy: "Fuel included within Lagos Island / Lekki corridor",
              twelveHourRateKobo: Math.round(Number(car12hNaira || rateNaira) * 100),
              twentyFourHourRateKobo: Math.round(Number(car24hNaira || rateNaira) * 100),
              rentalTerms: "Chauffeur-driven only; valid ID required before dispatch.",
            }
          : {
              vesselType: boatVesselType.trim() || title.trim(),
              passengerCapacity: Math.max(2, Number(boatCapacity) || 10),
              minimumHours: 2,
              boardingJettyArea: boatJetty.trim() || area.trim(),
              safetyAndUsageTerms: "Life jackets mandatory; captain & crew included.",
            },
      watermarkedPhotos: watermarkedPhotos.length > 0 ? watermarkedPhotos : [fallbackPhoto],
      privateOriginalMediaRefs:
        privateOriginalRefs.length > 0
          ? privateOriginalRefs
          : [`private_media/submitted_${Date.now().toString(36)}.jpg`],
      watermarkedVideoUrl: videoJobStatus?.previewUrl,
    };

    try {
      submitPartnerListing(payload);
      setTitle("");
      setSummary("");
      setSafeStreetLabel("");
      setExactBuildingNumber("");
      setPropertyManagerPhone("");
      setVehicleOrVesselIdentifier("");
      setWatermarkedPhotos([]);
      setPrivateOriginalRefs([]);
      setVideoJobStatus(null);
      setTab("listings");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit listing.");
    }
  };

  // --- AI Photo Studio Handlers ---
  const handleStudioSourceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) {
      setStudioError("Source photo must be JPEG, PNG, or WebP.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    setStudioSourceBase64(dataUrl);
    setStudioSourceMime(file.type as "image/jpeg" | "image/png" | "image/webp");
    setStudioError(null);
  };

  const handleGenerateStudioImage = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioLoading(true);
    setStudioError(null);
    setStudioResultUrl(null);
    try {
      const res = await fetch("/api/gemini/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: studioPrompt,
          aspectRatio: studioAspect,
          imageSize: "1K",
          sourceImageBase64: studioSourceBase64 ?? undefined,
          sourceMimeType: studioSourceMime,
          applyWatermark: true,
          agentDisplayName: activePartner?.displayAttribution,
        }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl) {
        throw new Error(json.error ?? "Image generation failed.");
      }
      setStudioResultUrl(json.imageUrl);
      notify("AI listing visual generated and permanently watermarked.");
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Image studio request failed.");
    } finally {
      setStudioLoading(false);
    }
  };

  // --- Partner Registration OTP Handlers (PART-08) ---
  const handleRequestRegOtp = async () => {
    setRegError(null);
    const contact = regPhone.trim() || regEmail.trim();
    const channel: "sms" | "email" = regPhone.trim() ? "sms" : "email";
    if (!contact) {
      setRegError("Enter your phone number or email address first to verify channel control.");
      return;
    }
    setRegOtpLoading(true);
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact,
          channel,
          purpose: "partner_verification",
        }),
      });
      const json = (await res.json()) as {
        challengeId?: string;
        sandboxPreviewCode?: string;
        error?: string;
      };
      if (!res.ok || !json.challengeId) {
        throw new Error(json.error ?? "Could not issue OTP.");
      }
      setRegChallengeId(json.challengeId);
      setRegOtpRequested(true);
      setRegDemoOtp(json.sandboxPreviewCode ?? null);
      notify("Single-use verification OTP sent.");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "OTP request failed.");
    } finally {
      setRegOtpLoading(false);
    }
  };

  const handleVerifyRegOtp = async () => {
    setRegError(null);
    if (!regChallengeId) {
      setRegError("Request a verification OTP first.");
      return;
    }
    setRegOtpLoading(true);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: regChallengeId,
          code: regOtpCode.trim(),
        }),
      });
      const json = (await res.json()) as { verified?: boolean; error?: string };
      if (!res.ok || !json.verified) {
        throw new Error(json.error ?? "Invalid or expired OTP.");
      }
      setRegChannelVerified(true);
      notify("Contact channel verified. Complete your ID document upload for Super Admin review.");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "OTP verification failed.");
    } finally {
      setRegOtpLoading(false);
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    if (!regLegalName.trim() || !regEmail.trim() || !regPhone.trim() || regPassword.length < 8) {
      setRegError("Provide full legal name, email, phone, and a password of at least 8 characters.");
      return;
    }
    if (!regChannelVerified) {
      setRegError("Verify your phone or email channel with OTP before submitting registration.");
      return;
    }
    if (!regIdFileName) {
      setRegError(
        "You must upload a clear copy of an accepted Nigerian government ID (NIN slip, passport, driver's licence, or PVC). A typed NIN number alone is not accepted."
      );
      return;
    }

    const ownerUid = `partner_${Date.now().toString(36)}`;
    registerPartnerProfile({
      ownerUid,
      partnerType: regType,
      legalName: regLegalName.trim(),
      agencyName: regAgencyName.trim() || undefined,
      displayAttribution: regAgencyName.trim() || regLegalName.trim(),
      email: regEmail.trim().toLowerCase(),
      phone: regPhone.trim(),
      channelVerified: true,
      idType: regIdType,
      privateIdDocRef: `private_kyc/${ownerUid}/${regIdType}_${regIdFileName}`,
    });

    setRegLegalName("");
    setRegAgencyName("");
    setRegEmail("");
    setRegPhone("");
    setRegPassword("");
    setRegIdFileName("");
    setRegOtpCode("");
    setRegOtpRequested(false);
    setRegChannelVerified(false);
    setTab("listings");
  };

  return (
    <div className="space-y-8">
      {/* Partner Context Switcher & Strict Isolation Notice */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Active Individual Partner Account
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#111318]">
            <span className="font-display text-lg font-bold">
              {activePartner?.displayAttribution ?? "Partner"}
            </span>
            <span className="text-stone-400">·</span>
            <span className="capitalize text-stone-600">{activePartner?.partnerType}</span>
            <span className="text-stone-400">·</span>
            <span
              className={`font-semibold capitalize ${
                activePartner?.verificationStatus === "approved"
                  ? "text-emerald-700"
                  : activePartner?.verificationStatus === "suspended"
                  ? "text-rose-700"
                  : "text-amber-700"
              }`}
            >
              {activePartner?.verificationStatus.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Strict partner isolation active: you can only view your own submitted listings and relevant booking updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="partner-switcher" className="text-xs font-medium text-stone-600">
            Switch Partner Account:
          </label>
          <select
            id="partner-switcher"
            value={activePartner?.ownerUid ?? ""}
            onChange={(e) => setActivePartnerUid(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-[#F8F7F4] border border-stone-300 rounded-lg text-[#111318] focus:outline-none focus:ring-2 focus:ring-[#9A6B32]"
          >
            {partnerProfiles.map((p) => (
              <option key={p.ownerUid} value={p.ownerUid}>
                {p.displayAttribution} ({p.verificationStatus.replace(/_/g, " ")})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
        {(
          [
            { id: "listings", label: `My Listings (${myListings.length})` },
            { id: "submit", label: "Submit New Listing" },
            { id: "studio", label: "AI Photo Studio" },
            { id: "register", label: "Register New Partner (KYC)" },
          ] as Array<{ id: PartnerTab; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              tab === item.id
                ? "bg-[#111318] text-white"
                : "text-stone-600 hover:bg-stone-200/70"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Partner's Own Listings & Relevant Bookings */}
      {tab === "listings" && (
        <div className="space-y-8">
          {activePartner?.verificationStatus !== "approved" && (
            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950">
                <p className="font-semibold">
                  Submission Access Restricted ({activePartner?.verificationStatus.replace(/_/g, " ")})
                </p>
                <p className="text-xs mt-1">
                  New or suspended partner accounts cannot submit listings until manually approved or reactivated by the Super Admin.
                  {activePartner?.reviewNotes ? ` Review note: ${activePartner.reviewNotes}` : ""}
                </p>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-display text-lg font-bold text-[#111318] mb-3">
              Submitted Listings — {activePartner?.displayAttribution}
            </h3>
            {myListings.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-600">
                No listings submitted under this partner account yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myListings.map((item) => (
                  <div
                    key={item.listingId}
                    className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono text-stone-500">
                          {item.listingId} · <span className="capitalize">{item.category}</span>
                        </p>
                        <h4 className="font-display font-bold text-[#111318] mt-0.5">
                          {item.title}
                        </h4>
                        <p className="text-xs text-stone-600 mt-0.5">
                          {item.area}, {item.city}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold capitalize shrink-0 ${
                          item.status === "approved"
                            ? "text-emerald-700"
                            : item.status === "pending_review"
                            ? "text-amber-700"
                            : "text-rose-700"
                        }`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600 font-mono tabular-nums">
                      <span>Base Rate: {formatNairaFromKobo(item.rateKobo)}</span>
                      <span>Caution: {formatNairaFromKobo(item.cautionFeeKobo)}</span>
                      <span>Verified Badge: {item.verifiedPropertyBadge ? "Yes" : "No"}</span>
                    </div>

                    {item.duplicateFlagIds.length > 0 && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Flagged for Super Admin duplicate review against: {item.duplicateFlagIds.join(", ")}
                      </p>
                    )}

                    <p className="text-xs text-stone-500">
                      Agent Protection: Property manager phone{" "}
                      {item.propertyManagerPhone ? "provided privately" : "omitted (optional)"} · Exact building number{" "}
                      {item.exactBuildingNumber ? "held privately" : "omitted (optional)"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-[#111318] mb-3">
              Relevant Booking Updates ({myBookings.length})
            </h3>
            {myBookings.length === 0 ? (
              <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl p-6">
                No confirmed or in-progress bookings yet for your listings.
              </p>
            ) : (
              <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Ref</th>
                      <th className="py-3 px-4 font-semibold">Listing</th>
                      <th className="py-3 px-4 font-semibold">Dates (WAT)</th>
                      <th className="py-3 px-4 font-semibold">Rental Principal</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {myBookings.map((b) => (
                      <tr key={b.bookingRef}>
                        <td className="py-3 px-4 font-mono font-semibold text-[#111318]">
                          {b.bookingRef}
                        </td>
                        <td className="py-3 px-4 text-stone-700">{b.listingTitle}</td>
                        <td className="py-3 px-4 font-mono text-stone-600 tabular-nums">
                          {formatAfricaLagos(b.startIso)}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[#111318] tabular-nums">
                          {formatNairaFromKobo(b.rentalPrincipalKobo)}
                        </td>
                        <td className="py-3 px-4 capitalize font-semibold text-stone-700">
                          {b.status.replace(/_/g, " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Submit New Listing (PART-01, PART-05, PART-06, MEDIA-01, MEDIA-02) */}
      {tab === "submit" && (
        <form
          onSubmit={handleListingSubmit}
          className="bg-white border border-stone-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-[#111318]">
                Submit Listing for Super Admin Review
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                All new submissions enter Pending Review and never appear publicly until approved.
              </p>
            </div>
            <span className="text-xs font-mono text-stone-600">
              Attribution: Listed by: {activePartner?.displayAttribution}
            </span>
          </div>

          {activePartner?.verificationStatus !== "approved" && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Account is currently {activePartner?.verificationStatus.replace(/_/g, " ")}. Listing submission is disabled until Super Admin approval.
            </div>
          )}

          {submitError && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {submitError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ListingCategory)}
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              >
                <option value="apartment">Shortlet Apartment</option>
                <option value="car">Chauffeur / Rental Car</option>
                <option value="boat">Boat / Yacht Charter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Area / Neighbourhood</label>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Lekki Phase 1, Ikoyi, Victoria Island"
                required
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Listing Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 3-Bedroom Pool Terrace in Lekki Phase 1"
                required
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Safe Public Street / Landmark Label (optional)
              </label>
              <input
                type="text"
                value={safeStreetLabel}
                onChange={(e) => setSafeStreetLabel(e.target.value)}
                placeholder="e.g. Off Admiralty Way (never reveals house number)"
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Description & Guest Highlights</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe the space, power backup, service model, or fleet terms clearly."
              required
              className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
            />
          </div>

          {/* Agent Protection Section (PART-06) */}
          <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#111318]">
              <Lock className="w-4 h-4 text-[#9A6B32]" />
              Agent Protection & Private Verification Details (Optional on Submission)
            </div>
            <p className="text-xs text-stone-600">
              You do not have to disclose property manager phone numbers or exact building numbers upfront to submit an apartment. Any private details provided are hidden from the public and used solely for duplicate screening or post-booking coordination.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Exact Building / Unit Number (Optional)
                </label>
                <input
                  type="text"
                  value={exactBuildingNumber}
                  onChange={(e) => setExactBuildingNumber(e.target.value)}
                  placeholder="Optional — never shown publicly"
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Property Manager Phone (Optional)
                </label>
                <input
                  type="text"
                  value={propertyManagerPhone}
                  onChange={(e) => setPropertyManagerPhone(e.target.value)}
                  placeholder="Optional — protects agent relationship"
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {category === "apartment" ? "Authority Evidence Note (Optional)" : "Plate / Vessel Registration ID"}
                </label>
                <input
                  type="text"
                  value={category === "apartment" ? authorityEvidenceNote : vehicleOrVesselIdentifier}
                  onChange={(e) =>
                    category === "apartment"
                      ? setAuthorityEvidenceNote(e.target.value)
                      : setVehicleOrVesselIdentifier(e.target.value)
                  }
                  placeholder={
                    category === "apartment"
                      ? "e.g. Direct landlord mandate on file"
                      : "e.g. LND-412-KA or NIWA-YACHT-88"
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Pricing in Naira (stored internally as integer kobo) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Base Rate (₦ NGN{" "}
                {category === "apartment"
                  ? "per night"
                  : category === "car"
                  ? "per 12h/24h day"
                  : "per hour"}
                )
              </label>
              <input
                type="number"
                min={10000}
                step={5000}
                value={rateNaira}
                onChange={(e) => setRateNaira(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm font-mono tabular-nums bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Refundable Caution Fee (₦ NGN — 0 if none)
              </label>
              <input
                type="number"
                min={0}
                step={5000}
                value={cautionNaira}
                onChange={(e) => setCautionNaira(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-mono tabular-nums bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          {/* Category-Specific Structured Fields */}
          {category === "apartment" && (
            <div className="space-y-4 border-t border-stone-200 pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Bedrooms</label>
                  <input
                    type="number"
                    min={1}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Bathrooms</label>
                  <input
                    type="number"
                    min={1}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Max Overnight Guests</label>
                  <input
                    type="number"
                    min={1}
                    value={maxOvernightGuests}
                    onChange={(e) => setMaxOvernightGuests(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Max Gathering Capacity</label>
                  <input
                    type="number"
                    min={1}
                    value={maxGatheringGuests}
                    onChange={(e) => setMaxGatheringGuests(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-stone-700 mb-2">
                  Structured Apartment Amenities & House Rules (Explicitly Verified Claims)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {activeFeatures.map((feat) => {
                    const checked = selectedFeatureIds.includes(feat.featureId);
                    return (
                      <label
                        key={feat.featureId}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          checked
                            ? "border-[#111318] bg-stone-100 text-[#111318] font-medium"
                            : "border-stone-200 text-stone-600 hover:bg-stone-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFeature(feat.featureId)}
                          className="accent-[#111318]"
                        />
                        <span>{feat.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-6 text-xs text-stone-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smokingAllowed}
                    onChange={(e) => setSmokingAllowed(e.target.checked)}
                    className="accent-[#111318]"
                  />
                  Smoking Allowed
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={partyAllowed}
                    onChange={(e) => setPartyAllowed(e.target.checked)}
                    className="accent-[#111318]"
                  />
                  Small Get-Together Allowed
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={djAllowed}
                    onChange={(e) => setDjAllowed(e.target.checked)}
                    className="accent-[#111318]"
                  />
                  DJ Allowed
                </label>
              </div>
            </div>
          )}

          {category === "car" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-stone-200 pt-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Make & Model</label>
                <input
                  type="text"
                  value={carMakeModel}
                  onChange={(e) => setCarMakeModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">12-Hour Rate (₦)</label>
                <input
                  type="number"
                  value={car12hNaira}
                  onChange={(e) => setCar12hNaira(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">24-Hour Rate (₦)</label>
                <input
                  type="number"
                  value={car24hNaira}
                  onChange={(e) => setCar24hNaira(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {category === "boat" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-stone-200 pt-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Vessel Type</label>
                <input
                  type="text"
                  value={boatVesselType}
                  onChange={(e) => setBoatVesselType(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Passenger Capacity</label>
                <input
                  type="number"
                  value={boatCapacity}
                  onChange={(e) => setBoatCapacity(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Boarding Jetty Area</label>
                <input
                  type="text"
                  value={boatJetty}
                  onChange={(e) => setBoatJetty(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Server-Side Watermarked Photo & Video Upload (MEDIA-01 & MEDIA-02) */}
          <div className="border-t border-stone-200 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-stone-200 bg-[#F8F7F4] space-y-2">
                <p className="text-xs font-semibold text-[#111318] flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-[#9A6B32]" />
                  Upload Listing Photo (Server-Side Permanent Watermark)
                </p>
                <p className="text-xs text-stone-500">
                  Originals are stored privately. Public copies are permanently stamped with{" "}
                  <span className="font-mono text-[#111318]">
                    SHORTLET CONNECT · Listed by: {activePartner?.displayAttribution}
                  </span>
                  .
                </p>
                <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 cursor-pointer">
                  {watermarkLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                  {watermarkLoading ? "Applying Permanent Watermark..." : "Choose Photo (JPEG / PNG / WebP)"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void handlePhotoUpload(e)}
                    className="hidden"
                  />
                </label>
                {watermarkNotice && (
                  <p className="text-[11px] text-emerald-800">{watermarkNotice}</p>
                )}
              </div>

              <div className="p-4 rounded-xl border border-stone-200 bg-[#F8F7F4] space-y-2">
                <p className="text-xs font-semibold text-[#111318] flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-[#9A6B32]" />
                  Upload Walkthrough Video (MEDIA-02)
                </p>
                <p className="text-xs text-stone-500">
                  Video watermark worker flag:{" "}
                  <span className="font-mono font-semibold text-[#111318]">
                    {systemConfig.videoWatermarkEnabled ? "ENABLED (async FFmpeg job)" : "PASSTHROUGH (configurable in Super Admin)"}
                  </span>
                </p>
                <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-300 bg-white text-[#111318] hover:bg-stone-100 cursor-pointer">
                  <Film className="w-3.5 h-3.5" />
                  Select MP4 / MOV Video
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={(e) => void handleVideoUpload(e)}
                    className="hidden"
                  />
                </label>
                {videoJobStatus && (
                  <div className="text-[11px] text-stone-700 space-y-1">
                    <p className="font-mono">
                      Job {videoJobStatus.jobId} · Status: {videoJobStatus.status}
                    </p>
                    <p>{videoJobStatus.notice}</p>
                  </div>
                )}
              </div>
            </div>

            {watermarkedPhotos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {watermarkedPhotos.map((src, idx) => (
                  <div key={idx} className="relative aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Watermarked listing upload ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={activePartner?.verificationStatus !== "approved"}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Submit Listing for Review
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: AI Listing Photo Studio (gemini-nano-banana-2.1) */}
      {tab === "studio" && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="font-display text-lg font-bold text-[#111318] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#9A6B32]" />
              AI Listing Photo Studio
            </h3>
            <p className="text-xs text-stone-600 mt-1">
              Create or refine hospitality visuals from text prompts or an uploaded reference photo. Generated visuals are automatically stamped with the permanent server-side Shortlet Connect watermark before attachment.
            </p>
          </div>

          <form onSubmit={(e) => void handleGenerateStudioImage(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Creative Prompt or Edit Instructions
              </label>
              <textarea
                rows={3}
                value={studioPrompt}
                onChange={(e) => setStudioPrompt(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Aspect Ratio
                </label>
                <select
                  value={studioAspect}
                  onChange={(e) => setStudioAspect(e.target.value as "4:3" | "16:9" | "1:1" | "3:4")}
                  className="w-full px-3 py-2 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
                >
                  <option value="4:3">4:3 Marketplace Card (Recommended)</option>
                  <option value="16:9">16:9 Wide Banner</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="3:4">3:4 Portrait</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Optional Source Photo to Edit (JPEG / PNG / WebP)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void handleStudioSourceFile(e)}
                  className="w-full text-xs text-stone-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-stone-300 file:bg-[#F8F7F4] file:text-xs file:font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={studioLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {studioLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {studioLoading ? "Generating & Watermarking..." : "Generate Watermarked Visual"}
            </button>
          </form>

          {studioError && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <div>
                <p className="font-semibold">AI Studio Notice</p>
                <p className="mt-0.5">{studioError}</p>
              </div>
            </div>
          )}

          {studioResultUrl && (
            <div className="space-y-3 pt-2 border-t border-stone-200">
              <div className="max-w-lg aspect-[4/3] rounded-xl overflow-hidden border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={studioResultUrl}
                  alt="AI generated watermarked listing visual"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setWatermarkedPhotos((prev) => [...prev, studioResultUrl]);
                  setTab("submit");
                  notify("Added watermarked visual to your listing draft.");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#9A6B32] text-white hover:bg-[#825928]"
              >
                <Check className="w-4 h-4" />
                Attach to New Listing Draft
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Individual Partner Registration & KYC (PART-07, PART-08, PART-09) */}
      {tab === "register" && (
        <form
          onSubmit={handleRegisterSubmit}
          className="bg-white border border-stone-200 rounded-xl p-6 space-y-5"
        >
          <div>
            <h3 className="font-display text-lg font-bold text-[#111318] flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#9A6B32]" />
              Individual Partner Registration & Identity Review
            </h3>
            <p className="text-xs text-stone-600 mt-1">
              Register as an Agent, Property Owner, or Property Manager. OTP verifies control of your contact channel only — identity is manually verified by the Super Admin using your uploaded Nigerian government ID.
            </p>
          </div>

          {regError && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {regError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Partner Role</label>
              <select
                value={regType}
                onChange={(e) => setRegType(e.target.value as PartnerType)}
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              >
                <option value="agent">Authorized Agent</option>
                <option value="owner">Property / Fleet Owner</option>
                <option value="manager">Property Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Full Legal Name</label>
              <input
                type="text"
                value={regLegalName}
                onChange={(e) => setRegLegalName(e.target.value)}
                required
                placeholder="Matches government ID"
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Agency / Business Name (Optional)
              </label>
              <input
                type="text"
                value={regAgencyName}
                onChange={(e) => setRegAgencyName(e.target.value)}
                placeholder="Shown on watermark attribution"
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Email Address</label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Phone Number (Nigeria)</label>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                required
                placeholder="+23480..."
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Account Password (min 8 chars)</label>
              <input
                type="password"
                minLength={8}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          {/* Step 2: Live OTP Channel Verification (PART-08) */}
          <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#111318]">
                Step 1: Contact Channel Verification (Single-Use OTP)
              </p>
              {regChannelVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" /> Channel Verified
                </span>
              )}
            </div>
            <p className="text-xs text-stone-600">
              OTP confirms you control your phone/email channel only; it does not approve your identity.
            </p>
            {!regChannelVerified && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleRequestRegOtp()}
                  disabled={regOtpLoading}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {regOtpRequested ? "Resend OTP" : "Send Verification OTP"}
                </button>
                {regOtpRequested && (
                  <>
                    <input
                      type="text"
                      maxLength={6}
                      value={regOtpCode}
                      onChange={(e) => setRegOtpCode(e.target.value)}
                      placeholder="6-digit OTP"
                      className="w-32 px-3 py-2 text-xs font-mono bg-white border border-stone-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyRegOtp()}
                      disabled={regOtpLoading}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#9A6B32] text-white hover:bg-[#825928]"
                    >
                      Verify OTP
                    </button>
                  </>
                )}
              </div>
            )}
            {regDemoOtp && !regChannelVerified && (
              <p className="text-xs font-mono text-stone-600">
                Sandbox SMS/Email Preview Code: <strong className="text-[#111318]">{regDemoOtp}</strong>
              </p>
            )}
          </div>

          {/* Step 3: Accepted Nigerian Government ID Upload (PART-09) */}
          <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200 space-y-3">
            <p className="text-xs font-semibold text-[#111318]">
              Step 2: Accepted Nigerian Government ID Document (Private Encrypted Storage)
            </p>
            <p className="text-xs text-stone-600">
              Accepted documents: National Identification Number (NIN) slip, Nigerian international passport, Nigerian driver&apos;s licence, or Permanent Voter&apos;s Card (PVC). A typed NIN number alone is not accepted. Stored privately for Super Admin manual review only (retention: {systemConfig.identityDocRetentionDays} days).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select
                value={regIdType}
                onChange={(e) => setRegIdType(e.target.value as AcceptedIdType)}
                className="px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg"
              >
                <option value="nin_slip">NIN Slip (Uploaded Document)</option>
                <option value="international_passport">Nigerian International Passport</option>
                <option value="drivers_licence">Nigerian Driver&apos;s Licence</option>
                <option value="pvc">Permanent Voter&apos;s Card (PVC)</option>
              </select>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setRegIdFileName(e.target.files?.[0]?.name ?? "")}
                className="text-xs text-stone-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:text-xs file:font-semibold"
              />
            </div>
            {regIdFileName && (
              <p className="text-xs font-mono text-emerald-700">
                Document selected for encrypted private upload: {regIdFileName}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
            >
              Submit Partner Application (Pending Review)
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
