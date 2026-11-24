import type { PrivateListingRecord } from "@/lib/types";

export interface DuplicateMatch {
  existingListingId: string;
  existingTitle: string;
  reasons: string[];
  confidence: "high" | "medium";
}

function normalizeToken(val?: string): string {
  return (val ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Flags likely duplicate apartments (address/unit, street+area+title similarity, shared photo refs)
 * and cars/boats (vehicle/vessel identifiers, plate/hull numbers) per PART-02.
 */
export function detectPotentialDuplicates(
  candidate: Pick<
    PrivateListingRecord,
    | "listingId"
    | "category"
    | "title"
    | "area"
    | "safeStreetLabel"
    | "exactBuildingNumber"
    | "vehicleOrVesselIdentifier"
    | "watermarkedPhotos"
  >,
  existingListings: PrivateListingRecord[]
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const candAddr = normalizeToken(`${candidate.area}${candidate.safeStreetLabel ?? ""}${candidate.exactBuildingNumber ?? ""}`);
  const candIdToken = normalizeToken(candidate.vehicleOrVesselIdentifier);
  const candTitle = normalizeToken(candidate.title);
  const candPhotos = new Set(candidate.watermarkedPhotos.map((p) => p.split("?")[0]));

  for (const existing of existingListings) {
    if (existing.listingId === candidate.listingId) continue;
    if (existing.category !== candidate.category) continue;
    if (existing.status === "rejected") continue;

    const reasons: string[] = [];

    if (candidate.category === "apartment") {
      const exAddr = normalizeToken(`${existing.area}${existing.safeStreetLabel ?? ""}${existing.exactBuildingNumber ?? ""}`);
      if (candidate.exactBuildingNumber && exAddr && candAddr === exAddr) {
        reasons.push("Exact address & unit number match");
      } else if (
        candidate.safeStreetLabel &&
        existing.safeStreetLabel &&
        normalizeToken(candidate.area) === normalizeToken(existing.area) &&
        normalizeToken(candidate.safeStreetLabel) === normalizeToken(existing.safeStreetLabel) &&
        candTitle.slice(0, 12) === normalizeToken(existing.title).slice(0, 12)
      ) {
        reasons.push("Same area, street, and similar apartment title");
      }
    } else if (candIdToken && candIdToken === normalizeToken(existing.vehicleOrVesselIdentifier)) {
      reasons.push(
        candidate.category === "car"
          ? "Matching vehicle registration/VIN identifier"
          : "Matching vessel registration/hull identifier"
      );
    }

    const sharedPhotos = existing.watermarkedPhotos.filter((p) =>
      candPhotos.has(p.split("?")[0])
    );
    if (sharedPhotos.length > 0 && !sharedPhotos[0].includes("default_placeholder")) {
      reasons.push(`${sharedPhotos.length} identical media asset(s) detected`);
    }

    if (reasons.length > 0) {
      matches.push({
        existingListingId: existing.listingId,
        existingTitle: existing.title,
        reasons,
        confidence:
          reasons.some((r) => r.includes("Exact") || r.includes("identifier"))
            ? "high"
            : "medium",
      });
    }
  }

  return matches;
}
