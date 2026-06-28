import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import FloatingAgent from "@/components/layout/FloatingAgent";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nudge — AI Campaign Copilot",
  description:
    "Describe your audience in plain English. Kimi AI segments, writes personalised messages, and dispatches — you just confirm.",
  keywords: ["CRM", "AI", "campaign", "marketing", "automation"],
  openGraph: {
    title: "Nudge — AI Campaign Copilot",
    description: "AI-native mini CRM for BrewMate campaign management",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-bg text-text min-h-screen`}
      >
        {/* Global navigation bar */}
        <Navbar />

        {/* Page content */}
        <main>{children}</main>

        {/* Global floating AI assistant */}
        <FloatingAgent />

        {/* Toast notifications */}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}

