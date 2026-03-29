import type { Metadata } from "next";
import localFont from "next/font/local";

import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { ClientProviders } from "@/components/providers/client-providers";
import { QuickInventoryPanel } from "@/components/quick-inventory-panel";
import { RecentOpenings } from "@/components/recent-openings";

const gemunuLibre = localFont({
  src: "./GemunuLibre-SemiBold.otf",
  variable: "--font-geist-sans",
  display: "swap",
});



export const metadata: Metadata = {
  title: "CrateFront",
  description: "Open chests, collect NFTs, sell in the shop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${gemunuLibre.variable} ${gemunuLibre.className}`}
    >
      <body className="antialiased [--app-header-h:4rem]">
        <div className="min-h-screen bg-[url('/bg.jpeg')] bg-cover bg-center bg-fixed">
          <div className="min-h-screen bg-black/45">
            <ClientProviders>
              <Navbar />
              <RecentOpenings />
              <QuickInventoryPanel />
              <main className="container mx-auto max-w-5xl px-4 py-8">
                {children}
              </main>
            </ClientProviders>
          </div>
        </div>
      </body>
    </html>
  );
}
