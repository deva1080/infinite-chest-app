export type BonusMeta = {
  tokenId: number;
  opens: number;
  imageSrc: string;
  label: string;
  shortLabel: string;
};

export const BONUS_ID_BASE = 10_000_000_000;
export const BONUS_ID_COUNT = 25;

const CUSTOM_BONUS_IMAGE_OPEN_COUNTS = new Set([
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
]);

function toNumericTokenId(tokenId: bigint | number | string): number {
  if (typeof tokenId === "bigint") return Number(tokenId);
  if (typeof tokenId === "string") return Number(tokenId);
  return tokenId;
}

export function isBonusTokenId(tokenId: bigint | number | string): boolean {
  const numeric = toNumericTokenId(tokenId);
  return (
    Number.isFinite(numeric) &&
    numeric > BONUS_ID_BASE &&
    numeric <= BONUS_ID_BASE + BONUS_ID_COUNT
  );
}

export function getBonusOpenCount(
  tokenId: bigint | number | string,
): number | null {
  const numeric = toNumericTokenId(tokenId);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= BONUS_ID_BASE || numeric > BONUS_ID_BASE + BONUS_ID_COUNT) {
    return null;
  }
  return numeric - BONUS_ID_BASE;
}

export function getBonusImageFromCatalog(opens: number): string {
  return CUSTOM_BONUS_IMAGE_OPEN_COUNTS.has(opens)
    ? `/bonus/${opens}.webp`
    : "/bonus/default.webp";
}

export function getBonusMeta(
  tokenId: bigint | number | string,
): BonusMeta | null {
  const opens = getBonusOpenCount(tokenId);
  if (opens === null) return null;

  return {
    tokenId: Number(tokenId),
    opens,
    imageSrc: getBonusImageFromCatalog(opens),
    label: `Bonus +${opens} Opens`,
    shortLabel: `+${opens} Opens`,
  };
}
