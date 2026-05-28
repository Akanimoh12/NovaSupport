import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NovaSupport - Stellar-native support profiles";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #0a0e27 0%, #16224a 50%, #0f1433 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "20px",
              background: "#00E5BF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
            >
              <path
                d="M20 4L28 12L20 20L12 12L20 4Z"
                fill="#0a0e27"
              />
              <path
                d="M20 36L28 28L20 20L12 28L20 36Z"
                fill="#0a0e27"
              />
              <path
                d="M4 20L12 12L20 20L12 28L4 20Z"
                fill="#0a0e27"
              />
              <path
                d="M36 20L28 12L20 20L28 28L36 20Z"
                fill="#0a0e27"
              />
            </svg>
          </div>
          <h1
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            NovaSupport
          </h1>
        </div>
        <p
          style={{
            fontSize: "32px",
            color: "#94a3b8",
            margin: 0,
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.4,
          }}
        >
          Stellar-native support profiles for maintainers, creators, and
          developers.
        </p>
        <div
          style={{
            position: "absolute",
            bottom: "60px",
            right: "80px",
            width: "120px",
            height: "4px",
            borderRadius: "2px",
            background: "#00E5BF",
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
