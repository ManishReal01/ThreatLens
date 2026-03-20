import type { Metadata } from "next";
import localFont from "next/font/local";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ThreatLens | Threat Intelligence Platform",
  description: "Advanced OSINT Threat Intelligence Aggregator for SOC Analysts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("dark", dmSans.variable, syne.variable, geistMono.variable)}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
