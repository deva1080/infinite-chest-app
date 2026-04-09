import { getAllLocalConfigs, inferConfigIdFromToken } from "./chest-configs";
import {
  getBonusMeta,
  isBonusTokenId as isGlobalBonusTokenId,
} from "./bonus-catalog";

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
  return isGlobalBonusTokenId(tokenId);
}

export function getTokenImageFromCatalog(
  tokenId: bigint | number | string,
  fallbackConfigId?: number,
): string {
  const bonusMeta = getBonusMeta(tokenId);
  if (bonusMeta) {
    return bonusMeta.imageSrc;
  }

  const numeric = toNumericTokenId(tokenId);
  const resolvedConfigId =
    fallbackConfigId ?? inferConfigIdFromToken(tokenId) ?? 0;
  return `/collections/${resolvedConfigId}_${numeric}.webp`;
}

export function getTokenDisplayName(tokenId: bigint | number | string): string {
  const bonusMeta = getBonusMeta(tokenId);
  if (bonusMeta) return bonusMeta.label;

  const numeric = toNumericTokenId(tokenId);
  return `NFT #${Number.isFinite(numeric) ? numeric : String(tokenId)}`;
}
