import { formatUnits } from "viem";

const KEY_DECIMALS = 18;

export function formatKeys(raw: bigint | undefined, fractionDigits?: number) {
  if (raw === undefined) return "0";
  const n = Number(formatUnits(raw, KEY_DECIMALS));
  if (fractionDigits === undefined) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
