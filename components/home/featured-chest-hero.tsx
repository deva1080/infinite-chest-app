"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Coins, Gauge, Lock, Sparkles } from "lucide-react";

import { RunicBackdrop } from "@/components/runic-backdrop";
import { formatKeys } from "@/lib/format";

import type { HomeChestCardData } from "./chest-card";

const QUICK_OPEN_PRESETS = [1, 5, 10] as const;

type FeaturedChestHeroProps = {
  chest: HomeChestCardData;
};

export function FeaturedChestHero({ chest }: FeaturedChestHeroProps) {
  const [selectedQty, setSelectedQty] = useState<(typeof QUICK_OPEN_PRESETS)[number]>(
    1,
  );

  const totalPrice = useMemo(
    () => chest.price * BigInt(selectedQty),
    [chest.price, selectedQty],
  );
  const titleParts = chest.title.trim().split(/\s+/);
  const titleAccent = titleParts.at(-1) ?? chest.title;
  const titleBase = titleParts.slice(0, -1).join(" ");
  const riskLabel =
    chest.volatility >= 5
      ? "Extreme"
      : chest.volatility >= 4
        ? "High"
        : chest.volatility >= 3
          ? "Medium"
          : chest.volatility >= 2
            ? "Low"
            : "Safe";
  const maxWinLabel = chest.bestDrop ? `${formatKeys(chest.bestDrop.sellPrice)} KEY` : "--";

  return (
    <section
      className="home-panel relative overflow-hidden rounded-[1.75rem] px-4 py-5 text-white sm:px-6 sm:py-6"
      style={
        {
          "--card-accent": chest.accentFrom,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.35), 0 0 60px ${chest.glowColor}`,
        } as React.CSSProperties
      }
    >
      <RunicBackdrop
        accentFrom={chest.accentFrom}
        accentTo={chest.accentTo}
        intensity="low"
      />
      <div className="game-scanlines pointer-events-none absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_26%),radial-gradient(circle_at_75%_30%,rgba(255,255,255,0.06),transparent_18%)]" />

      <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="flex min-w-0 h-full flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="home-section-label">Featured chest</span>
            <span className="home-chip">{chest.typeLabel}</span>
            {chest.bestDrop && <span className="home-chip">best {chest.bestDrop.dropPct}% odds</span>}
          </div>

          <div className="mb-3">
            <h1 className="text-3xl font-bold uppercase leading-[0.95] tracking-[0.08em] text-white sm:text-5xl">
              {titleBase && <span>{titleBase} </span>}
              <span
                className="bg-gradient-to-b from-[#d9f4ff] via-[#66b9ff] to-[#2563eb] bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(56,189,248,0.22)]"
              >
                {titleAccent}
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/62 sm:text-base">
              {chest.subtitle}. Hand-picked featured loot flow with premium rewards,
              fast access to the opening screen and a curated preview of what can drop.
            </p>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="flex min-h-[118px] flex-col justify-center rounded-2xl border border-white/10 bg-black/18 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">
                Top drop
              </p>
              <p className="mt-1.5 truncate text-[1.9rem] leading-none font-bold text-white">
                NFT #{chest.bestDrop?.tokenId.toString() ?? "--"}
              </p>
             
            </div>
            <div className="flex min-h-[118px] flex-col justify-center rounded-2xl border border-white/10 bg-black/18 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">
                Max win
              </p>
              <p className="mt-2 truncate text-[2rem] leading-none font-bold text-emerald-400">
                {maxWinLabel}
              </p>
            </div>
            <div className="flex min-h-[118px] flex-col justify-center rounded-2xl border border-white/10 bg-black/18 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">
                Risk
              </p>
              <p className="mt-2 truncate text-[2rem] leading-none font-bold uppercase text-amber-300">
                {riskLabel}
              </p>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-10">
            <Link
              href={`/game?configId=${chest.configId}`}
              className="game-cta-btn group inline-flex sm:col-span-7"
            >
              <span
                className="relative flex h-[58px] w-full items-center justify-center gap-2 overflow-hidden rounded-xl border px-5 text-sm font-bold uppercase tracking-[0.14em]"
                style={{
                  background: `linear-gradient(135deg, ${chest.accentFrom}, ${chest.accentTo})`,
                  borderColor: `${chest.accentFrom}40`,
                  boxShadow: `0 0 20px ${chest.glowColor}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}
              >
                <span className="relative z-10">Open x{selectedQty}</span>
                <Lock className="relative z-10 h-3.5 w-3.5 text-white/70" />
                <div className="game-cta-shimmer pointer-events-none absolute inset-0" />
              </span>
            </Link>

            <div className="flex h-[58px] min-w-0 flex-col justify-center rounded-xl border border-white/10 bg-black/26 px-4 sm:col-span-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">
                Cost
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <Coins className="h-4 w-4" style={{ color: chest.accentFrom }} />
                <span className="text-lg font-bold text-white">
                  {formatKeys(totalPrice)} KEY
                </span>
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
              Quick open
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {QUICK_OPEN_PRESETS.map((qty) => {
                const isActive = qty === selectedQty;
                return (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setSelectedQty(qty)}
                    className="min-w-[54px] rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition-colors"
                    style={{
                      borderColor: isActive ? `${chest.accentFrom}75` : "rgba(255,255,255,0.08)",
                      background: isActive ? `${chest.accentFrom}1f` : "rgba(255,255,255,0.04)",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                    }}
                  >
                    x{qty}
                  </button>
                );
              })}
            </div>
            <Link
              href={`/game?configId=${chest.configId}`}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/42 transition-colors hover:text-white/80"
            >
              View odds
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%)]" />
          <div
            className="absolute inset-x-8 bottom-6 h-14 rounded-full blur-3xl"
            style={{ background: chest.accentFrom, opacity: 0.28 }}
          />

          <div className="relative flex h-full min-h-[360px] items-center justify-center p-2 sm:p-4">
            <div className="absolute left-5 top-5 z-20 rounded-lg border border-white/8 bg-black/28 px-3 py-2 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">
                Top reward
              </p>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: chest.accentFrom }} />
                <span className="max-w-[9rem] truncate text-sm font-semibold text-white/88">
                  {chest.bestDrop?.name ?? "Unknown"}
                </span>
              </div>
            </div>

            <div className="absolute bottom-5 right-5 z-20 rounded-lg border border-white/8 bg-black/28 px-3 py-2 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">
                Drop profile
              </p>
              <div className="mt-1 flex items-center gap-2 text-sm text-white/82">
                <Gauge className="h-4 w-4" style={{ color: chest.accentFrom }} />
                <span>{chest.dropCount} mapped rewards</span>
              </div>
            </div>

            <div className="relative z-10 h-[340px] w-full sm:h-[420px]">
              <Image
                src={chest.chestImage}
                alt={chest.title}
                fill
                className="object-contain scale-[1.08] drop-shadow-[0_24px_44px_rgba(0,0,0,0.58)] sm:scale-[1.14]"
                unoptimized
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
