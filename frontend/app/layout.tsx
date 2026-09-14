import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Pit Strategy Simulator",
  description: "Monte Carlo pit-strategy comparison on real F1 race data",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="site-title">
            🏁 F1 Pit Strategy Simulator
          </Link>
          <span className="site-subtitle">Monte Carlo strategy comparison on real race data</span>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
