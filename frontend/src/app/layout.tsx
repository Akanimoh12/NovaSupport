import type { Metadata } from "next";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "NovaSupport",
  description:
    "Stellar-native support profiles for maintainers, creators, and developers.",
  openGraph: {
    title: "NovaSupport",
    description:
      "Stellar-native support profiles for maintainers, creators, and developers.",
    url: SITE_URL,
    siteName: "NovaSupport",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NovaSupport",
    description:
      "Stellar-native support profiles for maintainers, creators, and developers.",
  },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
