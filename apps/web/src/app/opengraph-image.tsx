import { ImageResponse } from "next/og";

export const alt = "Alarsio: site records with no signal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#1c1a17", color: "#f3ecdf" }}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -2 }}>Alarsio</div>
        <div style={{ fontSize: 56, marginTop: 16 }}>Site records with no signal</div>
        <div style={{ fontSize: 30, marginTop: 40, opacity: 0.7 }}>Offline first, for Indian contractors. Android and web.</div>
      </div>
    ),
    size
  );
}
