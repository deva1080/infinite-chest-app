"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

const footerColumns = [
  {
    title: "Platform",
    links: [
      { href: "/", label: "Chests" },
      { href: "/collections", label: "Collections" },
      { href: "/referrals", label: "Referrals" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/game?configId=0", label: "Open featured" },
      { href: "/collections", label: "Inventory" },
      { href: "/referrals", label: "Rewards" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "#", label: "Help center" },
      { href: "#", label: "Contact" },
      { href: "#", label: "Privacy" },
    ],
  },
] as const;

export function HomeFooter() {
  return (
    <footer className="home-panel rounded-[1.75rem] px-5 py-6 text-white">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div>
          <p className="home-section-label">Infinite chest</p>
          <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
            Open. Earn. Repeat.
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/48">
            The homepage now behaves like a landing dashboard: featured action up
            top, reward previews in the middle and the full chest catalog below.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
                {column.title}
              </h3>
              <div className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm text-white/68 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/24 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
            Stay updated
          </h3>
          <p className="mt-2 text-sm text-white/48">
            Keep the footer structure from the wireframe without wiring a real
            mailing flow yet.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 p-2">
            <input
              type="email"
              placeholder="Your email"
              className="w-full bg-transparent px-2 text-sm text-white placeholder:text-white/25 outline-none"
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 transition-colors hover:bg-white/[0.08]"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
