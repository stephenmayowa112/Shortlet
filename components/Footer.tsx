"use client";

import React from "react";
import type { AppView } from "@/components/Navbar";
import type { PolicySectionId } from "@/components/LegalPagesView";
import { useMarketplace } from "@/components/MarketplaceProvider";

interface FooterProps {
  onNavigate: (view: AppView, policySection?: PolicySectionId) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const { systemConfig } = useMarketplace();

  return (
    <footer className="mt-20 border-t border-stone-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8 text-xs text-stone-600">
        <div className="space-y-2 md:col-span-2">
          <p className="font-display text-base font-bold text-[#111318]">
            Shortlet Connect
          </p>
          <p className="max-w-md leading-relaxed">
            Admin-managed luxury shortlet apartments, chauffeur-driven cars, and lagoon boat charters across Lagos, Nigeria. Every published listing is vetted before approval and backed by transparent Naira pricing.
          </p>
          <p className="font-mono text-[11px] text-stone-500 pt-1">
            Official WhatsApp Desk: {systemConfig.officialWhatsAppNumber} · Timezone: Africa/Lagos (WAT)
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[#111318] uppercase tracking-wider text-[11px]">
            Marketplace
          </p>
          <ul className="space-y-1.5">
            <li>
              <button
                type="button"
                onClick={() => onNavigate("explore")}
                className="hover:text-[#111318] transition-colors"
              >
                Explore Verified Listings
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("saved")}
                className="hover:text-[#111318] transition-colors"
              >
                Saved Shortlist
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("bookings")}
                className="hover:text-[#111318] transition-colors"
              >
                My Bookings &amp; Receipts
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("portals")}
                className="hover:text-[#111318] transition-colors"
              >
                Partner &amp; Admin Portals
              </button>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[#111318] uppercase tracking-wider text-[11px]">
            Policies &amp; Support
          </p>
          <ul className="space-y-1.5">
            <li>
              <button
                type="button"
                onClick={() => onNavigate("policies", "about")}
                className="hover:text-[#111318] transition-colors"
              >
                About Us
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("policies", "contact")}
                className="hover:text-[#111318] transition-colors"
              >
                Contact &amp; Support
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("policies", "terms")}
                className="hover:text-[#111318] transition-colors"
              >
                Terms of Service
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("policies", "privacy")}
                className="hover:text-[#111318] transition-colors"
              >
                Privacy &amp; ID Retention Policy
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onNavigate("policies", "booking_rules")}
                className="hover:text-[#111318] transition-colors"
              >
                Booking &amp; Cancellation Rules
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-stone-100 py-4 pb-20 md:pb-4 px-4 text-center text-[11px] text-stone-500">
        © {new Date().getFullYear()} Shortlet Connect Nigeria. All published listing media is watermarked and curated.
      </div>
    </footer>
  );
}
