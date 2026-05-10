"use client";

import { useCallback, useEffect, useMemo } from "react";
import { type Address } from "viem";
import { useReadContract } from "wagmi";

import { getContractConfig } from "@/lib/contracts";
import { useAppStore } from "@/lib/store/app-store";

type UseNftInventoryOptions = {
  /** @deprecated No longer needed - getBalances() returns all owned tokens */
  includeConfiguredTokens?: boolean;
};

function normalizeOwner(address: Address | undefined) {
  return address?.toLowerCase() ?? "";
}

function sameInventory(
  snapshot: { owner: string; ownedIds: string[]; balances: Record<string, string> } | undefined,
  owner: string,
  ownedIds: string[],
  balances: Record<string, string>,
) {
  if (!snapshot || snapshot.owner !== owner) return false;
  if (snapshot.ownedIds.length !== ownedIds.length) return false;
  for (let i = 0; i < ownedIds.length; i++) {
    if (snapshot.ownedIds[i] !== ownedIds[i]) return false;
  }

  const balanceKeys = Object.keys(balances);
  const snapshotBalanceKeys = Object.keys(snapshot.balances);
  if (balanceKeys.length !== snapshotBalanceKeys.length) return false;
  return balanceKeys.every((key) => snapshot.balances[key] === balances[key]);
}

export function useNftInventory(
  address: Address | undefined,
  _options: UseNftInventoryOptions = {},
) {
  const itemsConfig = getContractConfig("CrateGameItems");

  const inventoryNonce = useAppStore((s) => s.inventoryNonce);
  const snapshot = useAppStore((s) => s.nftInventory);
  const setNftInventory = useAppStore((s) => s.setNftInventory);
  const clearNftInventory = useAppStore((s) => s.clearNftInventory);

  const owner = normalizeOwner(address);
  const activeSnapshot = snapshot?.owner === owner ? snapshot : undefined;

  const {
    data: balancesData,
    isLoading,
    isFetching,
    refetch,
  } = useReadContract({
    ...itemsConfig,
    functionName: "getBalances",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
    },
  });

  const { ownedIds, balanceMap } = useMemo(() => {
    const map = new Map<string, bigint>();
    const ids: bigint[] = [];

    // Seed from snapshot so UI never flashes empty
    if (activeSnapshot) {
      for (const [tokenId, balance] of Object.entries(activeSnapshot.balances)) {
        map.set(tokenId, BigInt(balance));
      }
    }

    // Overlay fresh data from getBalances()
    if (balancesData) {
      const [freshIds, freshAmounts] = balancesData as [bigint[], bigint[]];

      // Clear snapshot entries and replace with fresh data
      if (freshIds.length > 0 || activeSnapshot) {
        map.clear();
      }

      for (let i = 0; i < freshIds.length; i++) {
        const id = freshIds[i];
        const amount = freshAmounts[i];
        ids.push(id);
        map.set(id.toString(), amount);
      }
    } else if (activeSnapshot) {
      for (const idStr of activeSnapshot.ownedIds) {
        ids.push(BigInt(idStr));
      }
    }

    return { ownedIds: ids, balanceMap: map };
  }, [activeSnapshot, balancesData]);

  const refetchInventory = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Persist to store
  useEffect(() => {
    if (!address) {
      if (snapshot) clearNftInventory();
      return;
    }

    const ownedIdStrings = ownedIds.map((id) => id.toString());
    const balances: Record<string, string> = {};
    for (const [tokenId, balance] of balanceMap) {
      balances[tokenId] = balance.toString();
    }

    const hasFreshData = balancesData !== undefined;
    const hasAnything = ownedIdStrings.length > 0 || Object.keys(balances).length > 0;
    if (!hasFreshData && !hasAnything) return;

    if (sameInventory(activeSnapshot, owner, ownedIdStrings, balances)) return;

    setNftInventory({
      owner,
      ownedIds: ownedIdStrings,
      balances,
      updatedAt: Date.now(),
    });
  }, [
    activeSnapshot,
    address,
    balanceMap,
    balancesData,
    clearNftInventory,
    ownedIds,
    owner,
    setNftInventory,
    snapshot,
  ]);

  // Refetch on nonce bump
  useEffect(() => {
    if (!address || inventoryNonce === 0) return;
    refetchInventory();
  }, [address, inventoryNonce, refetchInventory]);

  const totalNftCount = useMemo(() => {
    let total = 0;
    for (const balance of balanceMap.values()) {
      if (balance > BigInt(0)) total += Number(balance);
    }
    return total;
  }, [balanceMap]);

  const hasSnapshot = activeSnapshot !== undefined && Object.keys(activeSnapshot.balances).length > 0;
  const isFirstLoad = !hasSnapshot && isLoading;
  const isRefreshing = hasSnapshot && isFetching;

  return {
    ownedIds,
    balanceMap,
    totalNftCount,
    isLoading,
    isFirstLoad,
    isRefreshing,
    refetchInventory,
  };
}
