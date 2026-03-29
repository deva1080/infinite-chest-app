import rawAddresses from "./addresses.json";
import { isAddress, type Address } from "viem";

export type ContractName = keyof typeof rawAddresses;

function assertAddress(name: string, value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid address for contract "${name}": ${value}`);
  }
  return value;
}

export const contractAddresses = Object.fromEntries(
  Object.entries(rawAddresses).map(([name, addr]) => [name, assertAddress(name, addr)]),
) as Record<ContractName, Address>;
