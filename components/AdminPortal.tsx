"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Link2,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Star,
  Video,
} from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { formatAfricaLagos, formatNairaFromKobo } from "@/lib/domain/pricing";
import { toOperationalAdminListing } from "@/lib/domain/privacy";
import { filterPublicListings } from "@/lib/domain/search";
import type { BookingStatus, SupportIssue } from "@/lib/types";

type AdminTab =
  | "enquiries"
  | "bookings"
  | "inspections"
  | "search"
  | "reviews"
  | "support"
  | "finance";

export function AdminPortal() {
  const {
    staffAccounts,
    activeOpsAdminUid,
    setActiveOpsAdminUid,
    tickets,
    bookings,
    inspections,
    privateListings,
    publicListings,
    featureCatalogue,
    reviews,
    supportIssues,
    recordInboundEnquiry,
    linkTicketToListing,
    replyToTicket,
    updateBookingState,
    proposeCautionAction,
    updateInspection,
    moderateReview,
    createSupportIssue,
    updateSupportIssue,
    notify,
  } = useMarketplace();

  const [tab, setTab] = useState<AdminTab>("enquiries");

  const opsAdmins = useMemo(
    () => staffAccounts.filter((s) => s.role === "operational_admin"),
    [staffAccounts]
  );

  const activeAdmin = useMemo(
    () => opsAdmins.find((s) => s.uid === activeOpsAdminUid) ?? opsAdmins[0],
    [opsAdmins, activeOpsAdminUid]
  );

  const isSuspended = activeAdmin?.status !== "active";

  // Enquiries state
  const myTickets = useMemo(
    () => tickets.filter((t) => t.assignedAdminUid === activeAdmin?.uid || !t.assignedAdminUid),
    [tickets, activeAdmin?.uid]
  );
  const [selectedTicketRef, setSelectedTicketRef] = useState<string>(myTickets[0]?.ticketRef ?? "");
  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [simCustomerName, setSimCustomerName] = useState("Kemi Adeyemi");
  const [simCustomerPhone, setSimCustomerPhone] = useState("+2348094455661");
  const [simMessage, setSimMessage] = useState(
    "Hello Shortlet Connect, I edited this text — is the 3-bedroom pool villa in Lekki free this weekend?"
  );
  const [simProviderMsgId, setSimProviderMsgId] = useState("wamid.HBgLMjM0ODA5NDQ1NQ==");

  // Bookings state
  const myBookings = useMemo(
    () => bookings.filter((b) => b.assignedAdminUid === activeAdmin?.uid),
    [bookings, activeAdmin?.uid]
  );
  const [cautionNotes, setCautionNotes] = useState<Record<string, string>>({});
  const [cautionDeductionNaira, setCautionDeductionNaira] = useState<Record<string, string>>({});

  // Inspections state
  const [meetingUrls, setMeetingUrls] = useState<Record<string, string>>({});
  const [outcomeNotes, setOutcomeNotes] = useState<Record<string, string>>({});

  // Structured Apartment Search for Operational Admins (uses toOperationalAdminListing -> NO legal owner private numbers)
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchArea, setSearchArea] = useState("");
  const [searchFeatures, setSearchFeatures] = useState<string[]>([]);

  const opsListings = useMemo(
    () => privateListings.map((rec) => toOperationalAdminListing(rec)),
    [privateListings]
  );

  const apartmentSearchResults = useMemo(() => {
    return filterPublicListings(
      publicListings,
      {
        category: "apartment",
        keyword: searchKeyword,
        location: searchArea,
        selectedFeatureIds: searchFeatures,
      },
      featureCatalogue
    );
  }, [publicListings, featureCatalogue, searchKeyword, searchArea, searchFeatures]);

  // Reviews moderation state
  const [modReasons, setModReasons] = useState<Record<string, string>>({});

  // Support issue form state
  const [issueBookingRef, setIssueBookingRef] = useState(bookings[0]?.bookingRef ?? "");
  const [issueSeverity, setIssueSeverity] = useState<SupportIssue["severity"]>("medium");
  const [issueSummary, setIssueSummary] = useState("");
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});

  const selectedTicket =
    myTickets.find((t) => t.ticketRef === selectedTicketRef) ?? myTickets[0] ?? null;

  const handleSimulateInbound = (e: React.FormEvent) => {
    e.preventDefault();
    const res = recordInboundEnquiry({
      customerName: simCustomerName,
      customerContact: simCustomerPhone,
      text: simMessage,
      providerMessageId: simProviderMsgId.trim() || `wamid.${Date.now()}`,
    });
    if (res.duplicate) {
      notify(`Duplicate WhatsApp webhook suppressed (providerMessageId: ${simProviderMsgId}).`);
    } else if (res.ticketRef) {
      setSelectedTicketRef(res.ticketRef);
      setSimProviderMsgId(`wamid.${Date.now().toString(36)}`);
    }
  };

  // Permitted Finance summary (operational admin sees principal + service charge, NOT global config edits)
  const financeTotals = useMemo(() => {
    return myBookings.reduce(
      (acc, b) => {
        if (b.paymentVerified) {
          acc.principal += b.rentalPrincipalKobo;
          acc.serviceCharge += b.serviceChargeKobo;
          acc.caution += b.cautionFeeKobo;
        }
        return acc;
      },
      { principal: 0, serviceCharge: 0, caution: 0 }
    );
  }, [myBookings]);

  return (
    <div className="space-y-8">
      {/* Operational Admin Header & Suspension Guard */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Operational Admin Workspace
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#111318]">
            <span className="font-display text-lg font-bold">
              {activeAdmin?.displayName ?? "Operational Admin"}
            </span>
            <span className="text-stone-400">·</span>
            <span className="text-stone-600">{activeAdmin?.email}</span>
            <span className="text-stone-400">·</span>
            <span className={isSuspended ? "text-rose-700 font-semibold" : "text-emerald-700 font-semibold"}>
              {activeAdmin?.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Privacy boundary active: Legal owner private contacts and global financial rules remain restricted to the Super Admin.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <label htmlFor="ops-admin-select" className="text-xs font-medium text-stone-600 shrink-0">
            Active Admin:
          </label>
          <select
            id="ops-admin-select"
            value={activeAdmin?.uid ?? ""}
            onChange={(e) => setActiveOpsAdminUid(e.target.value)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-medium bg-[#F8F7F4] border border-stone-300 rounded-lg"
          >
            {opsAdmins.map((admin) => (
              <option key={admin.uid} value={admin.uid}>
                {admin.displayName} ({admin.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isSuspended ? (
        <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-rose-700 shrink-0" />
          <div>
            <h3 className="font-display font-bold text-rose-900">
              Admin Account Suspended
            </h3>
            <p className="text-sm text-rose-800 mt-1">
              Operational access for {activeAdmin?.displayName} has been suspended by the Super Admin. All assigned enquiry, booking, and moderation actions are immediately blocked.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Tab Bar */}
          <div className="flex items-center gap-2 border-b border-stone-200 pb-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            {(
              [
                { id: "enquiries", label: `My Enquiries (${myTickets.length})` },
                { id: "bookings", label: `My Bookings (${myBookings.length})` },
                { id: "inspections", label: `Inspections (${inspections.length})` },
                { id: "search", label: "Property Search" },
                { id: "reviews", label: `Reviews (${reviews.length})` },
                { id: "support", label: `Support Issues (${supportIssues.length})` },
                { id: "finance", label: "Permitted Finance" },
              ] as Array<{ id: AdminTab; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3.5 min-h-[44px] sm:min-h-[38px] text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  tab === item.id
                    ? "bg-[#111318] text-white"
                    : "text-stone-600 hover:bg-stone-200/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* TAB 1: Official WhatsApp Shared Inbox (MSG-01..04) */}
          {tab === "enquiries" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Ticket List */}
                <div className="lg:col-span-5 space-y-2">
                  {myTickets.map((t) => (
                    <button
                      key={t.ticketRef}
                      type="button"
                      onClick={() => setSelectedTicketRef(t.ticketRef)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        selectedTicket?.ticketRef === t.ticketRef
                          ? "bg-white border-[#111318]"
                          : "bg-white/70 border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-[#111318]">{t.ticketRef}</span>
                        <span className="capitalize text-stone-600">{t.status.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#111318] mt-1">{t.customerName}</p>
                      <p className="text-xs text-stone-600 line-clamp-2 mt-0.5">{t.lastMessageText}</p>
                      <p className="text-[11px] font-mono text-stone-500 mt-2">
                        {t.listingId ? `Linked: ${t.listingId}` : "Needs Manual Listing Lookup"}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Conversation Workspace */}
                <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                  {selectedTicket ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-3">
                        <div>
                          <p className="text-xs font-mono text-stone-500">
                            {selectedTicket.ticketRef} · {selectedTicket.customerContact}
                          </p>
                          <h4 className="font-display font-bold text-[#111318]">
                            {selectedTicket.customerName}
                          </h4>
                        </div>
                        {/* Manual Listing Lookup (MSG-03 fallback when guest edited prefilled message) */}
                        <div className="flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-stone-500" />
                          <select
                            aria-label="Manual listing lookup"
                            value={selectedTicket.listingId ?? ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                linkTicketToListing(selectedTicket.ticketRef, e.target.value);
                              }
                            }}
                            className="px-2.5 py-1.5 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                          >
                            <option value="">Attach Listing (Manual Lookup)...</option>
                            {publicListings.map((l) => (
                              <option key={l.listingId} value={l.listingId}>
                                {l.listingId} — {l.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {selectedTicket.messages.map((m) => (
                          <div
                            key={m.messageId}
                            className={`p-3 rounded-lg text-xs ${
                              m.sender === "admin"
                                ? "bg-[#111318] text-white ml-8"
                                : "bg-[#F8F7F4] text-[#111318] mr-8 border border-stone-200"
                            }`}
                          >
                            <div className="flex items-center justify-between opacity-75 mb-1">
                              <span className="font-semibold">{m.senderName}</span>
                              <span className="font-mono text-[10px]">
                                {formatAfricaLagos(m.atIso)}
                              </span>
                            </div>
                            <p>{m.body}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2 border-t border-stone-200 pt-3">
                        <p className="text-[11px] text-stone-500">
                          Internal Note: {selectedTicket.internalNotes}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Send official WhatsApp reply..."
                            className="flex-1 px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!replyText.trim() && !internalNote.trim()) return;
                              replyToTicket(
                                selectedTicket.ticketRef,
                                replyText,
                                internalNote.trim() || undefined
                              );
                              setReplyText("");
                              setInternalNote("");
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800"
                          >
                            <Send className="w-3.5 h-3.5" /> Reply
                          </button>
                        </div>
                        <input
                          type="text"
                          value={internalNote}
                          onChange={(e) => setInternalNote(e.target.value)}
                          placeholder="Optional internal note update (never visible to guest)"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-stone-500">Select an enquiry ticket to inspect.</p>
                  )}
                </div>
              </div>

              {/* Sandbox Inbound WhatsApp Webhook Tester (MSG-04 Deduplication) */}
              <form
                onSubmit={handleSimulateInbound}
                className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
              >
                <p className="text-xs font-semibold text-[#111318] flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#9A6B32]" />
                  Simulate Inbound Official WhatsApp Webhook (Idempotent Provider Message ID Check)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={simCustomerName}
                    onChange={(e) => setSimCustomerName(e.target.value)}
                    placeholder="Customer Name"
                    className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={simCustomerPhone}
                    onChange={(e) => setSimCustomerPhone(e.target.value)}
                    placeholder="Customer Phone"
                    className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={simProviderMsgId}
                    onChange={(e) => setSimProviderMsgId(e.target.value)}
                    placeholder="Provider Message ID (reuse to test dedup)"
                    className="px-3 py-2 text-xs font-mono bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={simMessage}
                    onChange={(e) => setSimMessage(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white hover:bg-stone-800 whitespace-nowrap"
                  >
                    Ingest Webhook Event
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Assigned Bookings & Caution Proposals (BOOK-02, FIN-03) */}
          {tab === "bookings" && (
            <div className="space-y-4">
              {myBookings.map((b) => {
                const nextOptions: BookingStatus[] =
                  b.status === "confirmed"
                    ? ["checked_in", "cancelled"]
                    : b.status === "checked_in"
                    ? ["checked_out"]
                    : b.status === "checked_out"
                    ? ["completed", "refunded_disputed"]
                    : b.status === "awaiting_payment"
                    ? ["confirmed", "cancelled"]
                    : [];

                return (
                  <div
                    key={b.bookingRef}
                    className="bg-white border border-stone-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono text-stone-500">
                          {b.bookingRef} · {b.listingId} · Payment Verified:{" "}
                          {b.paymentVerified ? "Yes (Paystack)" : "No"}
                        </p>
                        <h4 className="font-display font-bold text-[#111318] mt-0.5">
                          {b.listingTitle}
                        </h4>
                        <p className="text-xs text-stone-600 mt-0.5">
                          Guest: {b.customerName} ({b.customerContact}) ·{" "}
                          {formatAfricaLagos(b.startIso)} → {formatAfricaLagos(b.endIso)}
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-sm font-bold text-[#111318]">
                          {formatNairaFromKobo(b.customerTotalKobo)}
                        </p>
                        <p className="text-xs capitalize text-[#9A6B32] font-semibold">
                          {b.status.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>

                    {nextOptions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
                        <span className="text-xs text-stone-500 mr-1">Transition:</span>
                        {nextOptions.map((targetStatus) => (
                          <button
                            key={targetStatus}
                            type="button"
                            onClick={() =>
                              updateBookingState(
                                b.bookingRef,
                                targetStatus,
                                `Updated by ${activeAdmin?.displayName}`
                              )
                            }
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-[#111318] hover:bg-stone-100 capitalize"
                          >
                            Mark {targetStatus.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Caution Deposit Release/Deduction Proposal (FIN-03 — Super Admin approves final refund) */}
                    {b.cautionFeeKobo > 0 && (
                      <div className="p-3.5 rounded-lg bg-[#F8F7F4] border border-stone-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#111318]">
                            Caution Deposit ({formatNairaFromKobo(b.cautionFeeKobo)})
                          </span>
                          <span className="capitalize font-mono text-stone-700">
                            Status: {b.cautionDepositStatus.replace(/_/g, " ")}
                          </span>
                        </div>
                        {b.cautionDepositStatus === "collected" && (
                          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              placeholder="Deduction (₦, 0 for full release)"
                              value={cautionDeductionNaira[b.bookingRef] ?? "0"}
                              onChange={(e) =>
                                setCautionDeductionNaira((prev) => ({
                                  ...prev,
                                  [b.bookingRef]: e.target.value,
                                }))
                              }
                              className="w-full sm:w-48 min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-300 rounded-lg"
                            />
                            <input
                              type="text"
                              placeholder="Checkout inspection notes"
                              value={cautionNotes[b.bookingRef] ?? ""}
                              onChange={(e) =>
                                setCautionNotes((prev) => ({
                                  ...prev,
                                  [b.bookingRef]: e.target.value,
                                }))
                              }
                              className="w-full sm:flex-1 min-h-[40px] px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const dedKobo = Math.max(
                                  0,
                                  Math.round(Number(cautionDeductionNaira[b.bookingRef] || "0") * 100)
                                );
                                proposeCautionAction(
                                  b.bookingRef,
                                  dedKobo > 0 ? "deduction_proposed" : "release_proposed",
                                  dedKobo,
                                  cautionNotes[b.bookingRef] || "Post-checkout inspection completed."
                                );
                              }}
                              className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                            >
                              Submit Proposal to Super Admin
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: Live Video Inspections (INS-01 — external commercial meeting links only) */}
          {tab === "inspections" && (
            <div className="space-y-4">
              <p className="text-xs text-stone-600">
                Schedule and record live video inspections hosted via approved commercial video links (Google Meet / Zoom). Built-in video calling is excluded from Version 1.
              </p>
              {inspections.map((ins) => (
                <div
                  key={ins.inspectionRef}
                  className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono text-stone-500">
                        {ins.inspectionRef} · {ins.listingId}
                      </p>
                      <h4 className="font-display font-bold text-[#111318]">{ins.listingTitle}</h4>
                      <p className="text-xs text-stone-600 mt-0.5">
                        Guest: {ins.customerName} ({ins.customerContact}) · Requested:{" "}
                        {formatAfricaLagos(ins.requestedSlotIso)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold capitalize text-[#9A6B32]">
                      {ins.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <p className="text-xs text-stone-600">
                    Participants: {ins.participants.join(" · ")}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="url"
                      placeholder="Paste Google Meet / Zoom link"
                      value={meetingUrls[ins.inspectionRef] ?? ins.meetingUrl ?? ""}
                      onChange={(e) =>
                        setMeetingUrls((prev) => ({ ...prev, [ins.inspectionRef]: e.target.value }))
                      }
                      className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Inspection outcome notes"
                      value={outcomeNotes[ins.inspectionRef] ?? ins.outcomeNotes ?? ""}
                      onChange={(e) =>
                        setOutcomeNotes((prev) => ({
                          ...prev,
                          [ins.inspectionRef]: e.target.value,
                        }))
                      }
                      className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateInspection(ins.inspectionRef, {
                          status: "scheduled",
                          scheduledAtIso: ins.requestedSlotIso,
                          meetingUrl: meetingUrls[ins.inspectionRef] || ins.meetingUrl,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                    >
                      <Video className="w-3.5 h-3.5" /> Save Link & Schedule
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateInspection(ins.inspectionRef, {
                          status: "completed",
                          outcomeNotes: outcomeNotes[ins.inspectionRef] || "Verified live on call.",
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-[#111318]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateInspection(ins.inspectionRef, {
                          status: "no_show",
                          outcomeNotes: outcomeNotes[ins.inspectionRef] || "Participant did not join.",
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-stone-600"
                    >
                      <Calendar className="w-3.5 h-3.5" /> Mark No-Show
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: Operational Admin Structured Property Search (NO legal owner private numbers) */}
          {tab === "search" && (
            <div className="space-y-4">
              <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111318]">
                  <Search className="w-4 h-4 text-[#9A6B32]" />
                  Admin Structured Apartment Search (Same Feature & Synonym Filter Model)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Try 'private swimming pool', 'ps5', 'smoking allowed'..."
                    className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={searchArea}
                    onChange={(e) => setSearchArea(e.target.value)}
                    placeholder="Filter area (e.g. Lekki, Victoria Island)"
                    className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {featureCatalogue
                    .filter((f) => f.active)
                    .slice(0, 10)
                    .map((f) => {
                      const active = searchFeatures.includes(f.featureId);
                      return (
                        <button
                          key={f.featureId}
                          type="button"
                          onClick={() =>
                            setSearchFeatures((prev) =>
                              prev.includes(f.featureId)
                                ? prev.filter((id) => id !== f.featureId)
                                : [...prev, f.featureId]
                            )
                          }
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            active
                              ? "bg-[#111318] text-white border-[#111318]"
                              : "bg-[#F8F7F4] text-stone-700 border-stone-200"
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {apartmentSearchResults.map((apt) => {
                  const opsView = opsListings.find((o) => o.listingId === apt.listingId);
                  return (
                    <div
                      key={apt.listingId}
                      className="bg-white border border-stone-200 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-mono text-stone-500">
                            {apt.listingId} · {apt.area}
                          </p>
                          <h4 className="font-display font-bold text-[#111318]">{apt.title}</h4>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#111318] tabular-nums">
                          {formatNairaFromKobo(apt.rateKobo)}/night
                        </span>
                      </div>
                      <p className="text-xs text-stone-600">
                        Originating Partner: {apt.originatorDisplayName} · Legal Owner Private Number:{" "}
                        <span className="font-mono text-stone-500">Restricted (Super Admin Only)</span>
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Exact building ref: {opsView?.exactBuildingNumber ?? "Not disclosed"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: Apartment Review Moderation (REV-02) */}
          {tab === "reviews" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-stone-200 text-xs text-stone-700 flex items-start gap-2.5">
                <Star className="w-4 h-4 text-[#9A6B32] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[#111318]">
                    Review Moderation Policy (Apartments Only in V1)
                  </p>
                  <p className="mt-0.5">
                    Genuine negative reviews MUST NOT be removed. Only hide or remove reviews for documented spam, abuse, fake content, or policy violation with a mandatory audit reason.
                  </p>
                </div>
              </div>

              {reviews.map((rev) => (
                <div
                  key={rev.reviewId}
                  className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-stone-500">
                      {rev.reviewId} · Listing {rev.listingId} · Booking {rev.bookingRef}
                    </span>
                    <span className="capitalize font-semibold text-[#9A6B32]">
                      {rev.moderationStatus}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#111318]">
                    {rev.authorDisplayName} · {rev.rating}/5 Stars
                  </p>
                  <p className="text-xs text-stone-700">{rev.comment}</p>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-2 border-t border-stone-100">
                    <input
                      type="text"
                      placeholder="Moderation reason (required to hide/remove)"
                      value={modReasons[rev.reviewId] ?? rev.moderationReason ?? ""}
                      onChange={(e) =>
                        setModReasons((prev) => ({ ...prev, [rev.reviewId]: e.target.value }))
                      }
                      className="w-full sm:flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          moderateReview(
                            rev.reviewId,
                            "approved",
                            modReasons[rev.reviewId] || "Verified completed stay — genuine guest feedback."
                          )
                        }
                        className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                      >
                        Approve & Publish
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          moderateReview(rev.reviewId, "hidden", modReasons[rev.reviewId] ?? "")
                        }
                        className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 text-stone-700"
                      >
                        Hide (Policy Violation)
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 6: Support Issues & Escalations (SUP-01) */}
          {tab === "support" && (
            <div className="space-y-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const b = bookings.find((x) => x.bookingRef === issueBookingRef);
                  if (!b || !issueSummary.trim()) return;
                  createSupportIssue({
                    bookingRef: b.bookingRef,
                    listingId: b.listingId,
                    severity: issueSeverity,
                    summary: issueSummary.trim(),
                  });
                  setIssueSummary("");
                }}
                className="bg-white border border-stone-200 rounded-xl p-5 space-y-3"
              >
                <p className="text-xs font-semibold text-[#111318] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#9A6B32]" />
                  Log New Booking Support Issue
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={issueBookingRef}
                    onChange={(e) => setIssueBookingRef(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  >
                    {bookings.map((b) => (
                      <option key={b.bookingRef} value={b.bookingRef}>
                        {b.bookingRef} — {b.listingTitle}
                      </option>
                    ))}
                  </select>
                  <select
                    value={issueSeverity}
                    onChange={(e) =>
                      setIssueSeverity(e.target.value as SupportIssue["severity"])
                    }
                    className="px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                  >
                    <option value="low">Low Severity</option>
                    <option value="medium">Medium Severity</option>
                    <option value="high">High Severity</option>
                    <option value="escalated_super_admin">Escalate to Super Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                  >
                    Record Issue
                  </button>
                </div>
                <input
                  type="text"
                  value={issueSummary}
                  onChange={(e) => setIssueSummary(e.target.value)}
                  placeholder="Describe the check-in, maintenance, or handover issue..."
                  required
                  className="w-full px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                />
              </form>

              <div className="space-y-3">
                {supportIssues.map((iss) => (
                  <div
                    key={iss.issueId}
                    className="bg-white border border-stone-200 rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-stone-500">
                        {iss.issueId} · {iss.bookingRef} · Severity: {iss.severity}
                      </span>
                      <span className="capitalize font-semibold text-[#9A6B32]">{iss.status}</span>
                    </div>
                    <p className="text-sm text-[#111318]">{iss.summary}</p>
                    {iss.resolutionNotes && (
                      <p className="text-xs text-emerald-800">Resolution: {iss.resolutionNotes}</p>
                    )}
                    {iss.status !== "closed" && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Mandatory resolution notes to close..."
                          value={resolutionDrafts[iss.issueId] ?? ""}
                          onChange={(e) =>
                            setResolutionDrafts((prev) => ({
                              ...prev,
                              [iss.issueId]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => updateSupportIssue(iss.issueId, "escalated")}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 text-amber-900"
                        >
                          Escalate to Super Admin
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSupportIssue(
                              iss.issueId,
                              "closed",
                              resolutionDrafts[iss.issueId]
                            )
                          }
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#111318] text-white"
                        >
                          Close with Notes
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: Permitted Operational Finance View */}
          {tab === "finance" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <p className="text-xs text-stone-500">Assigned Rental Principal (Verified)</p>
                  <p className="font-mono text-2xl font-bold text-[#111318] mt-1 tabular-nums">
                    {formatNairaFromKobo(financeTotals.principal)}
                  </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <p className="text-xs text-stone-500">Assigned Gross Service Charges</p>
                  <p className="font-mono text-2xl font-bold text-[#111318] mt-1 tabular-nums">
                    {formatNairaFromKobo(financeTotals.serviceCharge)}
                  </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <p className="text-xs text-stone-500">Held Caution Liabilities</p>
                  <p className="font-mono text-2xl font-bold text-[#111318] mt-1 tabular-nums">
                    {formatNairaFromKobo(financeTotals.caution)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-stone-500">
                Global financial configuration, Paystack reconciliation, and final caution deposit refund releases require Super Admin authorization.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
