import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import { HeaderNav } from "@/components/HeaderNav";
import { Wordmark } from "@/components/Logo";
import { TooltipLayer } from "@/components/ui/TooltipLayer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KeyProxy — API Key Rotation",
  description: "Proxy server that cycles through multiple API keys automatically.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#08080f] text-white`}>
        {/* flex-wrap: on a phone the nav drops to its own row instead of
            pushing the user menu off the right edge of the screen. */}
        <header className="border-b border-[#1a1a28] px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href="/" className="flex items-center no-underline min-h-[44px]">
            <Wordmark />
          </a>
          <span className="text-[#2a2a38] hidden xl:inline">|</span>
          <span className="text-[#8b8b9e] text-sm hidden xl:inline">API Key Rotation Proxy</span>
          {user && <HeaderNav />}
          <UserMenu user={user} />
        </header>
        {/*
          The width clamp lives on each page root, not here: the waterfall
          builder needs the full viewport for its step list plus side rail,
          while the list pages stay readable at max-w-5xl.
        */}
        <main className="px-6 py-8">{children}</main>
        <TooltipLayer />
      </body>
    </html>
  );
}
