import type { MetadataRoute } from "next";
import { getCanonicalAppUrl } from "@/lib/config/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getCanonicalAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/private_media/", "/private_id_docs/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
