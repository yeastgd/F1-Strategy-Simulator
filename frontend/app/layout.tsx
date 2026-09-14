import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Barlow_Condensed, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-data",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "F1 Pit Strategy Simulator",
  description: "Monte Carlo pit-strategy comparison on real F1 race data",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable} ${plex.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="site-title">
            Pit strategy
          </Link>
          <span className="site-subtitle">Monte Carlo · real race data</span>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
