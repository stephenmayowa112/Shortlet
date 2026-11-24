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
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111318] text-white text-xs font-semibold shadow-lg hover:bg-stone-800 transition-colors"
        >
          <MessageSquareText className="w-4 h-4 text-[#C69C6D]" />
          Concierge
        </button>
      )}

      {open && (
        <aside
          aria-label="Shortlet Connect Concierge Chat"
          className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-md h-[540px] max-h-[82vh] bg-white border border-stone-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-[#111318] text-white flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-sm font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#C69C6D]" />
                Shortlet Connect Concierge
              </p>
              <p className="text-[11px] text-stone-300">
                Lagos stays, cars, boats &amp; transparent NGN quotes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFastMode((v) => !v)}
                title="Toggle fast lightweight replies"
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
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
                className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F7F4]">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-[#111318] text-white"
                    : "mr-auto bg-white border border-stone-200 text-[#111318]"
                }`}
              >
                {m.role === "model" ? (
                  <div className="prose prose-xs max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                    <Markdown>{m.text}</Markdown>
                  </div>
                ) : (
                  <p>{m.text}</p>
                )}
              </div>
            ))}

            {messages.length === 1 && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[11px] font-medium text-stone-500">Suggested questions:</p>
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="block w-full text-left px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg text-stone-700 hover:border-[#9A6B32] transition-colors"
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
              className="flex-1 px-3 py-2 text-xs bg-[#F8F7F4] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#9A6B32]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="p-2.5 rounded-lg bg-[#111318] text-white hover:bg-stone-800 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
