import { Anton, Martian_Mono } from "next/font/google";

// The v2 display and label fonts (docs/DESIGN.md), self-hosted at build time.
// Shared by the landing page and the sign-in pages; Inter comes from the root layout.
export const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
export const mono = Martian_Mono({ weight: "400", subsets: ["latin"], variable: "--font-mono", display: "swap" });
