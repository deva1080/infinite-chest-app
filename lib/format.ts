import { formatUnits } from "viem";

const KEY_DECIMALS = 18;

export function formatKeys(raw: bigint | undefined) {
  if (raw === undefined) return "0";
  return Number(formatUnits(raw, KEY_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}
