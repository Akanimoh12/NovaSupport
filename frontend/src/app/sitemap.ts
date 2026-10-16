import type { MetadataRoute } from "next";
import { API_BASE_URL, SITE_URL } from "@/lib/config";

type ProfileListItem = {
  username: string;
  updatedAt?: string;
};

type ProfilesResponse = {
  profiles: ProfileListItem[];
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static high-priority pages
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/explore`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];

  // Dynamic creator profile pages
  let profileEntries: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_BASE_URL}/v1/profiles?limit=1000`, {
      next: { revalidate: 3600 }, // revalidate once per hour
    });
    if (res.ok) {
      const data: ProfilesResponse = await res.json();
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      profileEntries = profiles.map((profile) => ({
        url: `${SITE_URL}/profile/${profile.username}`,
        lastModified: profile.updatedAt ? new Date(profile.updatedAt) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }
  } catch {
    // Sitemap generation should not fail the build if the API is unavailable
  }

  return [...staticEntries, ...profileEntries];
}
