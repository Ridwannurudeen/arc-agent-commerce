import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://arc.gudman.xyz"),
  title: "Agent Commerce Protocol | Arc",
  description:
    "An ERC-8183 conditional sequencer on Arc. A primitive that turns ordered ERC-8183 jobs into atomically-funded, conditionally-halting workflows.",
  openGraph: {
    title: "Agent Commerce Protocol",
    description:
      "An ERC-8183 conditional sequencer on Arc. Atomically funded, conditionally halted.",
    images: ["/og-image.svg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commerce Protocol",
    description:
      "An ERC-8183 conditional sequencer on Arc. Atomically funded, conditionally halted.",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
