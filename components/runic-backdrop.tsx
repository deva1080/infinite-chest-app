"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";

const RUNIC_CHARS =
  "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛝᛟᛞ" +
  "𐰀𐰁𐰂𐰃𐰄𐰅𐰆𐰇𐰈𐰉𐰊𐰋𐰌𐰍𐰎𐰏𐰐𐰑𐰒𐰓𐰔𐰕𐰖𐰗𐰘𐰙𐰚";

const ALL_GLYPHS = [...RUNIC_CHARS];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePhrase(minLen: number, maxLen: number): string {
  const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
  let phrase = "";
  for (let i = 0; i < len; i++) {
    if (i > 0 && Math.random() < 0.22) phrase += " ";
    phrase += pickRandom(ALL_GLYPHS);
  }
  return phrase;
}

type ColumnState = {
  phrase: string;
  revealed: number;
  erasing: boolean;
  pauseTicks: number;
};

const COL_COUNT = 56;
const PHRASE_MIN = 2;
const PHRASE_MAX = 18;
const ERASE_CHANCE = 0.06;

const INTENSITY_CFG = {
  low: {
    tickMs: 180,
    opacityBase: 0.16,
    opacityRevealBonus: 0.1,
    glowSpread: 10,
    pauseMin: 6,
    pauseMax: 16,
    blur: "0.4px",
    fontSize: { min: 11, range: 6 },
  },
  medium: {
    tickMs: 100,
    opacityBase: 0.3,
    opacityRevealBonus: 0.14,
    glowSpread: 16,
    pauseMin: 3,
    pauseMax: 10,
    blur: "0.2px",
    fontSize: { min: 12, range: 7 },
  },
  high: {
    tickMs: 55,
    opacityBase: 0.42,
    opacityRevealBonus: 0.18,
    glowSpread: 24,
    pauseMin: 1,
    pauseMax: 5,
    blur: "0px",
    fontSize: { min: 13, range: 8 },
  },
} as const;

type Intensity = keyof typeof INTENSITY_CFG;

type Props = {
  accentFrom: string;
  accentTo: string;
  intensity?: Intensity;
};

function seededPseudoRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

export function RunicBackdrop({
  accentFrom,
  accentTo,
  intensity = "medium",
}: Props) {
  const cfg = INTENSITY_CFG[intensity] ?? INTENSITY_CFG.medium;

  const [columns, setColumns] = useState<ColumnState[]>(() =>
    Array.from({ length: COL_COUNT }, () => ({
      phrase: generatePhrase(PHRASE_MIN, PHRASE_MAX),
      revealed: 0,
      erasing: false,
      pauseTicks: 0,
    })),
  );

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.pauseTicks > 0) {
          return { ...col, pauseTicks: col.pauseTicks - 1 };
        }

        if (col.erasing) {
          const next = col.revealed - 1;
          if (next <= 0) {
            return {
              phrase: generatePhrase(PHRASE_MIN, PHRASE_MAX),
              revealed: 0,
              erasing: false,
              pauseTicks:
                cfg.pauseMin +
                Math.floor(Math.random() * (cfg.pauseMax - cfg.pauseMin)),
            };
          }
          return { ...col, revealed: next };
        }

        if (col.revealed < col.phrase.length) {
          const nextRevealed = col.revealed + 1;
          if (nextRevealed >= col.phrase.length && Math.random() < 0.5) {
            return {
              ...col,
              revealed: nextRevealed,
              pauseTicks:
                cfg.pauseMin +
                Math.floor(Math.random() * (cfg.pauseMax - cfg.pauseMin)),
            };
          }
          if (Math.random() < ERASE_CHANCE && nextRevealed > 2) {
            return { ...col, revealed: nextRevealed, erasing: true };
          }
          return { ...col, revealed: nextRevealed };
        }

        return {
          ...col,
          erasing: true,
          pauseTicks:
            cfg.pauseMin +
            Math.floor(Math.random() * (cfg.pauseMax - cfg.pauseMin)),
        };
      }),
    );
  }, [cfg]);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(tick, cfg.tickMs);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [tick, cfg.tickMs]);

  const colPositions = useMemo(
    () =>
      Array.from({ length: COL_COUNT }, (_, i) => {
        const s1 = seededPseudoRandom(i + 1);
        const s2 = seededPseudoRandom(i + 50);
        const s3 = seededPseudoRandom(i + 100);
        return {
          left: `${4 + s1 * 92}%`,
          top: `${4 + s2 * 88}%`,
          rotate: `${-12 + s3 * 24}deg`,
          scale: 0.8 + seededPseudoRandom(i + 200) * 0.4,
          colorMix: i / (COL_COUNT - 1),
          isVertical: i % 4 === 0,
          fontSizeOffset: Math.floor(seededPseudoRandom(i + 300) * 100) % 100,
        };
      }),
    [],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[3] select-none overflow-hidden transition-opacity duration-700"
      style={{ opacity: intensity === "low" ? 0.75 : 1 }}
      aria-hidden
    >
      {columns.map((col, i) => {
        const pos = colPositions[i];
        const visibleText = col.phrase.slice(0, col.revealed);
        if (visibleText.length === 0) return null;

        const color = pos.colorMix < 0.5 ? accentFrom : accentTo;
        const revealPct = col.phrase.length > 0 ? col.revealed / col.phrase.length : 0;
        const fontSize = cfg.fontSize.min + (pos.fontSizeOffset % cfg.fontSize.range);

        return (
          <span
            key={i}
            className="runic-glyph-line absolute font-[NotoSansRunic,NotoSansOldTurkic,serif] leading-relaxed"
            style={{
              left: pos.left,
              top: pos.top,
              transform: `rotate(${pos.rotate}) scale(${pos.scale})`,
              color,
              opacity: cfg.opacityBase + revealPct * cfg.opacityRevealBonus,
              fontSize: `${fontSize}px`,
              letterSpacing: "0.18em",
              textShadow: `0 0 ${cfg.glowSpread}px ${color}, 0 0 ${cfg.glowSpread * 2}px ${color}60`,
              maxWidth: "45%",
              writingMode: pos.isVertical ? "vertical-rl" : "horizontal-tb",
              filter: `blur(${cfg.blur})`,
              transition: "opacity 0.5s ease, filter 0.5s ease, text-shadow 0.5s ease",
            }}
          >
            {visibleText}
            <span className="runic-cursor" style={{ color }} />
          </span>
        );
      })}
    </div>
  );
}
