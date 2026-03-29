import { contractAbis } from "@/lib/contracts/abis";
import {
  contractAddresses,
  type ContractName,
} from "@/lib/contracts/addresses";

export { contractAddresses, type ContractName };

export const tokenContractNames = ["Key", "RareKey", "EpicKey"] as const;
export type TokenContractName = (typeof tokenContractNames)[number];

export function getContractConfig(name: ContractName) {
  return {
    address: contractAddresses[name],
    abi: contractAbis[name],
  };
}
