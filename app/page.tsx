"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MarketplaceProvider, useMarketplace } from "@/components/MarketplaceProvider";
import { Navbar, type AppView } from "@/components/Navbar";
import { MarketplaceView } from "@/components/MarketplaceView";
import type { PolicySectionId } from "@/components/LegalPagesView";
import { Footer } from "@/components/Footer";
import type { PublicListing } from "@/lib/types";

const ListingDetailModal = dynamic(
  () => import("@/components/ListingDetailModal").then((mod) => mod.ListingDetailModal),
  { ssr: false }
);

const CustomerBookingsView = dynamic(
  () => import("@/components/CustomerBookingsView").then((mod) => mod.CustomerBookingsView),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-sm text-stone-500">
        Loading your bookings...
      </div>
    ),
  }
);

const PortalsContainer = dynamic(
  () => import("@/components/PortalsContainer").then((mod) => mod.PortalsContainer),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-sm text-stone-500">
        Loading workspace portals...
      </div>
    ),
  }
);

const LegalPagesView = dynamic(
  () => import("@/components/LegalPagesView").then((mod) => mod.LegalPagesView),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-sm text-stone-500">
        Loading policies...
      </div>
    ),
  }
);

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

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-5 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 sm:max-w-md px-4 py-3 rounded-xl bg-[#111318] text-white text-xs font-medium shadow-xl border border-stone-700 text-center sm:text-left"
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
