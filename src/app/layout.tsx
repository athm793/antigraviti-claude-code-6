import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
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
        <header className="border-b border-[#1a1a28] px-6 py-4 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 no-underline min-h-[44px]">
            <div className="w-7 h-7 rounded-md bg-[#00C4B4] flex items-center justify-center text-black font-bold text-sm">
              K
            </div>
            <span className="font-semibold text-white">KeyProxy</span>
          </a>
          <span className="text-[#2a2a38] hidden sm:inline">|</span>
          <span className="text-[#8b8b9e] text-sm hidden sm:inline">API Key Rotation Proxy</span>
          <UserMenu user={user} />
        </header>
        <main className="px-6 py-8 max-w-5xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
