import { getLocalConfig } from "./chest-configs";

export type RarityTier = "common" | "rare" | "epic" | "legendary";

export type HudTelemetry = {
  coreTemp: string;
  blockHeight: string;
  hashRate: string;
};

export type ChestMeta = {
  title: string;
  subtitle: string;
  chestImage: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  hud: HudTelemetry;
};

type VolatilityTheme = {
  subtitle: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  hud: HudTelemetry;
};

const themeByVolatility: Record<number, VolatilityTheme> = {
  1: {
    subtitle: "Steady returns",
    accentFrom: "#06b6d4",
    accentTo: "#22d3ee",
    glowColor: "rgba(34,211,238,0.35)",
    hud: { coreTemp: "28C", blockHeight: "14,201,003", hashRate: "8.4 TH/s" },
  },
  2: {
    subtitle: "Balanced risk",
    accentFrom: "#22c55e",
    accentTo: "#06b6d4",
    glowColor: "rgba(34,197,94,0.35)",
    hud: { coreTemp: "42C", blockHeight: "14,305,117", hashRate: "12.6 TH/s" },
  },
  3: {
    subtitle: "High variance",
    accentFrom: "#f59e0b",
    accentTo: "#ef4444",
    glowColor: "rgba(245,158,11,0.35)",
    hud: { coreTemp: "58C", blockHeight: "14,410,882", hashRate: "18.1 TH/s" },
  },
  4: {
    subtitle: "Extreme swings",
    accentFrom: "#ec4899",
    accentTo: "#8b5cf6",
    glowColor: "rgba(236,72,153,0.35)",
    hud: { coreTemp: "71C", blockHeight: "14,592,440", hashRate: "24.7 TH/s" },
  },
  5: {
    subtitle: "Maximum chaos",
    accentFrom: "#a855f7",
    accentTo: "#3b82f6",
    glowColor: "rgba(168,85,247,0.35)",
    hud: { coreTemp: "89C", blockHeight: "14,780,991", hashRate: "33.3 TH/s" },
  },
};

const defaultTheme: VolatilityTheme = themeByVolatility[1];

export function getChestMeta(configId: number): ChestMeta {
  const cfg = getLocalConfig(configId);
  const theme = themeByVolatility[cfg?.volatility ?? 0] ?? defaultTheme;

  return {
    title: cfg?.name ?? `Chest #${configId}`,
    subtitle: theme.subtitle,
    chestImage: `/chesties/${configId}.webp`,
    accentFrom: theme.accentFrom,
    accentTo: theme.accentTo,
    glowColor: theme.glowColor,
    hud: theme.hud,
  };
}

export function getRarityTier(pct: number): RarityTier {
  if (pct <= 3) return "legendary";
  if (pct <= 12) return "epic";
  if (pct <= 25) return "rare";
  return "common";
}

export const RARITY_COLORS: Record<RarityTier, { border: string; bg: string; text: string; glow: string }> = {
  common: { border: "border-cyan-400/40", bg: "bg-cyan-500/12", text: "text-cyan-300", glow: "rgba(34,211,238,0.2)" },
  rare: { border: "border-blue-400/50", bg: "bg-blue-500/14", text: "text-blue-300", glow: "rgba(59,130,246,0.25)" },
  epic: { border: "border-purple-400/50", bg: "bg-purple-500/16", text: "text-purple-300", glow: "rgba(168,85,247,0.3)" },
  legendary: { border: "border-amber-400/60", bg: "bg-amber-500/18", text: "text-amber-300", glow: "rgba(245,158,11,0.35)" },
};

export const RARITY_LABELS: Record<RarityTier, string> = {
  common: "COMMON",
  rare: "RARE",
  epic: "EPIC",
  legendary: "LEGENDARY",
};
