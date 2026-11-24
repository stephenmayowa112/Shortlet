"use client";

import React, { useState } from "react";
import { Building2, Shield, UserCog } from "lucide-react";
import { PartnerPortal } from "@/components/PartnerPortal";
import { AdminPortal } from "@/components/AdminPortal";
import { SuperAdminPortal } from "@/components/SuperAdminPortal";
import { useMarketplace } from "@/components/MarketplaceProvider";

type WorkspaceTab = "partner" | "operational_admin" | "super_admin";

export function PortalsContainer() {
  const { activeRole, setActiveRole, firebaseUser } = useMarketplace();
  const [workspace, setWorkspace] = useState<WorkspaceTab>(
    activeRole === "super_admin"
      ? "super_admin"
      : activeRole === "operational_admin"
      ? "operational_admin"
      : "partner"
  );

  const handleSelectWorkspace = (next: WorkspaceTab) => {
    setWorkspace(next);
    setActiveRole(next);
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9A6B32]">
            Role-Scoped Operations
          </p>
          <h1 className="font-display text-3xl font-bold text-[#111318] tracking-tight mt-1">
            Partner &amp; Admin Portals
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Every workspace enforces strict server-aligned role boundaries: partners see only their own listings, operational admins coordinate enquiries and bookings without owner private numbers, and the Super Admin governs approvals, finance, and audit logs.
          </p>
        </div>

        {firebaseUser && (
          <p className="text-xs font-mono text-stone-500">
            Signed in: {firebaseUser.email}
          </p>
        )}
      </div>

      {/* Role Workspace Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleSelectWorkspace("partner")}
          className={`p-4 rounded-xl border text-left transition-colors ${
            workspace === "partner"
              ? "bg-[#111318] text-white border-[#111318]"
              : "bg-white text-[#111318] border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center gap-2 font-display font-bold text-sm">
            <Building2 className="w-4 h-4 text-[#9A6B32]" />
            Partner Dashboard
          </div>
          <p
            className={`text-xs mt-1 ${
              workspace === "partner" ? "text-stone-300" : "text-stone-500"
            }`}
          >
            Agents, owners &amp; managers · KYC onboarding, watermarked uploads &amp; AI Photo Studio
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelectWorkspace("operational_admin")}
          className={`p-4 rounded-xl border text-left transition-colors ${
            workspace === "operational_admin"
              ? "bg-[#111318] text-white border-[#111318]"
              : "bg-white text-[#111318] border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center gap-2 font-display font-bold text-sm">
            <UserCog className="w-4 h-4 text-[#9A6B32]" />
            Operational Admin
          </div>
          <p
            className={`text-xs mt-1 ${
              workspace === "operational_admin" ? "text-stone-300" : "text-stone-500"
            }`}
          >
            Official WhatsApp inbox, bookings, live video inspections, review moderation &amp; support
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelectWorkspace("super_admin")}
          className={`p-4 rounded-xl border text-left transition-colors ${
            workspace === "super_admin"
              ? "bg-[#111318] text-white border-[#111318]"
              : "bg-white text-[#111318] border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center gap-2 font-display font-bold text-sm">
            <Shield className="w-4 h-4 text-[#9A6B32]" />
            Super Admin Console
          </div>
          <p
            className={`text-xs mt-1 ${
              workspace === "super_admin" ? "text-stone-300" : "text-stone-500"
            }`}
          >
            KYC &amp; listing approvals, separated financial ledger, caution refunds, config &amp; audit trail
          </p>
        </button>
      </div>

      {/* Active Workspace */}
      <div>
        {workspace === "partner" && <PartnerPortal />}
        {workspace === "operational_admin" && <AdminPortal />}
        {workspace === "super_admin" && <SuperAdminPortal />}
      </div>
    </section>
  );
}
