import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font: no request to Google when a page loads.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Alarsio",
  description: "Offline-first construction operations for small contractors."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white font-sans text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
