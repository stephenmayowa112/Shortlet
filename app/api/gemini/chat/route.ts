import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGeminiClient } from "@/lib/gemini";

const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().min(1).max(3000),
      })
    )
    .min(1)
    .max(30),
  fastMode: z.boolean().optional(),
  catalogSummary: z.string().max(4000).optional(),
});

const SYSTEM_INSTRUCTION = `You are the official Shortlet Connect Concierge for Nigeria (Lagos — Ikoyi, Victoria Island, Lekki Phase 1).
Your role is to help guests discover approved shortlet apartments, chauffeur-driven cars, and lagoon yacht/boat charters, explain pricing transparently, and guide them to request a live video inspection or open the official WhatsApp Chat With Us link.

Strict rules you MUST follow:
1. Service charges are transparently disclosed to guests:
   - Apartments: ₦30,000 per booked night.
   - Cars: ₦30,000 per chargeable day (12-hour and 24-hour rentals each incur 1 unit; 3 days incur 3 units).
   - Boats: ₦30,000 per 2-hour block, rounded up (e.g., 3 hours = ₦60,000, 4 hours = ₦60,000, 5 hours = ₦90,000).
   - Customer total = Rental Principal + Service Charge + Refundable Caution Fee (if applicable) + approved extras.
2. NEVER mention or reveal any internal commission split, ₦10,000 allocations, founder share, or internal ledger categories.
3. NEVER share exact building numbers or private legal owner phone numbers. Remind guests that exact addresses are released only after authorised booking confirmation.
4. Remind guests that apartment amenities are claims verified during listing approval, and they can request an admin-hosted live video inspection before paying.
5. Keep replies concise, refined, warm, and well-structured using clean Markdown.`;

export async function POST(req: NextRequest) {
  try {
    const parsed = ChatSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid chat message format." },
        { status: 400 }
      );
    }

    const ai = getGeminiClient();
    const model = parsed.data.fastMode ? "gemini-3.1-flash-lite" : "gemini-4-hydrogen";

    const history = parsed.data.messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));
    const latestMessage = parsed.data.messages[parsed.data.messages.length - 1].text;

    const fullSystemInstruction = parsed.data.catalogSummary
      ? `${SYSTEM_INSTRUCTION}\n\nCurrently approved public listings in Shortlet Connect:\n${parsed.data.catalogSummary}`
      : SYSTEM_INSTRUCTION;

    const chat = ai.chats.create({
      model,
      history,
      config: {
        systemInstruction: fullSystemInstruction,
      },
    });

    const response = await chat.sendMessage({ message: latestMessage });
    return NextResponse.json({
      reply: response.text ?? "I am here to assist with verified apartments, cars, and boats in Lagos.",
      modelUsed: model,
    });
  } catch (error) {
    console.error("Gemini Concierge error:", error);
    const message =
      error instanceof Error ? error.message : "Concierge service is currently unavailable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
