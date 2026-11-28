import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { mediaProcessor } from "@/lib/adapters/media-processor";

const ALLOWED_PUBLIC_MEDIA_BASENAMES = new Set([
  "hero_lagos_penthouse.jpg",
  "apt_lekki_pool_villa.jpg",
  "apt_vi_cinema_suite.jpg",
  "car_lagos_suv_fleet.jpg",
  "boat_lagos_yacht_cruise.jpg",
]);

const PRIVATE_MEDIA_DIR = path.resolve(process.cwd(), "private_media");
const watermarkCache = new Map<string, Buffer>();

/**
 * Public watermarked media route (Task 6 #2 & #3).
 * Security invariants:
 * - Strictly rejects path traversal (.., /, \, URL-encoded traversal, null bytes).
 * - Only serves watermarked output of explicitly allow-listed catalog media.
 * - Originals in private_media/originals/, private_media/uploads/, and private_id_docs/ are NEVER served.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params;

    // Explicit traversal & separator guard before path.basename
    let decoded = filename;
    try {
      decoded = decodeURIComponent(filename);
    } catch {
      return NextResponse.json({ error: "Invalid media path." }, { status: 400 });
    }

    if (
      !decoded ||
      decoded.includes("..") ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      path.basename(decoded) !== decoded
    ) {
      return NextResponse.json({ error: "Invalid media asset path." }, { status: 400 });
    }

    if (!ALLOWED_PUBLIC_MEDIA_BASENAMES.has(decoded)) {
      return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
    }

    const privatePath = path.resolve(PRIVATE_MEDIA_DIR, decoded);
    if (!privatePath.startsWith(PRIVATE_MEDIA_DIR + path.sep)) {
      return NextResponse.json({ error: "Invalid media path." }, { status: 400 });
    }

    const agentParam = req.nextUrl.searchParams.get("agent")?.slice(0, 60) ?? "";
    const submitterParam = req.nextUrl.searchParams.get("submitter") as
      | "agent"
      | "owner"
      | "manager"
      | "platform"
      | null;

    const cacheKey = `${decoded}::${agentParam}::${submitterParam ?? "agent"}`;
    let outputBuffer = watermarkCache.get(cacheKey);

    if (!outputBuffer) {
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
        "X-Content-Type-Options": "nosniff",
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
