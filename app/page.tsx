"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MarketplaceProvider, useMarketplace } from "@/components/MarketplaceProvider";
import { Navbar, type AppView } from "@/components/Navbar";
import { MarketplaceView } from "@/components/MarketplaceView";
import { ListingDetailModal } from "@/components/ListingDetailModal";
import { CustomerBookingsView } from "@/components/CustomerBookingsView";
import { PortalsContainer } from "@/components/PortalsContainer";
import { LegalPagesView, type PolicySectionId } from "@/components/LegalPagesView";
import { Footer } from "@/components/Footer";
import { ConciergeChatWidget } from "@/components/ConciergeChatWidget";
import type { PublicListing } from "@/lib/types";

function ShortletConnectAppShell() {
  const { publicListings, toastMessage } = useMarketplace();
  const [activeView, setActiveView] = useState<AppView>("explore");
  const [policySection, setPolicySection] = useState<PolicySectionId>("about");
  const [selectedListing, setSelectedListing] = useState<PublicListing | null>(null);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);

  // Deep-link resolution for canonical WhatsApp URLs: /?listing=SC-APT-101 (MSG-03)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const listingParam = params.get("listing");
    if (!listingParam) return;
    const found = publicListings.find((l) => l.listingId === listingParam);
    if (!found) return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSelectedListing(found);
      }
    });
    return () => {
      active = false;
    };
  }, [publicListings]);

  const handleNavigate = (view: AppView, nextPolicySection?: PolicySectionId) => {
    if (nextPolicySection) {
      setPolicySection(nextPolicySection);
    }
    setActiveView(view);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleOpenListing = (listing: PublicListing, featureIds: string[] = []) => {
    setSelectedListing(listing);
    setSelectedFeatureIds(featureIds);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("listing", listing.listingId);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleCloseListing = () => {
    setSelectedListing(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("listing");
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#111318]">
      <Navbar activeView={activeView} onNavigate={handleNavigate} />

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {activeView === "explore" && (
              <MarketplaceView
                onSelectListing={handleOpenListing}
                onNavigateToPortals={() => handleNavigate("portals")}
              />
            )}

            {activeView === "saved" && (
              <CustomerBookingsView
                mode="saved"
                onOpenListing={(listing) => handleOpenListing(listing)}
              />
            )}

            {activeView === "bookings" && (
              <CustomerBookingsView
                mode="bookings"
                onOpenListing={(listing) => handleOpenListing(listing)}
              />
            )}

            {activeView === "portals" && <PortalsContainer />}

            {activeView === "policies" && (
              <LegalPagesView key={policySection} initialSection={policySection} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer onNavigate={handleNavigate} />

      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          selectedFeatureIds={selectedFeatureIds}
          onClose={handleCloseListing}
          onNavigateToBookings={() => {
            handleCloseListing();
            handleNavigate("bookings");
          }}
        />
      )}

      <ConciergeChatWidget />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-md px-4 py-3 rounded-xl bg-[#111318] text-white text-xs font-medium shadow-xl border border-stone-700"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <ErrorBoundary>
      <MarketplaceProvider>
        <ShortletConnectAppShell />
      </MarketplaceProvider>
    </ErrorBoundary>
  );
}
