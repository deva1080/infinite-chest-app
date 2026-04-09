import rawConfigs from "./chest-configs.json";

export type ChestConfigRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "infinite";

export type LocalChestConfig = {
  configId: number;
  name: string;
  bonus: boolean;
  volatility: 0 | 1 | 2 | 3 | 4 | 5;
  limited: boolean;
  rarity: ChestConfigRarity;
  token: string;
  price: bigint;
  weights: number[];
  multipliers: number[];
  tokenIds: bigint[];
  totalWeight: number;
  dropPercentages: number[];
  /** multiplier / 10_000 = actual value multiplier (e.g. 4919 -> 0.4919x) */
  sellPrices: bigint[];
};

const MULTIPLIER_BASE = BigInt(10_000);

function buildConfig(raw: (typeof rawConfigs)[number]): LocalChestConfig {
  const price = BigInt(raw.price);
  const tokenIds = raw.tokenIds.map((id) => BigInt(id));
  const totalWeight = raw.weights.reduce((s, w) => s + w, 0);

  const dropPercentages = raw.weights.map((w) =>
    totalWeight > 0 ? Math.round((w / totalWeight) * 10000) / 100 : 0,
  );

  const sellPrices = raw.multipliers.map((m) =>
    (price * BigInt(m)) / MULTIPLIER_BASE,
  );

  return {
    configId: raw.configId,
    name: raw.name,
    bonus: raw.bonus,
    volatility: (raw.volatility as 0 | 1 | 2 | 3 | 4 | 5),
    limited: raw.limited,
    rarity: (raw.rarity as ChestConfigRarity),
    token: raw.token,
    price,
    weights: raw.weights,
    multipliers: raw.multipliers,
    tokenIds,
    totalWeight,
    dropPercentages,
    sellPrices,
  };
}

const configs: LocalChestConfig[] = rawConfigs.map(buildConfig);

const byId = new Map<number, LocalChestConfig>();
for (const c of configs) byId.set(c.configId, c);

const tokenToConfig = new Map<string, LocalChestConfig>();
const tokenToIndex = new Map<string, number>();
for (const c of configs) {
  for (let i = 0; i < c.tokenIds.length; i++) {
    const key = c.tokenIds[i].toString();
    tokenToConfig.set(key, c);
    tokenToIndex.set(key, i);
  }
}

export function getLocalConfig(configId: number): LocalChestConfig | undefined {
  return byId.get(configId);
}

export function getAllLocalConfigs(): LocalChestConfig[] {
  return configs;
}

export function getConfigCount(): number {
  return configs.length;
}

export function getTokenSellPrice(tokenId: bigint | number | string): bigint | undefined {
  const key = typeof tokenId === "bigint" ? tokenId.toString() : String(tokenId);
  const cfg = tokenToConfig.get(key);
  const idx = tokenToIndex.get(key);
  if (!cfg || idx === undefined) return undefined;
  return cfg.sellPrices[idx];
}

export function getTokenDropPct(tokenId: bigint | number | string): number | undefined {
  const key = typeof tokenId === "bigint" ? tokenId.toString() : String(tokenId);
  const cfg = tokenToConfig.get(key);
  const idx = tokenToIndex.get(key);
  if (!cfg || idx === undefined) return undefined;
  return cfg.dropPercentages[idx];
}

export function inferConfigIdFromToken(tokenId: bigint | number | string): number | undefined {
  const key = typeof tokenId === "bigint" ? tokenId.toString() : String(tokenId);
  return tokenToConfig.get(key)?.configId;
}

/**
 * Given a batch result (array of rolled indexes), compute loot breakdown:
 * how many of each token, total value, etc.
 */
export function computeBatchLoot(
  configId: number,
  rolledIndexes: bigint[],
): {
  items: { tokenId: bigint; count: number; sellPrice: bigint; dropPct: number }[];
  totalValue: bigint;
} {
  const cfg = byId.get(configId);
  if (!cfg) return { items: [], totalValue: BigInt(0) };

  const countMap = new Map<number, number>();
  for (const idx of rolledIndexes) {
    const i = Number(idx);
    countMap.set(i, (countMap.get(i) ?? 0) + 1);
  }

  let totalValue = BigInt(0);
  const items: { tokenId: bigint; count: number; sellPrice: bigint; dropPct: number }[] = [];

  const sortedEntries = [...countMap.entries()].sort((a, b) => {
    const priceA = cfg.sellPrices[a[0]] ?? BigInt(0);
    const priceB = cfg.sellPrices[b[0]] ?? BigInt(0);
    if (priceA !== priceB) return priceA > priceB ? -1 : 1;
    return b[1] - a[1];
  });

  for (const [idx, count] of sortedEntries) {
    const tokenId = cfg.tokenIds[idx] ?? BigInt(0);
    const sellPrice = cfg.sellPrices[idx] ?? BigInt(0);
    const dropPct = cfg.dropPercentages[idx] ?? 0;
    totalValue += sellPrice * BigInt(count);
    items.push({ tokenId, count, sellPrice, dropPct });
  }

  return { items, totalValue };
}
