import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGeminiClient } from "@/lib/gemini";
import { mediaProcessor } from "@/lib/adapters/media-processor";

const ImageStudioSchema = z.object({
  prompt: z.string().min(4).max(1200),
  aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]).default("4:3"),
  imageSize: z.enum(["1K", "2K", "4K"]).default("1K"),
  sourceImageBase64: z.string().optional(),
  sourceMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  applyWatermark: z.boolean().default(true),
  agentDisplayName: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = ImageStudioSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a clear prompt (4–1200 characters)." },
        { status: 400 }
      );
    }

    const ai = getGeminiClient();
    const parts: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    > = [];

    if (parsed.data.sourceImageBase64 && parsed.data.sourceMimeType) {
      const cleanBase64 = parsed.data.sourceImageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: parsed.data.sourceMimeType,
        },
      });
    }

    parts.push({ text: parsed.data.prompt });

    const response = await ai.models.generateContent({
      model: "gemini-nano-banana-2.1",
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: parsed.data.aspectRatio,
          imageSize: parsed.data.imageSize,
        },
      },
    });

    let generatedBase64: string | null = null;
    let generatedMime = "image/png";
    let modelNote = "";

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        generatedBase64 = part.inlineData.data;
        generatedMime = part.inlineData.mimeType ?? "image/png";
      } else if (part.text) {
        modelNote += part.text;
      }
    }

    if (!generatedBase64) {
      return NextResponse.json(
        {
          error:
            modelNote ||
            "No image was returned by gemini-nano-banana-2.1. Try refining your prompt.",
        },
        { status: 422 }
      );
    }

    let finalDataUrl = `data:${generatedMime};base64,${generatedBase64}`;
    let watermarked = false;

    if (parsed.data.applyWatermark) {
      const rawBuffer = Buffer.from(generatedBase64, "base64");
      const burnedBuffer = await mediaProcessor.watermarkPhoto({
        sourceBuffer: rawBuffer,
        agentDisplayName: parsed.data.agentDisplayName ?? null,
        submitterType: parsed.data.agentDisplayName ? "agent" : "platform",
      });
      finalDataUrl = `data:image/jpeg;base64,${burnedBuffer.toString("base64")}`;
      watermarked = true;
    }

    return NextResponse.json({
      imageUrl: finalDataUrl,
      watermarked,
      modelUsed: "gemini-nano-banana-2.1",
      note: modelNote || undefined,
    });
  } catch (error) {
    console.error("Gemini Image Studio error:", error);
    const rawMsg = error instanceof Error ? error.message : String(error);
    const isBillingOrQuota =
      rawMsg.includes("429") ||
      rawMsg.includes("RESOURCE_EXHAUSTED") ||
      rawMsg.includes("PERMISSION_DENIED") ||
      rawMsg.includes("403") ||
      rawMsg.includes("API_KEY");
    return NextResponse.json(
      {
        error: isBillingOrQuota
          ? "AI image generation with gemini-nano-banana-2.1 requires a billing-enabled Gemini API key configured in Settings > Secrets. You can still upload any photo and apply the permanent Shortlet Connect server watermark below."
          : rawMsg,
      },
      { status: isBillingOrQuota ? 403 : 500 }
    );
  }
}
