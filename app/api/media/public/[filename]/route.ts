import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { mediaProcessor } from "@/lib/adapters/media-processor";

const ALLOWED_PRIVATE_FILES = new Set([
  "hero_lagos_penthouse.jpg",
  "apt_lekki_pool_villa.jpg",
  "apt_vi_cinema_suite.jpg",
  "car_lagos_suv_fleet.jpg",
  "boat_lagos_yacht_cruise.jpg",
]);

const watermarkCache = new Map<string, Buffer>();

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params;
    const safeName = path.basename(filename);

    if (!ALLOWED_PRIVATE_FILES.has(safeName)) {
      return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
    }

    const agentParam = req.nextUrl.searchParams.get("agent")?.slice(0, 60) ?? "";
    const submitterParam = req.nextUrl.searchParams.get("submitter") as
      | "agent"
      | "owner"
      | "manager"
      | "platform"
      | null;

    const cacheKey = `${safeName}::${agentParam}::${submitterParam ?? "agent"}`;
    let outputBuffer = watermarkCache.get(cacheKey);

    if (!outputBuffer) {
      const privatePath = path.join(process.cwd(), "private_media", safeName);
      const sourceBuffer = await fs.readFile(privatePath);
      outputBuffer = await mediaProcessor.watermarkPhoto({
        sourceBuffer,
        agentDisplayName: agentParam || null,
        submitterType: submitterParam ?? "agent",
      });
      watermarkCache.set(cacheKey, outputBuffer);
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Shortlet-Watermark": "permanent-server-side",
      },
    });
  } catch (error) {
    console.error("Failed to serve watermarked public image:", error);
    return NextResponse.json(
      { error: "Unable to process listing media." },
      { status: 500 }
    );
  }
}
