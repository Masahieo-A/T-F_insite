import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "校内陸上競技大会の競技速報、記録入力、チーム得点集計をリアルタイムで確認できます。";
  return {
    title: "校内陸上競技大会｜速報・記録管理",
    description,
    applicationName: "NANS KOUNAI",
    metadataBase: new URL(origin),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      title: "校内陸上競技大会｜速報・記録管理",
      description,
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1728, height: 909, alt: "校内陸上競技大会 記録・速報・チーム得点" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "校内陸上競技大会｜速報・記録管理",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#075aa5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
