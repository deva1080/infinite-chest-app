"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { TokenImage } from "@/components/token-image";
import { formatKeys } from "@/lib/format";
import { getAllLocalConfigs } from "@/lib/chest-configs";
import { isBonusTokenId, getTokenDisplayName } from "@/lib/item-catalog";
import {
  getRarityTier,
  RARITY_COLORS,
  RARITY_LABELS,
  type RarityTier,
} from "@/lib/chest-meta";
import { cn } from "@/lib/utils";

type RewardStripItem = {
  tokenId: bigint;
  configId: number;
  configName: string;
  imageSrc: string;
  fallbackSrc: string;
  name: string;
  dropPct: number;
  sellPrice: bigint;
  rarity: RarityTier;
};

function buildPool(): RewardStripItem[] {
  const items: RewardStripItem[] = [];

  for (const cfg of getAllLocalConfigs()) {
    const firstNonBonus = cfg.tokenIds.find((tid) => !isBonusTokenId(tid));
    const fallbackSrc = firstNonBonus
      ? `/collections/${cfg.configId}_${Number(firstNonBonus)}.webp`
      : "/collections/0_1.webp";

    for (let i = 0; i < cfg.tokenIds.length; i++) {
      const tokenId = cfg.tokenIds[i];
      if (isBonusTokenId(tokenId)) continue;

      const dropPct = cfg.dropPercentages[i] ?? 0;
      const sellPrice = cfg.sellPrices[i] ?? BigInt(0);

      items.push({
        tokenId,
        configId: cfg.configId,
        configName: cfg.name,
        imageSrc: `/collections/${cfg.configId}_${Number(tokenId)}.webp`,
        fallbackSrc,
        name: getTokenDisplayName(tokenId),
        dropPct,
        sellPrice,
        rarity: getRarityTier(dropPct),
      });
    }
  }

  // Fisher-Yates shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }

  return items;
}

// px width of each card + gap (must match the CSS below: w-[140px] + gap-2 = 148px)
const CARD_W = 148;

export function PossibleRewardsStrip() {
  const [pool] = useState<RewardStripItem[]>(() => buildPool());
  const [isPaused, setIsPaused] = useState(false);

  // doubled for seamless loop: animate 0 → -50% of total width
  const doubled = [...pool, ...pool];

  // duration: each card takes ~2.8s to scroll past
  const durationS = pool.length * 2.8;

  return (
    <section className="home-panel overflow-hidden rounded-[1.5rem] px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center gap-2">
        <p className="home-section-label">Live drops</p>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Rotating rewards
        </span>
      </div>

      {/* overflow-hidden clips the track so items outside are invisible */}
      <div
        className={cn("overflow-hidden", isPaused && "rewards-marquee-paused")}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          className="rewards-marquee-track flex gap-2"
          style={
            {
              "--marquee-duration": `${durationS}s`,
              width: `${doubled.length * CARD_W}px`,
            } as React.CSSProperties
          }
        >
          {doubled.map((item, i) => (
            <RewardCard key={`${i}-${item.tokenId.toString()}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RewardCard({ item }: { item: RewardStripItem }) {
  const [hovered, setHovered] = useState(false);
  const colors = RARITY_COLORS[item.rarity];

  return (
    <div
      className="relative w-[140px] shrink-0 overflow-hidden rounded-xl border bg-black/30 transition-[border-color,box-shadow] duration-200"
      style={{
        borderColor: hovered
          ? colors.glow.replace(/[\d.]+\)$/, "0.65)")
          : "rgba(255,255,255,0.08)",
        boxShadow: hovered ? `0 0 18px ${colors.glow}` : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* image */}
      <div className="relative aspect-square overflow-hidden">
        <TokenImage
          src={item.imageSrc}
          fallbackSrc={item.fallbackSrc}
          alt={item.name}
          fill
          className={cn(
            "object-cover transition-transform duration-300",
            hovered && "scale-[1.07]",
          )}
          unoptimized
        />
        {/* rarity badge */}
        <span
          className={cn(
            "absolute left-1 top-1 rounded px-1 py-px text-[8px] font-extrabold uppercase tracking-wider backdrop-blur-sm",
            colors.text,
          )}
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          {RARITY_LABELS[item.rarity]}
        </span>
      </div>

      {/* default footer */}
      <div className="px-1.5 py-1.5">
        <p className="truncate text-[9px] font-semibold text-white/60">{item.name}</p>
        <p className="text-[9px] text-white/35">{item.dropPct}%</p>
      </div>

      {/* hover panel — slides up from below */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 transition-transform duration-200 ease-out",
          hovered ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="bg-[#0d111c]/92 px-2 pb-2 pt-2 backdrop-blur-md">
          <p className="truncate text-[8px] font-semibold uppercase tracking-[0.1em] text-white/40">
            {item.configName}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-extrabold uppercase leading-tight text-white">
            {item.name}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-emerald-400">
            {formatKeys(item.sellPrice, 2)} KEY
          </p>
          <Link
            href={`/game?configId=${item.configId}`}
            className="mt-1.5 flex items-center justify-center gap-1 rounded-lg py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
            style={{
              background: `linear-gradient(135deg, ${colors.glow.replace(/[\d.]+\)$/, "0.55)")}, ${colors.glow.replace(/[\d.]+\)$/, "0.2)")})`,
            }}
          >
            Open chest
            <ArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>
        <div
          className="h-[3px] w-full"
          style={{ background: colors.glow.replace(/[\d.]+\)$/, "0.8)") }}
        />
      </div>
    </div>
  );
}
