import { getAllLocalConfigs, inferConfigIdFromToken } from "./chest-configs";

const BONUS_ID_BASE = 10_000_000_000;
const BONUS_ID_COUNT = 25;

function toNumericTokenId(tokenId: bigint | number | string): number {
  if (typeof tokenId === "bigint") return Number(tokenId);
  if (typeof tokenId === "string") return Number(tokenId);
  return tokenId;
}

const allTokenIdSet = new Set<string>();
for (const cfg of getAllLocalConfigs()) {
  for (const tid of cfg.tokenIds) allTokenIdSet.add(tid.toString());
}

export function isBonusTokenId(tokenId: bigint | number | string): boolean {
  const numeric = toNumericTokenId(tokenId);
  return (
    Number.isFinite(numeric) &&
    numeric >= BONUS_ID_BASE &&
    numeric < BONUS_ID_BASE + BONUS_ID_COUNT
  );
}

function getBonusOpenCount(tokenId: bigint | number | string): number | null {
  const numeric = toNumericTokenId(tokenId);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < BONUS_ID_BASE || numeric >= BONUS_ID_BASE + BONUS_ID_COUNT) return null;
  return numeric - BONUS_ID_BASE;
}

export function getTokenImageFromCatalog(
  tokenId: bigint | number | string,
  fallbackConfigId?: number,
): string {
  if (isBonusTokenId(tokenId)) {
    return "/collections/0_1.webp";
  }

  const numeric = toNumericTokenId(tokenId);
  const resolvedConfigId =
    fallbackConfigId ?? inferConfigIdFromToken(tokenId) ?? 0;
  return `/collections/${resolvedConfigId}_${numeric}.webp`;
}

export function getTokenDisplayName(tokenId: bigint | number | string): string {
  const bonusOpens = getBonusOpenCount(tokenId);
  if (bonusOpens !== null) return `Bonus +${bonusOpens} Opens`;

  const numeric = toNumericTokenId(tokenId);
  return `NFT #${Number.isFinite(numeric) ? numeric : String(tokenId)}`;
}
