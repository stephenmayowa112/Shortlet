"use client";

import React, { useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { formatAfricaLagos, formatNairaFromKobo } from "@/lib/domain/pricing";
import type { FeatureGroup, LedgerEntry } from "@/lib/types";

type SuperTab = "approvals" | "staff" | "finance" | "catalogue" | "audit";

export function SuperAdminPortal() {
  const {
    partnerProfiles,
    privateListings,
    tickets,
    staffAccounts,
    bookings,
    ledgerEntries,
    featureCatalogue,
    auditLogs,
    systemConfig,
    reviewPartnerProfile,
    reviewListingSubmission,
    resolveOwnershipClaim,
    assignTicket,
    updateStaffStatus,
    addOperationalAdmin,
    approveCautionRefund,
    markLedgerSettled,
    upsertFeatureCatalogueItem,
    toggleFeatureActive,
    updateSystemConfig,
    notify,
  } = useMarketplace();

  const [tab, setTab] = useState<SuperTab>("approvals");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [refundRefs, setRefundRefs] = useState<Record<string, string>>({});
  const [reconciliationResult, setReconciliationResult] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);

  // Feature catalogue editor state
  const [featId, setFeatId] = useState("");
  const [featLabel, setFeatLabel] = useState("");
  const [featGroup, setFeatGroup] = useState<FeatureGroup>("entertainment");
  const [featSynonyms, setFeatSynonyms] = useState("");

  // System config form state
  const [adminCapInput, setAdminCapInput] = useState(String(systemConfig.operationalAdminCap));
  const [carCutoffInput, setCarCutoffInput] = useState(String(systemConfig.carPartialDayCutoffHours));
  const [retentionInput, setRetentionInput] = useState(String(systemConfig.identityDocRetentionDays));
  const [whatsappInput, setWhatsappInput] = useState(systemConfig.officialWhatsAppNumber);

  const activeOpsAdmins = useMemo(
    () => staffAccounts.filter((s) => s.role === "operational_admin" && s.status === "active"),
    [staffAccounts]
  );

  // Separated Financial Totals (FIN-02)
  const ledgerSummary = useMemo(() => {
    const sums = {
      collected: 0,
      pending: 0,
      payable: 0,
      paid: 0,
      cautionLiability: 0,
      adminAllocation: 0,
      founderAllocation: 0,
      adsOpsAllocation: 0,
    };
    for (const e of ledgerEntries) {
      if (e.settlementStatus === "collected") sums.collected += e.amountKobo;
      if (e.settlementStatus === "pending") sums.pending += e.amountKobo;
      if (e.settlementStatus === "payable") sums.payable += e.amountKobo;
      if (e.settlementStatus === "paid") sums.paid += e.amountKobo;
      if (e.category === "caution_deposit_liability") sums.cautionLiability += e.amountKobo;
      if (e.category === "coordinating_admin_allocation") sums.adminAllocation += e.amountKobo;
      if (e.category === "founder_allocation") sums.founderAllocation += e.amountKobo;
      if (e.category === "ads_ops_allocation") sums.adsOpsAllocation += e.amountKobo;
    }
    return sums;
  }, [ledgerEntries]);

  const handleRunReconciliation = async () => {
    setReconciling(true);
    setReconciliationResult(null);
    try {
      const res = await fetch("/api/paystack/webhook", { method: "GET" });
      const json = (await res.json()) as {
        checkedAt?: string;
        verifiedCount?: number;
        discrepancies?: unknown[];
      };
      setReconciliationResult(
        `Reconciliation completed at ${formatAfricaLagos(json.checkedAt ?? new Date().toISOString())}: ${json.verifiedCount ?? 0} Paystack transaction(s) checked, ${json.discrepancies?.length ?? 0} discrepancy(ies) found.`
      );
      notify("Daily Paystack reconciliation job completed.");
    } catch {
      setReconciliationResult("Could not reach reconciliation endpoint.");
    } finally {
      setReconciling(false);
    }
  };

  const handleAddFeature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!featId.trim() || !featLabel.trim()) return;
    upsertFeatureCatalogueItem({
      featureId: featId.trim().toLowerCase().replace(/\s+/g, "_"),
      label: featLabel.trim(),
      group: featGroup,
      active: true,
      synonyms: featSynonyms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      sortOrder: featureCatalogue.length + 1,
    });
    setFeatId("");
    setFeatLabel("");
    setFeatSynonyms("");
  };

  return (
    <div className="space-y-8">
      {/* Super Admin Governance Banner */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B32]">
            Super Admin Governance Console
          </p>
          <h3 className="font-display text-xl font-bold text-[#111318] mt-0.5">
            Full Oversight, KYC Approvals, Separated Financial Ledger & Audit Trail
          </h3>
          <p className="text-xs text-stone-500 mt-1">
            Super Admin exclusively views private Nigerian KYC ID references, legal owner private contacts, and internal ₦10k/₦10k/₦10k service-charge allocations.
          </p>
        </div>
        <div className="text-xs font-mono text-stone-600 tabular-nums shrink-0">
          Ops Admins: {activeOpsAdmins.length}/{systemConfig.operationalAdminCap} · Audit Entries: {auditLogs.length}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
        {(
          [
            { id: "approvals", label: "Approvals & Claims" },
            { id: "staff", label: "Tickets & Staff" },
            { id: "finance", label: "Financial Ledger & Refunds" },
            { id: "catalogue", label: "Feature Catalogue & Config" },
            { id: "audit", label: `Audit Log (${auditLogs.length})` },
          ] as Array<{ id: SuperTab; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
              tab === item.id
                ? "bg-[#111318] text-white"
                : "text-stone-600 hover:bg-stone-200/70"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Partner KYC Queue & Pending Listings + Duplicate/Owner Claims */}
      {tab === "approvals" && (
        <div className="space-y-8">
          {/* Partner KYC Queue */}
          <div className="space-y-3">
            <h4 className="font-display text-base font-bold text-[#111318] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#9A6B32]" />
              Partner KYC Verification Queue ({partnerProfiles.length})
            </h4>
            <div className="space-y-3">
              {partnerProfiles.map((p) => (
                <div
                  key={p.ownerUid}
                  className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono text-stone-500">
                        {p.ownerUid} · <span className="capitalize">{p.partnerType}</span> · OTP Channel:{" "}
                        {p.channelVerified ? "Verified" : "Unverified"}
                      </p>
                      <h5 className="font-display font-bold text-[#111318] mt-0.5">
                        {p.legalName}{" "}
                        {p.agencyName ? <span className="text-stone-500 font-normal">({p.agencyName})</span> : null}
                      </h5>
                      <p className="text-xs text-stone-600">
                        {p.email} · {p.phone}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold capitalize ${
                        p.verificationStatus === "approved"
                          ? "text-emerald-700"
                          : p.verificationStatus === "suspended" || p.verificationStatus === "rejected"
                          ? "text-rose-700"
                          : "text-amber-700"
                      }`}
                    >
                      {p.verificationStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  <p className="text-xs font-mono text-stone-600 bg-[#F8F7F4] px-3 py-2 rounded-lg border border-stone-200">
                    Super Admin Private ID Ref ({p.idType.replace(/_/g, " ")}): {p.privateIdDocRef}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Audit note / decision reason..."
                      value={decisionNotes[p.ownerUid] ?? ""}
                      onChange={(e) =>
                        setDecisionNotes((prev) => ({ ...prev, [p.ownerUid]: e.target.value }))
                      }
                      className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        reviewPartnerProfile(
                          p.ownerUid,
                          "approved",
                          decisionNotes[p.ownerUid] || "Manual ID document review passed."
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reviewPartnerProfile(
                          p.ownerUid,
                          "more_info_requested",
                          decisionNotes[p.ownerUid] || "Requesting clearer government ID image."
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-stone-700"
                    >
                      Request More Info
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reviewPartnerProfile(
                          p.ownerUid,
                          "suspended",
                          decisionNotes[p.ownerUid] || "Suspended pending compliance review."
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 text-rose-700"
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Listings Approval, Duplicate Screening & Owner Claims */}
          <div className="space-y-3">
            <h4 className="font-display text-base font-bold text-[#111318] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#9A6B32]" />
              Listing Moderation, Duplicate Flags & Verified Property Badge ({privateListings.length})
            </h4>
            <div className="space-y-3">
              {privateListings.map((item) => (
                <div
                  key={item.listingId}
                  className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-stone-500">
                        {item.listingId} · <span className="capitalize">{item.category}</span> · By{" "}
                        {item.originatorDisplayName}
                      </p>
                      <h5 className="font-display font-bold text-[#111318] mt-0.5">{item.title}</h5>
                      <p className="text-xs text-stone-600">
                        {item.area}, {item.city} · Rate: {formatNairaFromKobo(item.rateKobo)} · Verified Badge:{" "}
                        <strong>{item.verifiedPropertyBadge ? "Yes" : "No"}</strong>
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold capitalize ${
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

                  {item.duplicateFlagIds.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950">
                      <strong>Duplicate Screening Alert (PART-02):</strong> Possible overlap with{" "}
                      <span className="font-mono">{item.duplicateFlagIds.join(", ")}</span>. Verify authority evidence before approving.
                    </div>
                  )}

                  {/* Super Admin Exclusive Private Owner Contact */}
                  <div className="text-xs bg-[#F8F7F4] border border-stone-200 rounded-lg px-3 py-2 text-stone-700 space-y-0.5">
                    <p>
                      Exact Building: <span className="font-mono">{item.exactBuildingNumber ?? "Not disclosed"}</span> · Manager Phone:{" "}
                      <span className="font-mono">{item.propertyManagerPhone ?? "Not disclosed"}</span>
                    </p>
                    <p>
                      Legal Owner Private Contact (Super Admin Only):{" "}
                      <span className="font-mono">
                        {item.legalOwnerPrivateContact
                          ? `${item.legalOwnerPrivateContact.name} · ${item.legalOwnerPrivateContact.phone}`
                          : "None on file"}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Audit reason..."
                      value={decisionNotes[item.listingId] ?? ""}
                      onChange={(e) =>
                        setDecisionNotes((prev) => ({ ...prev, [item.listingId]: e.target.value }))
                      }
                      className="flex-1 min-w-[180px] px-3 py-1.5 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        reviewListingSubmission(
                          item.listingId,
                          "approved",
                          decisionNotes[item.listingId] || "Approved for public marketplace."
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                    >
                      Approve Public
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reviewListingSubmission(
                          item.listingId,
                          item.status,
                          decisionNotes[item.listingId] || "Toggled Verified Property Badge after authority check.",
                          !item.verifiedPropertyBadge
                        )
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#9A6B32] text-[#9A6B32]"
                    >
                      <Award className="w-3.5 h-3.5" />
                      {item.verifiedPropertyBadge ? "Revoke Badge" : "Grant Verified Badge"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reviewListingSubmission(
                          item.listingId,
                          "rejected",
                          decisionNotes[item.listingId] || "Rejected during compliance review."
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 text-rose-700"
                    >
                      Reject
                    </button>
                    {item.duplicateFlagIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          resolveOwnershipClaim(
                            item.listingId,
                            "verified_owner_assigned",
                            decisionNotes[item.listingId] || "Verified owner claim resolved after documentation review."
                          )
                        }
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-[#111318]"
                      >
                        Resolve Owner Claim
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Tickets Assignment & Operational Admin Staff Management (ADM-01, ADM-02) */}
      {tab === "staff" && (
        <div className="space-y-8">
          {/* Operational Admin Staff Cap & Controls */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-base font-bold text-[#111318] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#9A6B32]" />
                Operational Admin Roster ({activeOpsAdmins.length} / {systemConfig.operationalAdminCap} Active Cap)
              </h4>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemConfig.roundRobinEnabled}
                  onChange={(e) =>
                    updateSystemConfig(
                      { roundRobinEnabled: e.target.checked },
                      `Round-robin enquiry routing set to ${e.target.checked}`
                    )
                  }
                  className="accent-[#111318]"
                />
                Enable Automatic Round-Robin Assignment
              </label>
            </div>

            <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
              {staffAccounts.map((st) => (
                <div
                  key={st.uid}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#111318]">
                      {st.displayName}{" "}
                      <span className="font-normal text-stone-500">({st.email})</span>
                    </p>
                    <p className="text-stone-500 mt-0.5 capitalize">
                      Role: {st.role.replace(/_/g, " ")} · MFA: {st.mfaEnforced ? "Enforced" : "Pending"} · Status:{" "}
                      <strong className={st.status === "active" ? "text-emerald-700" : "text-rose-700"}>
                        {st.status}
                      </strong>
                    </p>
                  </div>
                  {st.role === "operational_admin" && (
                    <div className="flex items-center gap-2">
                      {st.status === "active" ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateStaffStatus(st.uid, "suspended", "Suspended by Super Admin.")
                          }
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-300 text-rose-700"
                        >
                          Suspend Immediately
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            updateStaffStatus(st.uid, "active", "Reactivated by Super Admin.")
                          }
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newAdminName.trim() || !newAdminEmail.trim()) return;
                const res = addOperationalAdmin(newAdminName.trim(), newAdminEmail.trim());
                if (res.ok) {
                  setNewAdminName("");
                  setNewAdminEmail("");
                }
              }}
              className="flex flex-wrap items-center gap-3 pt-2"
            >
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="New Operational Admin Name"
                className="flex-1 min-w-[180px] px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="staff@shortletconnect.ng"
                className="flex-1 min-w-[200px] px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white"
              >
                Add Operational Admin
              </button>
            </form>
          </div>

          {/* Ticket Reassignment Table */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <h4 className="font-display text-base font-bold text-[#111318]">
              WhatsApp Enquiry Ticket Assignment ({tickets.length})
            </h4>
            <div className="divide-y divide-stone-100">
              {tickets.map((t) => (
                <div
                  key={t.ticketRef}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-mono font-semibold text-[#111318]">
                      {t.ticketRef} · {t.customerName} ({t.listingId ?? "Unlinked"})
                    </p>
                    <p className="text-stone-600 line-clamp-1 mt-0.5">{t.lastMessageText}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={t.assignedAdminUid ?? ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          assignTicket(
                            t.ticketRef,
                            e.target.value,
                            "Manual Super Admin ticket routing."
                          );
                        }
                      }}
                      className="px-2.5 py-1.5 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                    >
                      <option value="">Unassigned</option>
                      {activeOpsAdmins.map((a) => (
                        <option key={a.uid} value={a.uid}>
                          {a.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Separated Financial Ledger, Reconciliation & Caution Refunds (FIN-01..04) */}
      {tab === "finance" && (
        <div className="space-y-6">
          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-xs text-stone-500">Collected Ledger Entries</p>
              <p className="font-mono text-xl font-bold text-[#111318] mt-1 tabular-nums">
                {formatNairaFromKobo(ledgerSummary.collected)}
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-xs text-stone-500">Payable (Principal / Staff)</p>
              <p className="font-mono text-xl font-bold text-[#9A6B32] mt-1 tabular-nums">
                {formatNairaFromKobo(ledgerSummary.payable + ledgerSummary.pending)}
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-xs text-stone-500">Caution Liability (Non-Revenue)</p>
              <p className="font-mono text-xl font-bold text-[#111318] mt-1 tabular-nums">
                {formatNairaFromKobo(ledgerSummary.cautionLiability)}
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-xs text-stone-500">Internal ₦10k/₦10k/₦10k Split</p>
              <p className="font-mono text-xs text-[#111318] mt-1.5 tabular-nums space-y-0.5">
                <span className="block">Admin: {formatNairaFromKobo(ledgerSummary.adminAllocation)}</span>
                <span className="block">Founder: {formatNairaFromKobo(ledgerSummary.founderAllocation)}</span>
                <span className="block">Ads/Ops: {formatNairaFromKobo(ledgerSummary.adsOpsAllocation)}</span>
              </p>
            </div>
          </div>

          {/* Paystack Reconciliation & No-Escrow Governance Note */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#111318] flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#9A6B32]" />
                Daily Paystack Reconciliation & Manual Settlement Governance
              </p>
              <p className="text-xs text-stone-600">
                Ledger allocations are recorded separately for bookkeeping. V1 does not assume regulated escrow or automatic bank mass-payouts — payouts are executed manually and audited below.
              </p>
              {reconciliationResult && (
                <p className="text-xs font-mono text-emerald-800 pt-1">{reconciliationResult}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleRunReconciliation()}
              disabled={reconciling}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? "animate-spin" : ""}`} />
              Run Daily Reconciliation
            </button>
          </div>

          {/* Caution Deposit Refund Approvals (FIN-03) */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <h4 className="font-display text-base font-bold text-[#111318]">
              Caution Deposit Refund Approvals
            </h4>
            {bookings.filter((b) => b.cautionFeeKobo > 0).map((b) => (
              <div
                key={b.bookingRef}
                className="p-3.5 rounded-lg bg-[#F8F7F4] border border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-mono font-semibold text-[#111318]">
                    {b.bookingRef} · {b.customerName} · Caution: {formatNairaFromKobo(b.cautionFeeKobo)}
                    {b.cautionDeductionKobo ? ` (Deduction: ${formatNairaFromKobo(b.cautionDeductionKobo)})` : ""}
                  </p>
                  <p className="text-stone-600 mt-0.5 capitalize">
                    Status: {b.cautionDepositStatus.replace(/_/g, " ")}
                    {b.cautionRefundRef ? ` · Ref: ${b.cautionRefundRef}` : ""}
                  </p>
                </div>
                {b.cautionDepositStatus !== "refunded" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Bank/Paystack Refund Ref"
                      value={refundRefs[b.bookingRef] ?? `RFD-${b.bookingRef}`}
                      onChange={(e) =>
                        setRefundRefs((prev) => ({ ...prev, [b.bookingRef]: e.target.value }))
                      }
                      className="px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        approveCautionRefund(
                          b.bookingRef,
                          refundRefs[b.bookingRef] || `RFD-${b.bookingRef}`,
                          "Super Admin approved caution deposit refund release."
                        )
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#9A6B32] text-white"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Refund
                    </button>
                  </div>
                ) : (
                  <span className="font-semibold text-emerald-700">Refunded & Audited</span>
                )}
              </div>
            ))}
          </div>

          {/* Full Separated Ledger Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Entry ID</th>
                  <th className="py-3 px-4 font-semibold">Booking</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Amount (NGN)</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.entryId}>
                    <td className="py-3 px-4 font-mono text-stone-600">{entry.entryId}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#111318]">
                      {entry.bookingRef}
                    </td>
                    <td className="py-3 px-4 capitalize text-stone-700">
                      {entry.category.replace(/_/g, " ")}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#111318] tabular-nums">
                      {formatNairaFromKobo(entry.amountKobo)}
                    </td>
                    <td className="py-3 px-4 capitalize font-semibold text-[#9A6B32]">
                      {entry.settlementStatus}
                    </td>
                    <td className="py-3 px-4">
                      {entry.settlementStatus !== "paid" && (
                        <button
                          type="button"
                          onClick={() =>
                            markLedgerSettled(
                              entry.entryId,
                              "paid" as LedgerEntry["settlementStatus"],
                              "Manual bank settlement verified by Super Admin."
                            )
                          }
                          className="text-xs font-semibold text-[#111318] underline hover:text-[#9A6B32]"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Apartment Feature Catalogue & Global System Config (WEB-04) */}
      {tab === "catalogue" && (
        <div className="space-y-8">
          {/* System Config Editor */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
            <h4 className="font-display text-base font-bold text-[#111318] flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#9A6B32]" />
              Global Platform Configuration (Super Admin Only)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Operational Admin Cap
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={adminCapInput}
                  onChange={(e) => setAdminCapInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Car Partial-Day Cutoff (Hours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={23}
                  value={carCutoffInput}
                  onChange={(e) => setCarCutoffInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  ID Doc Retention (Days)
                </label>
                <input
                  type="number"
                  min={30}
                  value={retentionInput}
                  onChange={(e) => setRetentionInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Official WhatsApp Number
                </label>
                <input
                  type="text"
                  value={whatsappInput}
                  onChange={(e) => setWhatsappInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemConfig.videoWatermarkEnabled}
                  onChange={(e) =>
                    updateSystemConfig(
                      { videoWatermarkEnabled: e.target.checked },
                      `Toggled VIDEO_WATERMARK_ENABLED to ${e.target.checked}`
                    )
                  }
                  className="accent-[#111318]"
                />
                Enable Async Video Watermarking (VIDEO_WATERMARK_ENABLED)
              </label>

              <button
                type="button"
                onClick={() =>
                  updateSystemConfig(
                    {
                      operationalAdminCap: Math.max(1, Number(adminCapInput) || 10),
                      carPartialDayCutoffHours: Math.max(1, Number(carCutoffInput) || 12),
                      identityDocRetentionDays: Math.max(30, Number(retentionInput) || 365),
                      officialWhatsAppNumber: whatsappInput.trim() || systemConfig.officialWhatsAppNumber,
                    },
                    "Super Admin updated global platform parameters."
                  )
                }
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white"
              >
                Save Global Configuration
              </button>
            </div>
          </div>

          {/* Configurable Apartment Feature & Synonym Catalogue (WEB-04) */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
            <h4 className="font-display text-base font-bold text-[#111318]">
              Apartment Feature & Synonym Catalogue ({featureCatalogue.length})
            </h4>
            <p className="text-xs text-stone-600">
              Add, rename, or deactivate searchable apartment filters and keyword synonyms without code changes.
            </p>

            <form onSubmit={handleAddFeature} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                value={featId}
                onChange={(e) => setFeatId(e.target.value)}
                placeholder="Feature ID (e.g. rooftop_lounge)"
                required
                className="px-3 py-2 text-xs font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
              <input
                type="text"
                value={featLabel}
                onChange={(e) => setFeatLabel(e.target.value)}
                placeholder="Display Label (e.g. Rooftop Lounge)"
                required
                className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
              <select
                value={featGroup}
                onChange={(e) => setFeatGroup(e.target.value as FeatureGroup)}
                className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
              >
                <option value="entertainment">Entertainment</option>
                <option value="views">Views & Outdoors</option>
                <option value="arrangement">Arrangement</option>
                <option value="service">Service & Power</option>
                <option value="booking_payment">Booking & Payment</option>
                <option value="house_rules">House Rules</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white"
              >
                Add / Update Feature
              </button>
              <input
                type="text"
                value={featSynonyms}
                onChange={(e) => setFeatSynonyms(e.target.value)}
                placeholder="Comma-separated synonyms (e.g. roof terrace, sky lounge, penthouse view)"
                className="sm:col-span-4 px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
              />
            </form>

            <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg max-h-80 overflow-y-auto">
              {featureCatalogue.map((f) => (
                <div
                  key={f.featureId}
                  className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[#111318]">{f.label}</span>{" "}
                    <span className="font-mono text-stone-500">({f.featureId})</span>
                    <span className="text-stone-400 mx-1.5">·</span>
                    <span className="text-stone-600">{f.synonyms.join(", ")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFeatureActive(f.featureId)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                      f.active
                        ? "border-emerald-300 text-emerald-800"
                        : "border-stone-300 text-stone-500"
                    }`}
                  >
                    {f.active ? "Active" : "Inactive"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Immutable Append-Only Audit Log (Invariant 5) */}
      {tab === "audit" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between">
            <h4 className="font-display text-base font-bold text-[#111318] flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#9A6B32]" />
              Immutable Governance Audit Trail (Read-Only)
            </h4>
            <span className="text-xs font-mono text-stone-500">Timezone: Africa/Lagos (WAT)</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp (WAT)</th>
                <th className="py-3 px-4 font-semibold">Actor</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Target</th>
                <th className="py-3 px-4 font-semibold">Reason & Change Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {auditLogs.map((log) => (
                <tr key={log.logId}>
                  <td className="py-3 px-4 font-mono text-stone-600 whitespace-nowrap tabular-nums">
                    {formatAfricaLagos(log.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-stone-700">
                    <span className="font-mono">{log.actorUid}</span>{" "}
                    <span className="text-stone-500">({log.actorRole})</span>
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-[#111318]">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 font-mono text-stone-600">
                    {log.targetType}: {log.targetId}
                  </td>
                  <td className="py-3 px-4 text-stone-700">
                    <p>{log.reason}</p>
                    {(log.beforeSummary || log.afterSummary) && (
                      <p className="text-[11px] font-mono text-stone-500 mt-0.5">
                        {log.beforeSummary ? `${log.beforeSummary} → ` : ""}
                        {log.afterSummary}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
