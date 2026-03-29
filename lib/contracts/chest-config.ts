type ChestConfigTuple = [string, bigint, bigint[], bigint[], bigint[]];

type ChestConfigObject = {
  token?: string;
  price?: bigint;
  weightRanges?: bigint[];
  multipliers?: bigint[];
  tokenIds?: bigint[];
};

export type NormalizedChestConfig = {
  token?: string;
  price?: bigint;
  weightRanges: bigint[];
  multipliers: bigint[];
  tokenIds: bigint[];
};

export function normalizeChestConfig(input: unknown): NormalizedChestConfig {
  if (!input) {
    return { weightRanges: [], multipliers: [], tokenIds: [] };
  }

  if (Array.isArray(input)) {
    const tuple = input as ChestConfigTuple;
    return {
      token: tuple[0],
      price: tuple[1],
      weightRanges: tuple[2] ?? [],
      multipliers: tuple[3] ?? [],
      tokenIds: tuple[4] ?? [],
    };
  }

  const obj = input as ChestConfigObject;
  return {
    token: obj.token,
    price: obj.price,
    weightRanges: obj.weightRanges ?? [],
    multipliers: obj.multipliers ?? [],
    tokenIds: obj.tokenIds ?? [],
  };
}
