export type RarityTier = "common" | "rare" | "epic" | "legendary";

export type ChestMeta = {
  title: string;
  subtitle: string;
  chestImage: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
};

const registry: Record<number, ChestMeta> = {
  0: {
    title: "Cyber Core #0",
    subtitle: "High-tech drops",
    chestImage: "/chesties/0.webp",
    accentFrom: "#06b6d4",
    accentTo: "#8b5cf6",
    glowColor: "rgba(34,211,238,0.35)",
  },
  1: {
    title: "Cyber Core #1",
    subtitle: "High-tech drops",
    chestImage: "/chesties/1.webp",
    accentFrom: "#f59e0b",
    accentTo: "#ef4444",
    glowColor: "rgba(245,158,11,0.35)",
  },
  2: {
    title: "Cyber Core #2",
    subtitle: "Rare artifacts",
    chestImage: "/chesties/2.webp",
    accentFrom: "#ec4899",
    accentTo: "#8b5cf6",
    glowColor: "rgba(236,72,153,0.35)",
  },
  3: {
    title: "Cyber Core #3",
    subtitle: "Elite collection",
    chestImage: "/chesties/3.webp",
    accentFrom: "#22c55e",
    accentTo: "#06b6d4",
    glowColor: "rgba(34,197,94,0.35)",
  },
  4: {
    title: "Cyber Core #4",
    subtitle: "Legendary vault",
    chestImage: "/chesties/4.webp",
    accentFrom: "#a855f7",
    accentTo: "#3b82f6",
    glowColor: "rgba(168,85,247,0.35)",
  },
};

const fallback: ChestMeta = {
  title: "Unknown Chest",
  subtitle: "Mystery drops",
  chestImage: "/chesties/0.webp",
  accentFrom: "#06b6d4",
  accentTo: "#8b5cf6",
  glowColor: "rgba(34,211,238,0.35)",
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
