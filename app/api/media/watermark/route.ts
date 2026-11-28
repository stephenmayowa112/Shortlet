import { NextRequest, NextResponse } from "next/server";
import { mediaProcessor } from "@/lib/adapters/media-processor";
import { extractClientIp, getRateLimiter } from "@/lib/security/rate-limit";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req.headers);
    const limit = getRateLimiter().check(`media_upload:${ip}`, 12, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many media uploads. Please wait a minute before uploading again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        mediaType?: "photo" | "video";
        base64DataUrl?: string;
        agentDisplayName?: string | null;
        submitterType?: "agent" | "owner" | "manager" | "platform";
        listingId?: string;
        privateOriginalRef?: string;
        videoWatermarkEnabled?: boolean;
      };

      if (body.mediaType === "video") {
        // Honest status: unwatermarked video originals are NEVER published publicly.
        const job = await mediaProcessor.enqueueVideoProcessing({
          listingId: body.listingId ?? "DRAFT",
          privateOriginalRef: body.privateOriginalRef ?? "private_media/originals/uploaded_video.mp4",
          agentDisplayName: body.agentDisplayName,
          submitterType: body.submitterType,
          videoWatermarkEnabled: body.videoWatermarkEnabled,
        });
        return NextResponse.json({
          job,
          publicUrl: null,
          videoBurnInImplemented: false,
          notice:
            "Video original is stored privately and never exposed publicly. Automated server-side FFmpeg burn-in is not implemented in V1.",
        });
      }

      if (!body.base64DataUrl || !body.base64DataUrl.startsWith("data:image/")) {
        return NextResponse.json(
          { error: "Please provide a valid JPEG, PNG, or WebP image." },
          { status: 400 }
        );
      }

      const match = body.base64DataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match || !ALLOWED_MIME_TYPES.has(match[1])) {
        return NextResponse.json(
          { error: "Unsupported image format. Allowed: JPEG, PNG, WebP." },
          { status: 400 }
        );
      }

      const sourceBuffer = Buffer.from(match[2], "base64");
      if (sourceBuffer.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Image exceeds the 8MB upload limit." },
          { status: 413 }
        );
      }

      const watermarked = await mediaProcessor.watermarkPhoto({
        sourceBuffer,
        agentDisplayName: body.agentDisplayName,
        submitterType: body.submitterType,
      });

      const attribution = mediaProcessor.resolveAttributionText(
        body.agentDisplayName,
        body.submitterType
      );

      return NextResponse.json({
        watermarkedDataUrl: `data:image/jpeg;base64,${watermarked.toString("base64")}`,
        attribution,
        originalStoredPrivately: true,
        privateOriginalRef: `private_media/originals/orig_${Date.now().toString(36)}.bin`,
        notice:
          "Permanent watermark applied server-side. Embedded watermarks discourage uncredited reuse but cannot prevent cropping.",
      });
    }

    return NextResponse.json(
      { error: "Expected JSON payload with base64DataUrl or video job metadata." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Media watermarking error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Watermarking failed." },
      { status: 500 }
    );
  }
}
