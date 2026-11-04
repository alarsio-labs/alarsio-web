import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1a17", color: "#f3ecdf", fontSize: 44, fontWeight: 800 }}>
        A
      </div>
    ),
    size
  );
}
