import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CFBPools.com — SEC Survivor Pool & Weekly College Football Pick'em";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1220",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            display: "flex",
            background: "#F5B942",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 108,
            fontWeight: 700,
            fontFamily: "Georgia, serif",
            color: "#E7EAF0",
            letterSpacing: -2,
          }}
        >
          CFBPools<span style={{ color: "#F5B942" }}>.com</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            fontFamily: "Georgia, serif",
            color: "#8B93A7",
          }}
        >
          SEC Survivor Pool &amp; Weekly College Football Pick&apos;em
        </div>
      </div>
    ),
    { ...size }
  );
}
