import type { Abi } from "viem";

import crateGameItemsAbiJson from "@/public/ABIS/CrateGameItems.json";
import epicKeyAbiJson from "@/public/ABIS/EpicKey.json";
import infiniteChestAbiJson from "@/public/ABIS/InfiniteChest.json";
import keyAbiJson from "@/public/ABIS/Key.json";
import rareKeyAbiJson from "@/public/ABIS/RareKey.json";
import shopAbiJson from "@/public/ABIS/Shop.json";
import treasuryAbiJson from "@/public/ABIS/Treasury.json";
import userStatsAbiJson from "@/public/ABIS/UserStats.json";

export const contractAbis = {
  InfiniteChest: infiniteChestAbiJson as Abi,
  Shop: shopAbiJson as Abi,
  Treasury: treasuryAbiJson as Abi,
  CrateGameItems: crateGameItemsAbiJson as Abi,
  EpicKey: epicKeyAbiJson as Abi,
  Key: keyAbiJson as Abi,
  RareKey: rareKeyAbiJson as Abi,
  UserStats: userStatsAbiJson as Abi,
} as const;
