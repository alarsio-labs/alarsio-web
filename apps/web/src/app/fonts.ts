import { Anton, Archivo, Bricolage_Grotesque, Instrument_Sans, Martian_Mono } from "next/font/google";

// The v2 display and label fonts (docs/DESIGN.md), self-hosted at build time.
// Shared by the landing page; Inter comes from the root layout.
export const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
export const mono = Martian_Mono({ weight: "400", subsets: ["latin"], variable: "--font-mono", display: "swap" });

// The sign-in pages (docs/DESIGN.md section 2b, v3): Bricolage Grotesque titles, Instrument Sans
// text, and the wordmark in Archivo at its widest (125%).
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-auth-display", display: "swap" });
export const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-auth-body", display: "swap" });
export const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-auth-brand", display: "swap" });
