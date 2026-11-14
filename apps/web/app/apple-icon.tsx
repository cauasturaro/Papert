import { ImageResponse } from "next/og";
import { PapertMark } from "@/components/icons";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

// iOS rounds the corners itself, so the lilac tile is drawn full-bleed.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e8dff5",
        color: "#30263d",
      }}
    >
      <PapertMark width={112} height={112} />
    </div>,
    {
      ...size,
    },
  );
}
