"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address } from "viem";
import { useReadContract } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";

import { getContractConfig } from "@/lib/contracts";
import { useAppStore } from "@/lib/store/app-store";

type DashboardResult = readonly [
  bigint,  // exp
  number,  // level
  number,  // currentStreak
  number,  // bestStreak
  bigint,  // lastActiveDay
  bigint,  // expForNextLevel
  bigint,  // totalChestsOpened
];

export function useUserStats(address: Address | undefined) {
  const userStatsConfig = getContractConfig("UserStats");
  const userDataNonce = useAppStore((s) => s.userDataNonce);

  const { data, refetch } = useReadContract({
    ...userStatsConfig,
    functionName: "getUserDashboard",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 20_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
    },
  });

  const dashboard = data as DashboardResult | undefined;

  const [stableStats, setStableStats] = useState({
    exp: BigInt(0),
    level: 1,
    currentStreak: 0,
    bestStreak: 0,
    lastActiveDay: BigInt(0),
    nextLevelExp: BigInt(0),
    totalChestsOpened: BigInt(0),
  });

  useEffect(() => {
    setStableStats({
      exp: BigInt(0),
      level: 1,
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDay: BigInt(0),
      nextLevelExp: BigInt(0),
      totalChestsOpened: BigInt(0),
    });
  }, [address]);

  useEffect(() => {
    if (!dashboard) return;
    setStableStats({
      exp: dashboard[0],
      level: Number(dashboard[1]),
      currentStreak: Number(dashboard[2]),
      bestStreak: Number(dashboard[3]),
      lastActiveDay: dashboard[4],
      nextLevelExp: dashboard[5],
      totalChestsOpened: dashboard[6],
    });
  }, [dashboard]);

  useEffect(() => {
    if (!address || userDataNonce === 0) return;
    refetch();
  }, [address, userDataNonce, refetch]);

  return useMemo(
    () => ({
      exp: stableStats.exp,
      level: stableStats.level,
      currentStreak: stableStats.currentStreak,
      bestStreak: stableStats.bestStreak,
      lastActiveDay: stableStats.lastActiveDay,
      nextLevelExp: stableStats.nextLevelExp,
      totalChestsOpened: stableStats.totalChestsOpened,
      refetch,
    }),
    [refetch, stableStats],
  );
}
