import type { MetadataRoute } from "next";
import { getCanonicalAppUrl } from "@/lib/config/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getCanonicalAppUrl();
  const now = new Date();
  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
