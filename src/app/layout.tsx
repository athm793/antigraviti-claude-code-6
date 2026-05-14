import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#08080f] text-white`}>
        <header className="border-b border-[#1a1a28] px-6 py-4 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-7 h-7 rounded-md bg-[#00C4B4] flex items-center justify-center text-black font-bold text-sm">
              K
            </div>
            <span className="font-semibold text-white">KeyProxy</span>
          </a>
          <span className="text-[#2a2a38]">|</span>
          <span className="text-[#8b8b9e] text-sm">API Key Rotation Proxy</span>
        </header>
        <main className="px-6 py-8 max-w-5xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
