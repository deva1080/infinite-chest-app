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

const registry: Record<number, ChestMeta> = {
  0: {
    title: "Neon Core Cache",
    subtitle: "High-tech drops",
    chestImage: "/chesties/0.webp",
    accentFrom: "#06b6d4",
    accentTo: "#8b5cf6",
    glowColor: "rgba(34,211,238,0.35)",
    hud: { coreTemp: "34C", blockHeight: "12,894,321", hashRate: "14.2 TH/s" },
  },
  1: {
    title: "Cipher Drift Crate",
    subtitle: "High-tech drops",
    chestImage: "/chesties/1.webp",
    accentFrom: "#f59e0b",
    accentTo: "#ef4444",
    glowColor: "rgba(245,158,11,0.35)",
    hud: { coreTemp: "67C", blockHeight: "13,102,458", hashRate: "9.8 TH/s" },
  },
  2: {
    title: "Astral Relay Chest",
    subtitle: "Rare artifacts",
    chestImage: "/chesties/2.webp",
    accentFrom: "#ec4899",
    accentTo: "#8b5cf6",
    glowColor: "rgba(236,72,153,0.35)",
    hud: { coreTemp: "42C", blockHeight: "13,207,891", hashRate: "11.6 TH/s" },
  },
  3: {
    title: "Chrono Vault Prime",
    subtitle: "Elite collection",
    chestImage: "/chesties/3.webp",
    accentFrom: "#22c55e",
    accentTo: "#06b6d4",
    glowColor: "rgba(34,197,94,0.35)",
    hud: { coreTemp: "29C", blockHeight: "13,450,112", hashRate: "18.4 TH/s" },
  },
  4: {
    title: "Voidforge Reliquary",
    subtitle: "Legendary vault",
    chestImage: "/chesties/4.webp",
    accentFrom: "#a855f7",
    accentTo: "#3b82f6",
    glowColor: "rgba(168,85,247,0.35)",
    hud: { coreTemp: "55C", blockHeight: "13,891,007", hashRate: "22.1 TH/s" },
  },
};

const fallback: ChestMeta = {
  title: "Unknown Chest",
  subtitle: "Mystery drops",
  chestImage: "/chesties/0.webp",
  accentFrom: "#06b6d4",
  accentTo: "#8b5cf6",
  glowColor: "rgba(34,211,238,0.35)",
  hud: { coreTemp: "0C", blockHeight: "0", hashRate: "0 TH/s" },
};

export function getChestMeta(configId: number): ChestMeta {
  return registry[configId] ?? { ...fallback, title: `Chest #${configId}` };
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
