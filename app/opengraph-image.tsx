import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CFBPools.com — SEC Survivor Pool & Weekly College Football Pick'em";

export default function OpengraphImage() {
  // The trophy logo is a square mark with its own "CFB POOLS.COM" wordmark
  // baked in — placed beside descriptive text on a wide canvas here rather
  // than stretched/cropped to fill 1200x630, which is what the square
  // favicon crop would look like.
  const logoData = fs.readFileSync(path.join(process.cwd(), "public/brand/trophy-logo.png"));
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={420} height={426} alt="" />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 540 }}>
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 700,
              fontFamily: "Georgia, serif",
              color: "#E7EAF0",
              letterSpacing: -1,
              lineHeight: 1.05,
            }}
          >
            SEC Survivor Pool
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 30,
              fontFamily: "Georgia, serif",
              color: "#8B93A7",
            }}
          >
            &amp; Weekly College Football Pick&apos;em
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
