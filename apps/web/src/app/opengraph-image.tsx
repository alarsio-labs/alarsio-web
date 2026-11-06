import { ImageResponse } from "next/og";

export const alt = "Alarsio: attendance, reports and materials, recorded on site with no signal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The link preview (WhatsApp, LinkedIn, search). Brand tokens from docs/DESIGN.md: loam ground,
// cream type, the red word part and a red rule. System bold type: no font file is fetched.
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#241A12", color: "#E7E2D8" }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 900, letterSpacing: -2, textTransform: "uppercase" }}>
          <span>Alar</span>
          <span style={{ color: "#EF493C" }}>sio</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: -2, textTransform: "uppercase", maxWidth: 1000 }}>
            Site records with no signal
          </div>
          <div style={{ width: 160, height: 8, background: "#EF493C", marginTop: 32 }} />
          <div style={{ fontSize: 32, marginTop: 28, color: "#B0AAA1" }}>
            Attendance, daily reports, materials and wages, for contractors running 2 to 20 sites.
          </div>
        </div>
      </div>
    ),
    size
  );
}
