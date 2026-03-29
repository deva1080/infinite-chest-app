"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { decodeEventLog, parseAbiItem } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";

import { getContractConfig } from "@/lib/contracts";
import { formatKeys } from "@/lib/format";

const CHEST_OPENED_EVENT = parseAbiItem(
  "event ChestOpened(address indexed caller, address indexed user, uint32 indexed configId, uint256 rollNonce, uint256 rolledIndex, uint256 resultTokenId, address paymentToken, uint256 price)",
);

const LOOKBACK_BLOCKS = BigInt(5000);
const POLL_INTERVAL_MS = 30_000;
const MAX_RESULTS = 20;

type ChestOpenedEntry = {
  configId: number;
  resultTokenId: bigint;
  user: string;
  price: bigint;
  blockNumber: bigint;
};

export function RecentOpenings() {
  const publicClient = usePublicClient();
  const [entries, setEntries] = useState<ChestOpenedEntry[]>([]);
  const lastBlockRef = useRef<bigint>(BigInt(0));
  const shopConfig = getContractConfig("Shop");

  const fetchLogs = useCallback(async () => {
    if (!publicClient) return;
    try {
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock =
        lastBlockRef.current > BigInt(0)
          ? lastBlockRef.current + BigInt(1)
          : currentBlock > LOOKBACK_BLOCKS
            ? currentBlock - LOOKBACK_BLOCKS
            : BigInt(0);

      if (fromBlock > currentBlock) return;

      const logs = await publicClient.getLogs({
        address: getContractConfig("InfiniteChest").address,
        event: CHEST_OPENED_EVENT,
        fromBlock,
        toBlock: currentBlock,
      });

      lastBlockRef.current = currentBlock;

      if (logs.length === 0) return;

      const newEntries: ChestOpenedEntry[] = logs.map((log) => {
        const decoded = decodeEventLog({
          abi: [CHEST_OPENED_EVENT],
          data: log.data,
          topics: log.topics,
        });
        const args = decoded.args as {
          caller: string;
          user: string;
          configId: number;
          resultTokenId: bigint;
          price: bigint;
        };
        return {
          configId: args.configId,
          resultTokenId: args.resultTokenId,
          user: args.user,
          price: args.price,
          blockNumber: log.blockNumber,
        };
      });

      setEntries((prev) => {
        const combined = [...newEntries, ...prev];
        const seen = new Set<string>();
        const deduped: ChestOpenedEntry[] = [];
        for (const e of combined) {
          const key = `${e.blockNumber}-${e.resultTokenId}-${e.user}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(e);
          }
        }
        return deduped.slice(0, MAX_RESULTS);
      });
    } catch {
      // Silently ignore RPC errors
    }
  }, [publicClient]);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const uniqueTokenIds = useMemo(() => {
    const seen = new Set<string>();
    return entries
      .filter((e) => {
        const key = e.resultTokenId.toString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((e) => e.resultTokenId);
  }, [entries]);

  const { data: pricesData } = useReadContracts({
    contracts: uniqueTokenIds.map((tid) => ({
      ...shopConfig,
      functionName: "tokenPrice" as const,
      args: [tid],
    })),
    query: {
      enabled: uniqueTokenIds.length > 0,
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const priceMap = useMemo(() => {
    const map = new Map<string, bigint>();
    if (pricesData) {
      for (let i = 0; i < uniqueTokenIds.length; i++) {
        const val = pricesData[i]?.result;
        if (val != null) map.set(uniqueTokenIds[i].toString(), val as bigint);
      }
    }
    return map;
  }, [pricesData, uniqueTokenIds]);

  if (entries.length === 0) return null;

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="container mx-auto max-w-5xl px-4 py-2">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent
          </span>
          {entries.map((entry, i) => {
            const price = priceMap.get(entry.resultTokenId.toString());
            return (
              <Link
                key={`${entry.blockNumber}-${entry.resultTokenId}-${i}`}
                href={`/game?configId=${entry.configId}`}
                className="group flex shrink-0 flex-col items-center gap-0.5"
              >
                <div className="relative h-10 w-10 overflow-hidden rounded-md border bg-background transition-transform group-hover:scale-110">
                  <Image
                    src={`/collections/${entry.configId}_${entry.resultTokenId.toString()}.webp`}
                    alt={`NFT #${entry.resultTokenId.toString()}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground group-hover:text-foreground">
                  {price ? `${formatKeys(price)}` : "—"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
