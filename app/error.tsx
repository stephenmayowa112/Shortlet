"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log minimal non-PII error digest for diagnostics without exposing internals to users
    console.error("Shortlet Connect UI error boundary triggered.", {
      digest: error.digest ?? "none",
    });
  }, [error]);

  return (
    <main className="min-h-screen bg-[#F8F7F4] text-[#111318] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-5 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-[#9A6B32] flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-[#111318]">
            Something went wrong
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            We hit an unexpected issue while loading this view. Your saved listings and verified bookings are safe.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-[#111318] text-white text-sm font-semibold hover:bg-stone-800"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="flex-1 h-11 inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white text-sm font-semibold text-[#111318] hover:bg-stone-50"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    </main>
  );
}
