import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Shortlet Connect — Verified Apartments, Cars & Boats in Nigeria",
  description:
    "Mobile-first managed booking marketplace for verified shortlet apartments, chauffeur-driven cars, and lagoon yachts in Nigeria with admin-run live video inspections and transparent Paystack checkout.",
  openGraph: {
    title: "Shortlet Connect — Verified Apartments, Cars & Boats in Nigeria",
    description:
      "Mobile-first managed booking marketplace for verified shortlet apartments, chauffeur-driven cars, and lagoon yachts in Nigeria.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shortlet Connect — Verified Apartments, Cars & Boats in Nigeria",
    description:
      "Mobile-first managed booking marketplace for verified shortlet apartments, chauffeur-driven cars, and lagoon yachts in Nigeria.",
  },
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
      <body
        suppressHydrationWarning
        className="font-sans bg-[#F8F7F4] text-[#111318] antialiased selection:bg-[#9A6B32]/20 selection:text-[#111318]"
      >
        {children}
      </body>
    </html>
  );
}
