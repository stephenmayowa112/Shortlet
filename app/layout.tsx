import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import { getCanonicalAppUrl } from "@/lib/config/env";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const CANONICAL_URL = getCanonicalAppUrl();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F8F7F4",
};

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_URL),
  title: "Shortlet Connect — Verified Apartments, Cars & Boats in Nigeria",
  description:
    "Book approved shortlet apartments, chauffeur-driven cars, and lagoon yachts in Lagos with live video inspections and transparent Paystack checkout.",
  keywords: [
    "Lagos shortlet apartments",
    "verified shortlets Nigeria",
    "Ikoyi shortlet",
    "Lekki Phase 1 apartments",
    "Victoria Island shortlet",
    "chauffeur car rental Lagos",
    "Lagos boat and yacht charter",
    "Shortlet Connect",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: CANONICAL_URL,
    siteName: "Shortlet Connect",
    title: "Shortlet Connect — Verified Apartments, Cars & Boats in Nigeria",
    description:
      "Book approved shortlet apartments, chauffeur-driven cars, and lagoon yachts in Lagos with live video inspections and transparent Paystack checkout.",
    images: [
      {
        url: "/api/media/public/hero_lagos_penthouse.jpg?submitter=platform",
        width: 1200,
        height: 630,
        alt: "Shortlet Connect verified Lagos penthouse apartment",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shortlet Connect — Verified Apartments, Cars & Boats in Nigeria",
    description:
      "Book approved shortlet apartments, chauffeur-driven cars, and lagoon yachts in Lagos with live video inspections and transparent Paystack checkout.",
    images: ["/api/media/public/hero_lagos_penthouse.jpg?submitter=platform"],
  },
};

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Shortlet Connect",
      url: CANONICAL_URL,
      areaServed: {
        "@type": "Country",
        name: "Nigeria",
      },
      description:
        "Managed booking marketplace for approved shortlet apartments, chauffeur-driven cars, and lagoon boats in Nigeria.",
    },
    {
      "@type": "WebSite",
      name: "Shortlet Connect",
      url: CANONICAL_URL,
      inLanguage: "en-NG",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="font-sans bg-[#F8F7F4] text-[#111318] antialiased selection:bg-[#9A6B32]/20 selection:text-[#111318]"
      >
        {children}
      </body>
    </html>
  );
}
