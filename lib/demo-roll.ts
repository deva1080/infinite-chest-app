import { getBonusOpenCount } from "./bonus-catalog";
import type { LocalChestConfig } from "./chest-configs";

/**
 * Prelaunch demo roller. Mirrors the on-chain logic in `InfiniteChest._roll`
 * (weighted sample over `config.weights`) and `_openBatch` (bonus opens are
 * applied once and do NOT retrigger further bonus opens).
 *
 * IMPORTANT: this is purely visual — uses `crypto.getRandomValues` (not VRF)
 * and is meant for prelaunch / demo, never as a source of truth.
 */

function secureRandomUint32(): number {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 0x1_0000_0000);
}

/** Weighted index sample. Equivalent to the on-chain weightRanges loop. */
export function weightedRollIndex(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return 0;
  const r = secureRandomUint32() % total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}

export type DemoRollResult = {
  rolledIndexes: bigint[];
  paidOpens: number;
  bonusOpens: number;
};

/**
 * Simulate a chest open / batch.
 *
 * @param cfg The local chest config (same shape used by the real reveal pipeline).
 * @param amount Number of paid opens.
 * @param applyBonus If true (default), bonus token rolls add extra rolls just like on-chain.
 *                   Bonus rolls themselves never retrigger more bonuses (matches `_openBatch`).
 */
export function simulateOpenBatch(
  cfg: LocalChestConfig,
  amount: number,
  applyBonus = true,
): DemoRollResult {
  const rolledIndexes: bigint[] = [];
  let bonusOpens = 0;

  for (let i = 0; i < amount; i++) {
    const idx = weightedRollIndex(cfg.weights);
    rolledIndexes.push(BigInt(idx));
    if (applyBonus) {
      const tokenId = cfg.tokenIds[idx];
      const extra = tokenId !== undefined ? getBonusOpenCount(tokenId) : null;
      if (extra && extra > 0) bonusOpens += extra;
    }
  }

  for (let i = 0; i < bonusOpens; i++) {
    const idx = weightedRollIndex(cfg.weights);
    rolledIndexes.push(BigInt(idx));
  }

  return {
    rolledIndexes,
    paidOpens: amount,
    bonusOpens,
  };
}
