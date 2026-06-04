import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Syne, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "WholesaleOS — Your wholesale business, on autopilot",
    template: "%s · WholesaleOS",
  },
  description:
    "AI finds the deals, writes the outreach, and runs your pipeline. You approve 3 taps a day. The most automated real estate wholesaling platform.",
  applicationName: "WholesaleOS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WholesaleOS",
  },
  openGraph: {
    title: "WholesaleOS — Your wholesale business, on autopilot",
    description:
      "AI finds the deals, writes the outreach, and runs your pipeline. You approve 3 taps a day.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080808",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${syne.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
