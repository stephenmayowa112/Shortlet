import sharp from "sharp";

export interface PhotoWatermarkInput {
  sourceBuffer: Buffer;
  /** Approved display/business name of original listing agent, or null if no agent */
  agentDisplayName?: string | null;
  /** Role of submitter when no agent is attached */
  submitterType?: "agent" | "owner" | "manager" | "platform";
}

export interface VideoProcessingJob {
  jobId: string;
  listingId: string;
  privateOriginalRef: string;
  watermarkEnabled: boolean;
  attributionLabel: string;
  status: "queued" | "completed_watermark_burned" | "completed_playback_only_v1_fallback";
  createdAtIso: string;
}

export interface MediaProcessor {
  resolveAttributionText(
    agentDisplayName?: string | null,
    submitterType?: "agent" | "owner" | "manager" | "platform"
  ): string;
  watermarkPhoto(input: PhotoWatermarkInput): Promise<Buffer>;
  enqueueVideoProcessing(params: {
    listingId: string;
    privateOriginalRef: string;
    agentDisplayName?: string | null;
    submitterType?: "agent" | "owner" | "manager" | "platform";
    videoWatermarkEnabled?: boolean;
  }): Promise<VideoProcessingJob>;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Production server-side Sharp photo watermarker (MEDIA-01) and flag-gated async video job adapter (MEDIA-02).
 * Permanently burns `SHORTLET CONNECT` and `Listed by: <Agent>` into published image pixels.
 */
export class SharpMediaProcessor implements MediaProcessor {
  /**
   * Safe attribution rule per MEDIA-01 & OQ-07:
   * Never invents an agent when a listing has no agent.
   */
  public resolveAttributionText(
    agentDisplayName?: string | null,
    submitterType: "agent" | "owner" | "manager" | "platform" = "agent"
  ): string {
    const clean = (agentDisplayName ?? "").trim();
    if (clean.length >= 2) {
      return `Listed by: ${clean}`;
    }
    if (submitterType === "owner") {
      return "Listed by: Verified Owner";
    }
    return "Listed by: Shortlet Connect";
  }

  public async watermarkPhoto(input: PhotoWatermarkInput): Promise<Buffer> {
    const image = sharp(input.sourceBuffer);
    const metadata = await image.metadata();
    const width = metadata.width ?? 1200;
    const height = metadata.height ?? 900;

    const attribution = escapeXml(
      this.resolveAttributionText(input.agentDisplayName, input.submitterType)
    );

    const fontSizePrimary = Math.max(18, Math.round(width * 0.022));
    const fontSizeSub = Math.max(14, Math.round(width * 0.017));
    const centerFontSize = Math.max(24, Math.round(width * 0.036));
    const barHeight = Math.max(58, Math.round(height * 0.085));
    const padX = Math.max(24, Math.round(width * 0.028));

    const svgOverlay = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Subtle center diagonal brand lock discourages trivial cropping -->
        <g opacity="0.22" transform="translate(${Math.round(width / 2)}, ${Math.round(height / 2)}) rotate(-18)">
          <text
            x="0"
            y="0"
            text-anchor="middle"
            font-family="sans-serif"
            font-weight="700"
            font-size="${centerFontSize}"
            letter-spacing="4"
            fill="#FFFFFF"
            stroke="#000000"
            stroke-width="1"
          >SHORTLET CONNECT</text>
          <text
            x="0"
            y="${Math.round(centerFontSize * 0.95)}"
            text-anchor="middle"
            font-family="sans-serif"
            font-weight="600"
            font-size="${Math.round(centerFontSize * 0.55)}"
            letter-spacing="1.5"
            fill="#FFFFFF"
          >${attribution}</text>
        </g>

        <!-- High-legibility fixed bottom-right & bottom band stamp -->
        <rect
          x="0"
          y="${height - barHeight}"
          width="${width}"
          height="${barHeight}"
          fill="rgba(15, 23, 42, 0.72)"
        />
        <text
          x="${padX}"
          y="${height - Math.round(barHeight * 0.36)}"
          font-family="sans-serif"
          font-weight="700"
          font-size="${fontSizePrimary}"
          letter-spacing="2.2"
          fill="#F8FAFC"
        >SHORTLET CONNECT</text>
        <text
          x="${width - padX}"
          y="${height - Math.round(barHeight * 0.36)}"
          text-anchor="end"
          font-family="sans-serif"
          font-weight="600"
          font-size="${fontSizeSub}"
          fill="#FDE68A"
        >${attribution}</text>
      </svg>
    `);

    return image
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  }

  public async enqueueVideoProcessing(params: {
    listingId: string;
    privateOriginalRef: string;
    agentDisplayName?: string | null;
    submitterType?: "agent" | "owner" | "manager" | "platform";
    videoWatermarkEnabled?: boolean;
  }): Promise<VideoProcessingJob> {
    const flagEnabled =
      params.videoWatermarkEnabled ?? process.env.VIDEO_WATERMARK_ENABLED === "true";

    return {
      jobId: `vidjob_${Date.now().toString(36)}`,
      listingId: params.listingId,
      privateOriginalRef: params.privateOriginalRef,
      watermarkEnabled: flagEnabled,
      attributionLabel: this.resolveAttributionText(
        params.agentDisplayName,
        params.submitterType
      ),
      status: flagEnabled
        ? "queued"
        : "completed_playback_only_v1_fallback",
      createdAtIso: new Date().toISOString(),
    };
  }
}

export const mediaProcessor = new SharpMediaProcessor();
