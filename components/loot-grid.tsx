"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";

import { RewardArtFrame } from "@/components/reward-art-frame";
import {
  getTokenImageFromCatalog,
  getTokenDisplayName,
  isBonusTokenId,
} from "@/lib/item-catalog";
import { formatKeys } from "@/lib/format";
import { getRarityTier, RARITY_COLORS, RARITY_LABELS } from "@/lib/chest-meta";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/lib/hooks/use-animated-number";
import { useGameSounds } from "@/lib/hooks/use-game-sounds";
import { FloatingValue } from "@/components/floating-value";
import { formatUnits } from "viem";

export type RevealItem = {
  tokenId: bigint;
  sellPrice: bigint;
  dropPct: number;
  index: number;
};

type Props = {
  configId: number;
  items: RevealItem[];
  paidCount: number;
  bonusCount: number;
  onRevealComplete: () => void;
  accentFrom: string;
};

function getGridCols(count: number): string {
  if (count <= 1) return "grid-cols-2";
  if (count <= 4) return "grid-cols-4";
  if (count <= 9) return "grid-cols-5";
  if (count <= 25) return "grid-cols-6";
  return "grid-cols-7";
}

function getRevealDelay(total: number): number {
  if (total <= 1) return 500;
  if (total <= 5) return 400;
  if (total <= 10) return 280;
  if (total <= 25) return 180;
  return 120;
}

const FLOAT_VALUE_DURATION_MS = 2600;
const BONUS_SEPARATOR_PAUSE_MS = 900;

type RevealPhaseInternal = "paid" | "bonus-separator" | "bonus" | "done";

export function LootGrid({
  configId,
  items,
  paidCount,
  bonusCount,
  onRevealComplete,
  accentFrom,
}: Props) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [activeFloatIndexes, setActiveFloatIndexes] = useState<number[]>([]);
  const [internalPhase, setInternalPhase] = useState<RevealPhaseInternal>("paid");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const floatTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);

  const hasBonusPhase = bonusCount > 0 && paidCount > 0;
  const paidItems = useMemo(() => items.slice(0, paidCount), [items, paidCount]);
  const bonusItems = useMemo(() => items.slice(paidCount), [items, paidCount]);

  const {
    playRevealClink,
    playBonusChime,
    playBonusTransition,
    playOpenComplete,
  } = useGameSounds();

  const runningTotalBigint = useMemo(() => {
    let total = BigInt(0);
    for (let i = 0; i < revealedCount; i++) {
      total += items[i].sellPrice;
    }
    return total;
  }, [items, revealedCount]);

  const runningTotalFloat = Number(formatUnits(runningTotalBigint, 18));
  const totalCountUpMs = useMemo(
    () => Math.min(1200, 380 + items.length * 60),
    [items.length],
  );
  const animatedTotal = useAnimatedNumber(runningTotalFloat, totalCountUpMs);

  const [totalPopKey, setTotalPopKey] = useState(0);
  const totalSettledRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    for (const timer of floatTimersRef.current) {
      clearTimeout(timer);
    }
    floatTimersRef.current = [];
  }, []);

  const startPhaseReveal = useCallback(
    (startIdx: number, count: number, onPhaseDone: () => void) => {
      if (count === 0) {
        onPhaseDone();
        return;
      }
      const delay = getRevealDelay(count);
      let revealed = 0;

      timerRef.current = setInterval(() => {
        revealed++;
        const globalIdx = startIdx + revealed;
        setRevealedCount(globalIdx);

        if (revealed >= count) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          onPhaseDone();
        }
      }, delay);
    },
    [],
  );

  useEffect(() => {
    if (items.length === 0) return;
    setRevealedCount(0);
    setActiveFloatIndexes([]);
    setInternalPhase("paid");
    completedRef.current = false;
    totalSettledRef.current = false;
    setTotalPopKey(0);
    clearAllTimers();

    const effectivePaidCount = hasBonusPhase ? paidCount : items.length;

    startPhaseReveal(0, effectivePaidCount, () => {
      if (!hasBonusPhase) {
        if (!completedRef.current) {
          completedRef.current = true;
          playOpenComplete();
          setTimeout(onRevealComplete, 400);
        }
        return;
      }

      setInternalPhase("bonus-separator");
      playBonusTransition();

      const sepTimer = setTimeout(() => {
        setInternalPhase("bonus");
        startPhaseReveal(paidCount, bonusCount, () => {
          if (!completedRef.current) {
            completedRef.current = true;
            setInternalPhase("done");
            playOpenComplete();
            setTimeout(onRevealComplete, 400);
          }
        });
      }, BONUS_SEPARATOR_PAUSE_MS);
      floatTimersRef.current.push(sepTimer);
    });

    return clearAllTimers;
  }, [
    items,
    paidCount,
    bonusCount,
    hasBonusPhase,
    onRevealComplete,
    startPhaseReveal,
    clearAllTimers,
    playBonusTransition,
    playOpenComplete,
  ]);

  useEffect(() => {
    const justRevealedIndex = revealedCount - 1;
    if (justRevealedIndex < 0) return;

    const item = items[justRevealedIndex];
    if (item && isBonusTokenId(item.tokenId)) {
      playBonusChime();
    } else {
      playRevealClink();
    }

    setActiveFloatIndexes((prev) =>
      prev.includes(justRevealedIndex) ? prev : [...prev, justRevealedIndex],
    );

    const timer = setTimeout(() => {
      setActiveFloatIndexes((prev) => prev.filter((idx) => idx !== justRevealedIndex));
      floatTimersRef.current = floatTimersRef.current.filter((t) => t !== timer);
    }, FLOAT_VALUE_DURATION_MS);

    floatTimersRef.current.push(timer);
  }, [revealedCount, items, playRevealClink, playBonusChime]);

  useEffect(() => {
    if (items.length === 0) return;
    if (revealedCount !== items.length) {
      totalSettledRef.current = false;
      return;
    }
    if (totalSettledRef.current) return;
    if (Math.abs(animatedTotal - runningTotalFloat) < 0.012) {
      totalSettledRef.current = true;
      setTotalPopKey((k) => k + 1);
    }
  }, [
    items.length,
    revealedCount,
    animatedTotal,
    runningTotalFloat,
  ]);

  const showSeparator =
    hasBonusPhase &&
    (internalPhase === "bonus-separator" ||
      internalPhase === "bonus" ||
      internalPhase === "done");

  const showBonusGrid =
    hasBonusPhase &&
    (internalPhase === "bonus" || internalPhase === "done");

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Paid phase grid */}
      <ItemGrid
        items={paidItems}
        globalOffset={0}
        revealedCount={revealedCount}
        activeFloatIndexes={activeFloatIndexes}
        configId={configId}
        isGolden={false}
      />

      {/* Bonus separator */}
      {showSeparator && (
        <div className="game-bonus-separator-enter flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          <div className="flex items-center gap-2">
            <span className="game-bonus-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="game-bonus-dot h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animationDelay: "0.15s" }} />
            <span className="game-bonus-dot h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animationDelay: "0.3s" }} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
            +{bonusCount} Bonus Opens
          </span>
          <div className="flex items-center gap-2">
            <span className="game-bonus-dot h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animationDelay: "0.3s" }} />
            <span className="game-bonus-dot h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animationDelay: "0.15s" }} />
            <span className="game-bonus-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        </div>
      )}

      {/* Bonus phase grid */}
      {showBonusGrid && (
        <div className="game-bonus-phase-wrapper relative overflow-hidden rounded-xl border border-amber-400/20 px-2 pb-2 pt-1">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-500/[0.06] to-transparent" />
          <ItemGrid
            items={bonusItems}
            globalOffset={paidCount}
            revealedCount={revealedCount}
            activeFloatIndexes={activeFloatIndexes}
            configId={configId}
            isGolden
          />
        </div>
      )}

      {/* Running total — hero readout + pop when count-up settles */}
      <div
        className="relative mt-1 flex w-full flex-col items-center gap-1 rounded-2xl border border-white/14 bg-black/40 px-4 py-3 backdrop-blur-md sm:py-4"
        style={{
          borderColor: `color-mix(in srgb, ${accentFrom} 42%, transparent)`,
          boxShadow: `0 0 36px color-mix(in srgb, ${accentFrom} 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.07)`,
        }}
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/50 sm:text-xs">
          Total
        </span>
        <span
          key={totalPopKey}
          className={cn(
            "inline-block font-black tabular-nums tracking-tight text-green-300",
            "text-[1.65rem] leading-none sm:text-3xl",
            totalPopKey > 0 && "game-total-value-pop",
          )}
          style={{
            textShadow:
              "0 0 14px rgba(134,239,172,0.45), 0 0 28px rgba(74,222,128,0.2)",
          }}
        >
          {animatedTotal.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          <span className="text-[0.55em] font-bold uppercase tracking-widest text-green-400/90">
            KEY
          </span>
        </span>
        <span className="text-[10px] tabular-nums text-white/35">
          {revealedCount}/{items.length} reveals
        </span>
      </div>
    </div>
  );
}

type ItemGridProps = {
  items: RevealItem[];
  globalOffset: number;
  revealedCount: number;
  activeFloatIndexes: number[];
  configId: number;
  isGolden: boolean;
};

function ItemGrid({
  items,
  globalOffset,
  revealedCount,
  activeFloatIndexes,
  configId,
  isGolden,
}: ItemGridProps) {
  const gridCols = getGridCols(items.length);

  return (
    <div className={cn("relative grid gap-1.5", gridCols)}>
      {items.map((item, localIdx) => {
        const globalIdx = globalOffset + localIdx;
        const isRevealed = globalIdx < revealedCount;
        const showFloatValue = activeFloatIndexes.includes(globalIdx);
        const isBonus = isBonusTokenId(item.tokenId);
        const tier = isBonus ? "legendary" : getRarityTier(item.dropPct);
        const colors = RARITY_COLORS[tier];

        return (
          <div
            key={`${item.tokenId}-${globalIdx}`}
            className={cn(
              "relative overflow-hidden rounded-lg border transition-all",
              isRevealed
                ? isBonus
                  ? "game-bonus-card game-loot-card-reveal border-amber-400/50"
                  : `game-loot-card-reveal ${colors.border}`
                : "game-loot-card-hidden border-white/[0.06]",
              isGolden && isRevealed && !isBonus && "game-bonus-phase-card",
            )}
            style={
              isRevealed
                ? {
                    boxShadow: isGolden
                      ? `0 0 12px rgba(245,158,11,0.25), 0 0 6px ${colors.glow}`
                      : `0 0 10px ${colors.glow}`,
                  }
                : undefined
            }
          >
            {isRevealed ? (
              <div className="relative aspect-square">
                <RewardArtFrame
                  src={getTokenImageFromCatalog(item.tokenId, configId)}
                  alt={getTokenDisplayName(item.tokenId)}
                  isBonus={isBonus}
                  showBottomFade
                />
                <span
                  className={cn(
                    "absolute left-0.5 top-0.5 rounded px-1 py-px text-[7px] font-extrabold uppercase tracking-wider",
                    colors.text,
                  )}
                  style={{ background: "rgba(0,0,0,0.6)" }}
                >
                  {isBonus ? "BONUS" : RARITY_LABELS[tier]}
                </span>

                <div className="absolute inset-x-0 bottom-0 px-1 pb-0.5 text-center">
                  <p className="truncate text-[8px] font-semibold leading-tight text-white/90">
                    {getTokenDisplayName(item.tokenId)}
                  </p>
                  <p className="text-[7px] leading-tight text-white/50">
                    {isBonus
                      ? "FREE OPENS"
                      : `${formatKeys(item.sellPrice)} KEY`}
                  </p>
                </div>

                {showFloatValue && (
                  <FloatingValue
                    text={isBonus ? "+BONUS" : `+${formatKeys(item.sellPrice)}`}
                    color={isBonus ? "#fbbf24" : "#4ade80"}
                  />
                )}
              </div>
            ) : (
              <div
                className={cn(
                  "aspect-square",
                  isGolden ? "bg-amber-900/20" : "bg-[#080c14]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
