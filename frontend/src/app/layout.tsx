import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://arc.gudman.xyz"),
  title: "Agent Commerce Protocol | Arc",
  description:
    "AI agent service marketplace with USDC escrow on Arc L1. Multi-agent pipeline orchestration built on ERC-8183 and ERC-8004.",
  openGraph: {
    title: "Agent Commerce Protocol",
    description:
      "Multi-agent pipeline orchestration with atomic USDC settlement on Arc L1",
    images: ["/og-image.svg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commerce Protocol",
    description:
      "Multi-agent pipeline orchestration with atomic USDC settlement on Arc L1",
    images: ["/og-image.svg"],
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
