"use client";

import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "An unexpected interface error occurred.",
    };
  }

  componentDidCatch(error: Error) {
    console.error("Shortlet Connect ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[420px] flex items-center justify-center p-6 bg-[#F8F7F4]">
          <div className="max-w-lg w-full bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-semibold text-[#111318]">
                Something interrupted this view
              </h2>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#111318] text-white hover:bg-stone-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Recover View
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
