import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font: no request to Google when a page loads.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Canonical origin comes from NEXT_PUBLIC_SITE_URL so the domain is a deploy setting.
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const TITLE = "Alarsio · Site records with no signal";
const DESCRIPTION =
  "Alarsio helps Indian contractors keep attendance, daily reports, materials and wages on site, offline first, on Android and the web.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: TITLE, template: "%s | Alarsio" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Alarsio", url: "/", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white font-sans text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
