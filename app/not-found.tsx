import React from "react";
import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#F8F7F4] text-[#111318] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-5 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-stone-100 text-[#111318] flex items-center justify-center mx-auto">
          <Compass className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-[#9A6B32]">404</p>
          <h1 className="font-display text-2xl font-semibold text-[#111318]">
            Listing or page not found
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            The listing may have been removed or is not yet approved for public viewing.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex w-full h-11 items-center justify-center rounded-lg bg-[#111318] text-white text-sm font-semibold hover:bg-stone-800"
        >
          Browse Approved Listings
        </Link>
      </div>
    </main>
  );
}
