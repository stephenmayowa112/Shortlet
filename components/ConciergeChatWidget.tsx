"use client";

import React, { useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Loader2, MessageSquareText, Send, Sparkles, X, Zap } from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { formatNairaFromKobo } from "@/lib/domain/pricing";

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

const STARTER_PROMPTS = [
  "Which Lekki apartments have a private pool and PS5?",
  "How much is the service charge for a 5-hour yacht charter?",
  "Can I request a live video inspection before paying?",
];

export function ConciergeChatWidget() {
  const { publicListings } = useMarketplace();
  const [open, setOpen] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      text: "Welcome to **Shortlet Connect Concierge**. Ask me about approved apartments, chauffeur-driven cars, or lagoon yachts in Lagos, transparent service charges, or how to schedule a live video inspection.",
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const catalogSummary = useMemo(() => {
    return publicListings
      .map(
        (l) =>
          `- [${l.listingId}] ${l.title} (${l.category}, ${l.area}, ${formatNairaFromKobo(l.rateKobo)} ${l.rentalBasis.replace(/_/g, " ")}, caution ${formatNairaFromKobo(l.cautionFeeKobo)}, features: ${l.featureIds.join(", ") || "standard"})`
      )
      .join("\n");
  }, [publicListings]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const nextHistory: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextHistory);
    setInput("");
    setErrorMsg(null);
    setLoading(true);

    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 30);

    try {
      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory,
          fastMode,
          catalogSummary,
        }),
      });
      const json = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !json.reply) {
        throw new Error(json.error ?? "Unable to reach Shortlet Connect Concierge.");
      }
      setMessages((prev) => [...prev, { role: "model", text: json.reply! }]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Concierge request failed. Please try again."
      );
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 40);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Shortlet Connect Concierge"
          className="fixed bottom-[4.5rem] right-4 md:bottom-5 md:right-5 z-40 inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#111318] text-white text-xs font-semibold shadow-lg hover:bg-stone-800 transition-colors"
        >
          <MessageSquareText className="w-4 h-4 text-[#C69C6D]" />
          Concierge
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 sm:pointer-events-none">
          {/* Mobile backdrop */}
          <div
            onClick={() => setOpen(false)}
            className="sm:hidden fixed inset-0 bg-[#111318]/45 backdrop-blur-[2px]"
          />
          <aside
            aria-label="Shortlet Connect Concierge Chat"
            className="pointer-events-auto fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 w-full sm:w-[400px] h-[85dvh] sm:h-[540px] sm:max-h-[82vh] bg-white border-t sm:border border-stone-200 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden pb-safe"
          >
            {/* Mobile Sheet Handle */}
            <div className="sm:hidden bg-[#111318] pt-2 pb-0.5 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-stone-600" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 bg-[#111318] text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-bold flex items-center gap-1.5 truncate">
                  <Sparkles className="w-4 h-4 text-[#C69C6D] shrink-0" />
                  Shortlet Connect Concierge
                </p>
                <p className="text-[11px] text-stone-300 truncate">
                  Lagos stays, cars, boats &amp; transparent NGN quotes
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setFastMode((v) => !v)}
                  title="Toggle fast lightweight replies"
                  className={`inline-flex items-center gap-1 px-2.5 min-h-[36px] text-[11px] font-semibold rounded border transition-colors ${
                    fastMode
                      ? "border-[#C69C6D] text-[#C69C6D]"
                      : "border-stone-600 text-stone-300 hover:border-stone-400"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  {fastMode ? "Fast" : "Standard"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close concierge"
                  className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-stone-300 hover:text-white hover:bg-stone-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F7F4]">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm sm:text-xs leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto bg-[#111318] text-white"
                      : "mr-auto bg-white border border-stone-200 text-[#111318]"
                  }`}
                >
                  {m.role === "model" ? (
                    <div className="prose prose-sm sm:prose-xs max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                      <Markdown>{m.text}</Markdown>
                    </div>
                  ) : (
                    <p>{m.text}</p>
                  )}
                </div>
              ))}

              {messages.length === 1 && (
                <div className="pt-1 space-y-2">
                  <p className="text-xs sm:text-[11px] font-medium text-stone-500">Suggested questions:</p>
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="block w-full text-left px-3.5 py-2.5 min-h-[44px] text-xs bg-white border border-stone-200 rounded-lg text-stone-700 hover:border-[#9A6B32] transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="inline-flex items-center gap-2 px-3 py-2 text-xs text-stone-600 bg-white border border-stone-200 rounded-xl">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9A6B32]" />
                  Thinking...
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
              className="p-3 bg-white border-t border-stone-200 flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about pools, pricing, cars, boats..."
                className="flex-1 h-11 px-3 text-base sm:text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9A6B32]"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="w-11 h-11 inline-flex items-center justify-center rounded-lg bg-[#111318] text-white hover:bg-stone-800 disabled:opacity-40 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
