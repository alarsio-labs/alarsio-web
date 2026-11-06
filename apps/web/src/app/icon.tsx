import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// The browser tab icon: a cream "A" on loam with the red rule from the wordmark (docs/DESIGN.md).
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#241A12", color: "#E7E2D8", borderRadius: 14 }}>
        <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>A</div>
        <div style={{ width: 26, height: 5, background: "#EF493C", marginTop: 4 }} />
      </div>
    ),
    size
  );
}
