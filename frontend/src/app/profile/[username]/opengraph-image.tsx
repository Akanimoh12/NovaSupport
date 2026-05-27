import { ImageResponse } from "next/og";
import { API_BASE_URL } from "@/lib/config";

export const runtime = "edge";
export const alt = "NovaSupport Profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Profile = {
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
};

export default async function Image({
  params,
}: {
  params: { username: string };
}) {
  let displayName = params.username;
  let bio: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const res = await fetch(`${API_BASE_URL}/profiles/${params.username}`);
    if (res.ok) {
      const profile: Profile = await res.json();
      displayName = profile.displayName || params.username;
      bio = profile.bio;
      avatarUrl = profile.avatarUrl;
    }
  } catch {
    // Use fallback values
  }

  const truncatedBio =
    bio
      ? bio.length > 160
        ? bio.slice(0, 157) + "..."
        : bio
      : `Support ${displayName} on NovaSupport`;

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
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 100px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "48px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#00E5BF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
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
          <span
            style={{
              fontSize: "22px",
              fontWeight: 600,
              color: "#00E5BF",
            }}
          >
            NovaSupport
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
            marginBottom: "24px",
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              width="112"
              height="112"
              style={{
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "112px",
                height: "112px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #00E5BF, #00b8a0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: "48px",
                  fontWeight: 800,
                  color: "#ffffff",
                  textTransform: "uppercase",
                }}
              >
                {displayName.charAt(0)}
              </span>
            </div>
          )}
          <h1
            style={{
              fontSize: "60px",
              fontWeight: 800,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.02em",
              maxWidth: "700px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </h1>
        </div>

        <p
          style={{
            fontSize: "26px",
            color: "#94a3b8",
            margin: "0 0 0 144px",
            maxWidth: "650px",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: "3",
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {truncatedBio}
        </p>

        <div
          style={{
            position: "absolute",
            bottom: "60px",
            right: "80px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#00E5BF",
            }}
          />
          <div
            style={{
              width: "80px",
              height: "3px",
              borderRadius: "2px",
              background: "#00E5BF",
            }}
          />
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
