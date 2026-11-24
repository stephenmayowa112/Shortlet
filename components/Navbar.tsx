"use client";

import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";

export type AppView = "explore" | "saved" | "bookings" | "portals" | "policies";

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export function Navbar({ activeView, onNavigate }: NavbarProps) {
  const { firebaseUser, guestSavedIds, signInWithGoogle, signOutUser } = useMarketplace();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: "explore", label: "Explore" },
    { id: "saved", label: guestSavedIds.length > 0 ? `Saved (${guestSavedIds.length})` : "Saved" },
    { id: "bookings", label: "My Bookings" },
    { id: "portals", label: "Portals" },
    { id: "policies", label: "Policies" },
  ];

  const handleNav = (id: AppView) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F8F7F4]/95 backdrop-blur-md border-b border-stone-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark (single text element, no clutter) */}
        <button
          type="button"
          onClick={() => handleNav("explore")}
          className="font-display text-lg font-bold tracking-tight text-[#111318] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A6B32] rounded"
        >
          Shortlet Connect
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A6B32] rounded ${
                  isActive
                    ? "text-[#111318] font-semibold"
                    : "text-stone-600 hover:text-[#111318]"
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute left-0 right-0 -bottom-[19px] h-[2px] bg-[#111318]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary CTA action */}
        <div className="flex items-center gap-3 shrink-0">
          {firebaseUser ? (
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="hidden md:inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg border border-stone-300 text-[#111318] hover:bg-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="hidden md:inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0"
            >
              Staff Sign In
            </button>
          )}

          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#111318] hover:bg-stone-200/70 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-stone-200 bg-[#F8F7F4] px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full text-left px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeView === item.id
                  ? "bg-[#111318] text-white"
                  : "text-stone-700 hover:bg-stone-200/60"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="pt-2 border-t border-stone-200">
            {firebaseUser ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void signOutUser();
                }}
                className="w-full py-3 px-4 text-sm font-semibold rounded-lg border border-stone-300 text-[#111318]"
              >
                Sign Out ({firebaseUser.email})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void signInWithGoogle();
                }}
                className="w-full py-3 px-4 text-sm font-semibold rounded-lg bg-[#111318] text-white"
              >
                Staff Sign In with Google
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
