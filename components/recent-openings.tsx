"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { decodeEventLog, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { TokenImage } from "@/components/token-image";
import { getContractConfig } from "@/lib/contracts";
import { formatKeys } from "@/lib/format";
import { getTokenImageFromCatalog } from "@/lib/item-catalog";
import { getTokenSellPrice } from "@/lib/chest-configs";

const CHEST_OPENED_EVENT = parseAbiItem(
  "event ChestOpened(address indexed caller, address indexed user, uint32 indexed configId, uint256 rollNonce, uint256 rolledIndex, uint256 resultTokenId, address paymentToken, uint256 price)",
);
const CHEST_BATCH_OPENED_EVENT = parseAbiItem(
  "event ChestBatchOpened(address indexed caller, address indexed user, uint32 indexed configId, uint256 startNonce, uint32 paidOpens, uint32 bonusOpens, bool autoSell, address paymentToken, uint256 totalPrice, uint256[] rolledIndexes)",
);

const LOOKBACK_BLOCKS = BigInt(5000);
const POLL_INTERVAL_MS = 3_000;
const MAX_RESULTS = 15;
const NEW_DROP_FLASH_MS = 1_000;
const CARD_ACCENTS = [
  ["#4f46e5", "#0f172a"],
  ["#ec4899", "#111827"],
  ["#f97316", "#172033"],
  ["#22c55e", "#101827"],
  ["#06b6d4", "#111827"],
  ["#a855f7", "#1f1636"],
] as const;

type RecentEntry = {
  kind: "single" | "batch";
  configId: number;
  resultTokenId?: bigint;
  user: string;
  price: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
  paidOpens?: number;
  bonusOpens?: number;
  autoSell?: boolean;
};

function getEntryKey(entry: RecentEntry) {
  return `${entry.kind}-${entry.txHash}-${entry.logIndex}`;
}

export function RecentOpenings() {
  const publicClient = usePublicClient();
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [highlightedKeys, setHighlightedKeys] = useState<string[]>([]);
  const lastBlockRef = useRef<bigint>(BigInt(0));
  const hasCompletedInitialPollRef = useRef(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      const singleLogs = await publicClient.getLogs({
        address: getContractConfig("InfiniteChest").address,
        event: CHEST_OPENED_EVENT,
        fromBlock,
        toBlock: currentBlock,
      });
      const batchLogs = await publicClient.getLogs({
        address: getContractConfig("InfiniteChest").address,
        event: CHEST_BATCH_OPENED_EVENT,
        fromBlock,
        toBlock: currentBlock,
      });

      lastBlockRef.current = currentBlock;

      if (singleLogs.length === 0 && batchLogs.length === 0) {
        hasCompletedInitialPollRef.current = true;
        return;
      }

      const singleEntries: RecentEntry[] = singleLogs.map((log) => {
        const decoded = decodeEventLog({
          abi: [CHEST_OPENED_EVENT],
          data: log.data,
          topics: log.topics,
        });
        const args = decoded.args as {
          user: string;
          configId: bigint | number;
          resultTokenId: bigint;
          price: bigint;
        };
        return {
          kind: "single",
          configId: Number(args.configId),
          resultTokenId: args.resultTokenId,
          user: args.user,
          price: args.price,
          blockNumber: log.blockNumber,
          logIndex: Number(log.logIndex ?? 0),
          txHash: log.transactionHash,
        };
      });
      const batchEntries: RecentEntry[] = batchLogs.map((log) => {
        const decoded = decodeEventLog({
          abi: [CHEST_BATCH_OPENED_EVENT],
          data: log.data,
          topics: log.topics,
        });
        const args = decoded.args as {
          user: string;
          configId: bigint | number;
          paidOpens: bigint | number;
          bonusOpens: bigint | number;
          autoSell: boolean;
          totalPrice: bigint;
        };
        return {
          kind: "batch",
          configId: Number(args.configId),
          user: args.user,
          price: args.totalPrice,
          blockNumber: log.blockNumber,
          logIndex: Number(log.logIndex ?? 0),
          txHash: log.transactionHash,
          paidOpens: Number(args.paidOpens),
          bonusOpens: Number(args.bonusOpens),
          autoSell: args.autoSell,
        };
      });
      const newEntries = [...singleEntries, ...batchEntries];

      let freshKeys: string[] = [];
      const shouldHighlight = hasCompletedInitialPollRef.current;
      setEntries((prev) => {
        const prevKeys = new Set(prev.map(getEntryKey));
        freshKeys = newEntries
          .map((entry) => getEntryKey(entry))
          .filter((key) => !prevKeys.has(key));
        const combined = [...newEntries, ...prev];
        const seen = new Set<string>();
        const deduped: RecentEntry[] = [];
        for (const e of combined) {
          const key = getEntryKey(e);
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(e);
          }
        }
        deduped.sort((a, b) => {
          if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
          return a.blockNumber > b.blockNumber ? -1 : 1;
        });
        return deduped.slice(0, MAX_RESULTS);
      });

      if (shouldHighlight && freshKeys.length > 0) {
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        setHighlightedKeys(freshKeys);
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedKeys([]);
        }, NEW_DROP_FLASH_MS);
      }

      hasCompletedInitialPollRef.current = true;
    } catch {
      // Silently ignore RPC errors
    }
  }, [publicClient]);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [fetchLogs]);

  if (entries.length === 0) return null;

  return (
    <aside className="fixed left-0 top-[var(--app-header-h)] z-40 h-[calc(100dvh-var(--app-header-h))] w-[6.75rem] sm:w-[8.75rem]">
      <div className="h-full overflow-hidden border-r border-white/10 bg-[#090d18]/88 backdrop-blur-md">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#090d18]/95 px-2 py-3 backdrop-blur-md sm:px-3">
          <div className="flex items-center justify-center gap-2">
            <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-red-500/35 animate-recent-live-ring" />
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-recent-live-dot" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              Live
            </span>
          </div>
        </div>
        {entries.map((entry, i) => {
          const entryKey = getEntryKey(entry);
          const isHighlighted = highlightedKeys.includes(entryKey);
          const imageSrc =
            entry.kind === "single" && entry.resultTokenId !== undefined
              ? getTokenImageFromCatalog(entry.resultTokenId, entry.configId)
              : `/chesties/${entry.configId % 5}.webp`;
          const entryMeta =
            entry.kind === "batch"
              ? `x${entry.paidOpens ?? 0}${(entry.bonusOpens ?? 0) > 0 ? ` +${entry.bonusOpens}` : ""}`
              : null;
          const [accent, shadow] =
            CARD_ACCENTS[
              (entry.configId +
                (entry.resultTokenId !== undefined
                  ? Number(entry.resultTokenId % BigInt(CARD_ACCENTS.length))
                  : 0) +
                i) %
                CARD_ACCENTS.length
            ];
          return (
            <Link
              key={entryKey}
              href={`/game?configId=${entry.configId}`}
              className="group block border-b border-white/8 p-1.5"
            >
              <div
                className="relative overflow-hidden rounded-xl border border-white/12 px-2 py-2 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.02]"
                style={{
                  background: `linear-gradient(180deg, ${accent} 0%, ${shadow} 58%, rgba(7, 10, 19, 0.98) 100%)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 12px 26px ${accent}22`,
                  animation: isHighlighted
                    ? "recent-card-enter 320ms ease-out, recent-card-drift 4.8s ease-in-out infinite, recent-card-flash 1s ease-out 1"
                    : "recent-card-drift 4.8s ease-in-out infinite",
                }}
              >
                <div className="absolute inset-x-0 top-0 h-10 bg-white/8 blur-2xl" />
                <div className="relative flex flex-col items-center gap-1">
                  <div className="flex w-full items-center justify-between text-[9px] font-semibold uppercase tracking-[0.12em] text-white/70">
                    <span>#{entry.configId}</span>
                    {entryMeta && (
                      <span className="rounded bg-white/12 px-1 py-0.5 text-[8px] text-cyan-200">
                        {entryMeta}
                      </span>
                    )}
                  </div>
                  <div className="relative h-[4.75rem] w-full overflow-hidden rounded-lg sm:h-[5.25rem]">
                    <TokenImage
                      src={imageSrc}
                      alt={entry.kind === "single" ? "Recent drop NFT" : "Recent batch opening"}
                      fill
                      className="object-contain p-0.5 drop-shadow-[0_10px_20px_rgba(0,0,0,0.55)] transition-transform duration-200 group-hover:scale-110"
                      unoptimized
                    />
                  </div>
                  <span className="text-center text-[13px] font-semibold tracking-tight text-white">
                    {entry.user.slice(0, 4)}
                  </span>
                  <div className="w-full rounded-lg border border-white/10 bg-black/20  py-1 text-center leading-none">
                    <div className="text-[12px] font-semibold text-white">
                      {formatKeys(entry.price)} KEY
                    </div>
                    {entry.kind === "batch" && entry.autoSell && (
                      <div className="mt-0.5 text-[8px] uppercase tracking-wider text-amber-300/90">
                        auto-sell
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
