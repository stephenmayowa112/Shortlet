"use client";

import React, { useState } from "react";
import {
  FileText,
  Lock,
  MessageCircle,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";

export type PolicySectionId = "about" | "contact" | "terms" | "privacy" | "booking_rules";

interface LegalPagesViewProps {
  initialSection?: PolicySectionId;
}

export function LegalPagesView({ initialSection = "about" }: LegalPagesViewProps) {
  const { systemConfig } = useMarketplace();
  const [section, setSection] = useState<PolicySectionId>(initialSection);

  const digits = systemConfig.officialWhatsAppNumber.replace(/\D/g, "") || "2348090001234";
  const officialSupportLink = {
    url: `https://wa.me/${digits}?text=${encodeURIComponent(
      "Hello Shortlet Connect Support, I need assistance with a listing or booking."
    )}`,
  };

  const sections: Array<{ id: PolicySectionId; label: string; icon: React.ReactNode }> = [
    { id: "about", label: "About Us", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "contact", label: "Contact & Support", icon: <MessageCircle className="w-4 h-4" /> },
    { id: "terms", label: "Terms of Service", icon: <Scale className="w-4 h-4" /> },
    { id: "privacy", label: "Privacy & ID Retention", icon: <Lock className="w-4 h-4" /> },
    { id: "booking_rules", label: "Booking & Cancellation", icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-stone-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#9A6B32]">
          Trust, Safety &amp; Legal
        </p>
        <h1 className="font-display text-3xl font-bold text-[#111318] tracking-tight mt-1">
          Shortlet Connect Policies &amp; Disclosures
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Transparent marketplace governance for guests, partners, and verified stays across Nigeria.
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-2">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              section === item.id
                ? "bg-[#111318] text-white"
                : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-100"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-6 text-sm text-stone-700 leading-relaxed">
        {section === "about" && (
          <>
            <h2 className="font-display text-2xl font-bold text-[#111318]">
              About Shortlet Connect
            </h2>
            <p>
              Shortlet Connect is a curated, admin-managed booking marketplace for verified shortlet apartments, chauffeur-driven cars, and lagoon boat charters in Nigeria. Every listing is manually reviewed before public display, and guests may request an admin-hosted live video inspection before making payment.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200">
                <p className="font-display font-bold text-[#111318]">Admin-Managed Trust</p>
                <p className="text-xs text-stone-600 mt-1">
                  All enquiries flow through our official WhatsApp Business line and assigned operational admins to prevent unverified off-platform redirection.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200">
                <p className="font-display font-bold text-[#111318]">Transparent Pricing</p>
                <p className="text-xs text-stone-600 mt-1">
                  Guests see exact rental principal, service charge, and refundable caution fees in Nigerian Naira (₦) before payment.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200">
                <p className="font-display font-bold text-[#111318]">Watermarked Media</p>
                <p className="text-xs text-stone-600 mt-1">
                  Published listing photos carry permanent server-side attribution to discourage uncredited reuse and protect verified partners.
                </p>
              </div>
            </div>
          </>
        )}

        {section === "contact" && (
          <>
            <h2 className="font-display text-2xl font-bold text-[#111318]">
              Contact &amp; Official Support
            </h2>
            <p>
              For booking assistance, live video inspections, partner onboarding, or urgent check-in support, contact our operational team exclusively through the official Shortlet Connect channels below.
            </p>
            <div className="p-5 rounded-xl bg-[#F8F7F4] border border-stone-200 space-y-2 text-xs">
              <p>
                <strong className="text-[#111318]">Official WhatsApp Desk:</strong>{" "}
                <span className="font-mono">{systemConfig.officialWhatsAppNumber}</span>
              </p>
              <p>
                <strong className="text-[#111318]">Support Hours:</strong> 08:00 – 22:00 WAT (Africa/Lagos), 7 days a week
              </p>
              <p>
                <strong className="text-[#111318]">Compliance &amp; Disputes:</strong> Escalated issues are reviewed directly by the Super Admin with full audit logging.
              </p>
            </div>
            <a
              href={officialSupportLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
            >
              <MessageCircle className="w-4 h-4" />
              Chat With Us on Official WhatsApp
            </a>
          </>
        )}

        {section === "terms" && (
          <>
            <h2 className="font-display text-2xl font-bold text-[#111318]">
              Terms of Service
            </h2>
            <ul className="list-disc pl-5 space-y-2.5">
              <li>
                <strong>Listing Accuracy &amp; Approval:</strong> Listings appear publicly only after Super Admin approval. Apartment features (such as private pools, PS5, smoking rules, or gathering limits) reflect submitted partner claims reviewed during onboarding.
              </li>
              <li>
                <strong>Agent Protection &amp; Ownership Claims:</strong> Partners submitting apartments are not required to disclose property manager phone numbers or exact building numbers upfront. Verified property owners may submit ownership claims with documentation for Super Admin adjudication.
              </li>
              <li>
                <strong>Media Attribution:</strong> By uploading photos or videos, partners authorize Shortlet Connect to store original files privately and publish permanently watermarked copies carrying Shortlet Connect and partner attribution.
              </li>
              <li>
                <strong>Verified Reviews:</strong> In Version 1, reviews apply to completed apartment stays only. Genuine negative feedback is preserved; moderation removals require a documented spam, abuse, or policy violation reason.
              </li>
            </ul>
          </>
        )}

        {section === "privacy" && (
          <>
            <h2 className="font-display text-2xl font-bold text-[#111318]">
              Privacy Policy &amp; Identity Document Retention
            </h2>
            <p>
              Shortlet Connect minimizes public exposure of sensitive personal and property data at every stage of the marketplace workflow:
            </p>
            <ul className="list-disc pl-5 space-y-2.5">
              <li>
                <strong>Address &amp; Contact Redaction:</strong> Public listings display city, neighbourhood area, and safe street labels only. Exact building numbers, property manager numbers, and legal owner private contacts are never exposed to the public.
              </li>
              <li>
                <strong>Nigerian Government ID Protection:</strong> Partner verification documents (NIN slip, international passport, driver&apos;s licence, or PVC) are stored in private encrypted storage inaccessible to the public, guests, or other partners. Access is restricted strictly to the Super Admin for manual identity verification.
              </li>
              <li>
                <strong>Retention &amp; Deletion Schedule:</strong> Identity verification documents are retained for{" "}
                <span className="font-mono font-semibold text-[#111318]">
                  {systemConfig.identityDocRetentionDays} days
                </span>{" "}
                after account closure or review completion unless required longer for active fraud or legal dispute resolution, after which they are purged securely.
              </li>
              <li>
                <strong>Guest Saved Listings:</strong> Guests may save listings locally in their browser without creating an account. Local saves are merged into a verified customer profile only after explicit user consent following OTP verification.
              </li>
            </ul>
          </>
        )}

        {section === "booking_rules" && (
          <>
            <h2 className="font-display text-2xl font-bold text-[#111318]">
              Booking, Payment, Service Charge &amp; Cancellation Rules
            </h2>
            <ul className="list-disc pl-5 space-y-2.5">
              <li>
                <strong>Server-Verified Payment Confirmation:</strong> A booking is confirmed only after server-side Paystack transaction verification (or a documented Super Admin payment exception). Browser redirects alone never confirm a reservation.
              </li>
              <li>
                <strong>Transparent Service Charge Schedule:</strong>
                <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-stone-600">
                  <li>Shortlet Apartments: ₦30,000 per booked night.</li>
                  <li>Cars: ₦30,000 per chargeable day (12-hour and 24-hour rentals each incur 1 unit; 3-day rentals incur 3 units).</li>
                  <li>Boats &amp; Yachts: ₦30,000 per 2-hour block, rounded up (e.g., 3 hours = ₦60,000; 4 hours = ₦60,000; 5 hours = ₦90,000).</li>
                </ul>
              </li>
              <li>
                <strong>Refundable Caution Deposit:</strong> Where applicable, caution deposits are held strictly as a refundable customer liability (not platform revenue). Post-checkout release or documented deduction proposals are reviewed and approved by the Super Admin with an auditable refund reference.
              </li>
              <li>
                <strong>Cancellations &amp; Rescheduling:</strong> Check-in times are tracked in West Africa Time (Africa/Lagos). Guests should notify their assigned Operational Admin via official WhatsApp at least 48 hours prior to check-in for rescheduling or cancellation review.
              </li>
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
