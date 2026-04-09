"use client";

import Image from "next/image";
import Link from "next/link";
import { Coins, Lock, Sparkles } from "lucide-react";

import { DeepSpaceBg } from "@/components/deep-space-bg";
import { TokenImage } from "@/components/token-image";
import { formatKeys } from "@/lib/format";

export type HomeRewardPreview = {
  tokenId: bigint;
  name: string;
  imageSrc: string;
  dropPct: number;
  sellPrice: bigint;
};

export type HomeChestCardData = {
  configId: number;
  configName: string;
  title: string;
  subtitle: string;
  chestImage: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  price: bigint;
  priceValue: number;
  dropCount: number;
  bonusCount: number;
  hasBonus: boolean;
  volatility: 0 | 1 | 2 | 3 | 4 | 5;
  limited: boolean;
  rarity: "common" | "rare" | "epic" | "legendary" | "infinite";
  typeLabel: "standard" | "premium" | "bonus";
  bestDrop: HomeRewardPreview | null;
  topDrops: HomeRewardPreview[];
};

type ChestCardProps = {
  chest: HomeChestCardData;
};

export function ChestCard({ chest }: ChestCardProps) {
  return (
    <article
      className="chest-card home-grid-card relative mx-auto flex h-full w-full max-w-[320px] flex-col overflow-hidden rounded-[1.35rem] text-white"
      style={
        {
          "--card-accent": chest.accentFrom,
          boxShadow: `0 0 0 1px rgba(100,120,150,0.25), 0 4px 24px rgba(0,0,0,0.5), 0 0 40px ${chest.glowColor}`,
        } as React.CSSProperties
      }
    >
      <div className="chest-card-frame" />
      <div className="chest-card-corner tl" />
      <div className="chest-card-corner tr" />
      <div className="chest-card-corner bl" />
      <div className="chest-card-corner br" />
      <DeepSpaceBg starCount={46} speed={0.08} opacity={0.28} />

      <div className="relative z-[4] flex h-full flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="home-chip">{chest.typeLabel}</span>
              {chest.bestDrop && (
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  {chest.bestDrop.dropPct}% top odds
                </span>
              )}
            </div>
            <h3 className="truncate text-base font-bold uppercase tracking-[0.12em]">
              {chest.title}
            </h3>
            <p className="mt-0.5 text-[11px] text-white/58">{chest.subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1">
            <Coins className="h-3 w-3" style={{ color: chest.accentFrom }} />
            <span className="text-[9px] font-bold tabular-nums text-white/70">
              {formatKeys(chest.price)} KEY
            </span>
          </div>
        </div>

        <div
          className="relative mb-4 overflow-hidden rounded-[1rem] border border-white/[0.08]"
          style={{
            background: `radial-gradient(ellipse at 50% 55%, ${chest.accentFrom}18 0%, transparent 65%), linear-gradient(to bottom, #0c0f1f 0%, #080a18 100%)`,
            boxShadow: `inset 0 0 40px ${chest.accentFrom}10, inset 0 -8px 24px ${chest.accentTo}08`,
          }}
        >
          <div className="relative h-44">
            <Image
              src={chest.chestImage}
              alt={chest.title}
              fill
              className="translate-y-3 scale-[1.38] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
              unoptimized
            />
            <div
              className="absolute bottom-2 left-1/2 h-12 w-[72%] -translate-x-1/2 rounded-full blur-2xl"
              style={{ background: chest.accentFrom, opacity: 0.2 }}
            />
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div
            className="h-px flex-1"
            style={{
              background: `linear-gradient(90deg, ${chest.accentFrom}25, transparent)`,
            }}
          />
          <span
            className="text-[8px] font-bold uppercase tracking-[0.2em]"
            style={{ color: `${chest.accentFrom}80` }}
          >
            Possible rewards
          </span>
          <div
            className="h-px flex-1"
            style={{
              background: `linear-gradient(90deg, transparent, ${chest.accentFrom}25)`,
            }}
          />
        </div>

        <div className="mb-4 flex items-center gap-2 overflow-hidden">
          {chest.topDrops.slice(0, 4).map((drop) => (
            <div
              key={drop.tokenId.toString()}
              className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40"
            >
              <TokenImage
                src={drop.imageSrc}
                alt={drop.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ))}
          <div className="min-w-0 flex-1">
            {chest.bestDrop ? (
              <>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72">
                  Best drop
                </p>
                <div className="flex items-center gap-1.5">
                  <Sparkles
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: chest.accentFrom }}
                  />
                  <span className="truncate text-xs text-white/80">
                    {chest.bestDrop.name}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-white/45">No rewards loaded yet.</p>
            )}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/38">
          <span>{chest.dropCount} drops</span>
          <span>{chest.bonusCount} bonus</span>
        </div>

        <Link href={`/game?configId=${chest.configId}`} className="group mt-auto">
          <div
            className="relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border py-2.5 text-center text-sm font-bold uppercase tracking-[0.14em] transition-all hover:brightness-110"
            style={{
              background: `linear-gradient(135deg, ${chest.accentFrom}, ${chest.accentTo})`,
              borderColor: `${chest.accentFrom}40`,
              boxShadow: `0 0 16px ${chest.glowColor}, inset 0 1px 0 rgba(255,255,255,0.15)`,
            }}
          >
            <span className="relative z-10 text-white">Open chest</span>
            <Lock className="relative z-10 h-3.5 w-3.5 text-white/60" />
            <div className="game-cta-shimmer pointer-events-none absolute inset-0" />
          </div>
        </Link>
      </div>
    </article>
  );
}
