"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { getContractConfig, contractAddresses } from "@/lib/contracts";
import { getAllLocalConfigs, type LocalChestConfig } from "@/lib/chest-configs";
import { getChestMeta } from "@/lib/chest-meta";
import { formatKeys } from "@/lib/format";
import {
  getTokenDisplayName,
  getTokenImageFromCatalog,
  isBonusTokenId,
} from "@/lib/item-catalog";
import { TokenImage } from "@/components/token-image";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store/app-store";

const localConfigs = getAllLocalConfigs();

type SellSelection = Record<string, number>;

export function QuickInventoryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedConfig, setExpandedConfig] = useState<number | null>(null);
  const [sellSelection, setSellSelection] = useState<SellSelection>({});
  const [showConfirm, setShowConfirm] = useState(false);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const bumpBalanceNonce = useAppStore((s) => s.bumpBalanceNonce);
  const bumpInventoryNonce = useAppStore((s) => s.bumpInventoryNonce);
  const inventoryNonce = useAppStore((s) => s.inventoryNonce);

  const isGamePage = pathname === "/game";
  const gameConfigId = isGamePage
    ? Number(searchParams.get("configId") ?? "0")
    : null;

  useEffect(() => {
    if (isOpen && gameConfigId !== null) {
      setExpandedConfig(gameConfigId);
    }
  }, [isOpen, gameConfigId]);

  const itemsConfig = getContractConfig("CrateGameItems");
  const shopConfig = getContractConfig("Shop");

  const { data: ownedIds, refetch: refetchOwned } = useReadContract({
    ...itemsConfig,
    functionName: "ownedIds",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const ownedIdsList = (ownedIds as bigint[]) ?? [];

  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: ownedIdsList.map((tokenId) => ({
      ...itemsConfig,
      functionName: "balanceOf" as const,
      args: [address!, tokenId],
    })),
    query: {
      enabled: Boolean(address) && ownedIdsList.length > 0,
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (inventoryNonce > 0) {
      refetchOwned();
      refetchBalances();
    }
  }, [inventoryNonce, refetchOwned, refetchBalances]);

  const balanceMap = useMemo(() => {
    const map = new Map<string, bigint>();
    if (balances) {
      for (let i = 0; i < ownedIdsList.length; i++) {
        const val = balances[i]?.result;
        if (val != null) map.set(ownedIdsList[i].toString(), val as bigint);
      }
    }
    return map;
  }, [balances, ownedIdsList]);

  const configInventory = useMemo(() => {
    return localConfigs.map((cfg) => {
      const items: {
        tokenId: bigint;
        balance: bigint;
        sellPrice: bigint;
        isBonus: boolean;
      }[] = [];
      let totalItems = 0;
      let totalValue = BigInt(0);

      for (let i = 0; i < cfg.tokenIds.length; i++) {
        const tid = cfg.tokenIds[i];
        const bal = balanceMap.get(tid.toString());
        if (bal && bal > BigInt(0)) {
          items.push({
            tokenId: tid,
            balance: bal,
            sellPrice: cfg.sellPrices[i],
            isBonus: isBonusTokenId(tid),
          });
          totalItems += Number(bal);
          totalValue += cfg.sellPrices[i] * bal;
        }
      }

      return { config: cfg, items, totalItems, totalValue };
    });
  }, [balanceMap]);

  // --- Approval ---
  const { data: isShopApproved, refetch: refetchApproval } = useReadContract({
    ...itemsConfig,
    functionName: "isApprovedForAll",
    args: address ? [address, contractAddresses.Shop] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const {
    data: approveHash,
    isPending: isApprovePending,
    writeContractAsync: writeApprove,
  } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const isApproveBusy = isApprovePending || isApproveConfirming;

  // --- Batch Sell ---
  const {
    data: batchSellHash,
    isPending: isBatchSellPending,
    writeContractAsync: writeBatchSell,
  } = useWriteContract();
  const { isLoading: isBatchSellConfirming } = useWaitForTransactionReceipt({
    hash: batchSellHash,
  });
  const isSelling = isBatchSellPending || isBatchSellConfirming;

  const selectionSummary = useMemo(() => {
    let totalItems = 0;
    let totalValue = BigInt(0);
    const tokenIds: bigint[] = [];
    const amounts: bigint[] = [];

    for (const cfg of localConfigs) {
      for (let i = 0; i < cfg.tokenIds.length; i++) {
        const tid = cfg.tokenIds[i];
        const key = tid.toString();
        const qty = sellSelection[key];
        if (qty && qty > 0) {
          tokenIds.push(tid);
          amounts.push(BigInt(qty));
          totalItems += qty;
          totalValue += cfg.sellPrices[i] * BigInt(qty);
        }
      }
    }

    return { totalItems, totalValue, tokenIds, amounts };
  }, [sellSelection]);

  const updateSelection = useCallback(
    (tokenId: string, qty: number) => {
      setSellSelection((prev) => {
        if (qty <= 0) {
          const next = { ...prev };
          delete next[tokenId];
          return next;
        }
        return { ...prev, [tokenId]: qty };
      });
    },
    [],
  );

  const selectAllForConfig = useCallback(
    (cfg: LocalChestConfig) => {
      setSellSelection((prev) => {
        const next = { ...prev };
        for (const tid of cfg.tokenIds) {
          const key = tid.toString();
          const bal = balanceMap.get(key);
          if (bal && bal > BigInt(0) && !isBonusTokenId(tid)) {
            next[key] = Number(bal);
          }
        }
        return next;
      });
    },
    [balanceMap],
  );

  const clearSelectionForConfig = useCallback(
    (cfg: LocalChestConfig) => {
      setSellSelection((prev) => {
        const next = { ...prev };
        for (const tid of cfg.tokenIds) {
          delete next[tid.toString()];
        }
        return next;
      });
    },
    [],
  );

  async function handleApprove() {
    try {
      await writeApprove({
        ...itemsConfig,
        functionName: "setApprovalForAll",
        args: [contractAddresses.Shop, true],
      });
      toast.success("Approval enviado");
      refetchApproval();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar");
    }
  }

  async function handleBatchSell() {
    const { tokenIds, amounts, totalItems } = selectionSummary;
    if (tokenIds.length === 0) return;

    try {
      await writeBatchSell({
        ...shopConfig,
        functionName: "batchSell",
        args: [tokenIds, amounts],
      });
      toast.success(`${totalItems} NFTs vendidos!`);
      setSellSelection({});
      setShowConfirm(false);
      refetchOwned();
      refetchBalances();
      bumpBalanceNonce();
      bumpInventoryNonce();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al vender");
    }
  }

  const hasSelection = selectionSummary.totalItems > 0;

  return (
    <aside className="fixed right-0 top-[var(--app-header-h)] z-40 flex h-[calc(100dvh-var(--app-header-h))]">
      {/* Toggle tab */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (isOpen) {
            setShowConfirm(false);
          }
        }}
        className={cn(
          "flex h-full w-7 items-center justify-center border-l border-cyan-300/20 bg-black/70 text-[10px] font-bold uppercase tracking-widest text-cyan-200 backdrop-blur-sm transition-colors hover:bg-black/85",
          isOpen && "bg-black/85",
        )}
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {isOpen ? "CLOSE" : "QUICK SELL"}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden border-l border-cyan-300/20 bg-[#080c1a]/95 backdrop-blur-md transition-all duration-300",
          isOpen ? "w-80" : "w-0 border-l-0",
        )}
      >
        {isOpen && (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Quick Sell
              </h3>
              <p className="mt-0.5 text-[10px] text-white/45">
                {isGamePage
                  ? `Showing config #${gameConfigId}`
                  : "Select NFTs to batch sell"}
              </p>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2">
              {!isConnected ? (
                <p className="py-8 text-center text-xs text-white/40">
                  Connect wallet to view inventory
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {configInventory.map(
                    ({ config: cfg, items, totalItems, totalValue }) => {
                      const meta = getChestMeta(cfg.configId);
                      const isExpanded = expandedConfig === cfg.configId;
                      const isEmpty = items.length === 0;

                      if (
                        isGamePage &&
                        gameConfigId !== null &&
                        cfg.configId !== gameConfigId
                      ) {
                        return null;
                      }

                      return (
                        <div
                          key={cfg.configId}
                          className={cn(
                            "rounded-lg border transition-colors",
                            isEmpty
                              ? "border-white/5 bg-white/[0.02]"
                              : isExpanded
                                ? "border-cyan-400/25 bg-white/[0.04]"
                                : "border-white/8 bg-white/[0.03]",
                          )}
                        >
                          {/* Config header (accordion toggle) */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isEmpty) return;
                              setExpandedConfig(
                                isExpanded ? null : cfg.configId,
                              );
                            }}
                            disabled={isEmpty}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                              !isEmpty && "hover:bg-white/[0.03]",
                              isEmpty && "cursor-default opacity-40",
                            )}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                background: `linear-gradient(135deg, ${meta.accentFrom}, ${meta.accentTo})`,
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-xs font-semibold text-white">
                                {meta.title}
                              </p>
                              {!isEmpty && (
                                <p className="text-[10px] text-white/40">
                                  {totalItems} items ~{formatKeys(totalValue)}{" "}
                                  KEY
                                </p>
                              )}
                              {isEmpty && (
                                <p className="text-[10px] text-white/25">
                                  No items
                                </p>
                              )}
                            </div>
                            {!isEmpty && (
                              <span
                                className={cn(
                                  "text-[10px] text-white/30 transition-transform",
                                  isExpanded && "rotate-180",
                                )}
                              >
                                ▼
                              </span>
                            )}
                          </button>

                          {/* Expanded NFT list */}
                          {isExpanded && !isEmpty && (
                            <div className="border-t border-white/5 px-2 pb-2 pt-2">
                              {/* Sell All / Clear buttons */}
                              <div className="mb-2 flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => selectAllForConfig(cfg)}
                                  className="flex-1 rounded-md bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
                                >
                                  Sell All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => clearSelectionForConfig(cfg)}
                                  className="flex-1 rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/50 transition-colors hover:bg-white/10"
                                >
                                  Clear
                                </button>
                              </div>

                              {/* NFT grid */}
                              <div className="grid grid-cols-2 gap-1.5">
                                {items.map(
                                  ({
                                    tokenId,
                                    balance,
                                    sellPrice,
                                    isBonus,
                                  }) => {
                                    const key = tokenId.toString();
                                    const qty = sellSelection[key] ?? 0;
                                    const maxQty = Number(balance);
                                    const isSelected = qty > 0;

                                    return (
                                      <div
                                        key={key}
                                        className={cn(
                                          "overflow-hidden rounded-lg border transition-all",
                                          isBonus
                                            ? "border-amber-500/20 opacity-50"
                                            : isSelected
                                              ? "border-cyan-400/40 ring-1 ring-cyan-400/20"
                                              : "border-white/8",
                                        )}
                                      >
                                        {/* Image */}
                                        <div className="relative aspect-square bg-gradient-to-b from-white/5 to-transparent">
                                          <TokenImage
                                            src={getTokenImageFromCatalog(
                                              tokenId,
                                              cfg.configId,
                                            )}
                                            alt={getTokenDisplayName(tokenId)}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                          />
                                          <span className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                                            x{balance.toString()}
                                          </span>
                                          {isBonus && (
                                            <span className="absolute left-1 top-1 rounded bg-amber-500/80 px-1 py-0.5 text-[8px] font-bold text-black">
                                              BONUS
                                            </span>
                                          )}
                                        </div>

                                        {/* Info + qty selector */}
                                        <div className="bg-[#0a0e1a]/90 px-1.5 py-1.5">
                                          <p className="truncate text-[10px] font-semibold text-white">
                                            {getTokenDisplayName(tokenId)}
                                          </p>
                                          <p className="text-[9px] text-white/40">
                                            {formatKeys(sellPrice)} KEY ea.
                                          </p>

                                          {!isBonus && (
                                            <div className="mt-1 flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  updateSelection(
                                                    key,
                                                    qty - 1,
                                                  )
                                                }
                                                disabled={qty <= 0}
                                                className="flex h-5 w-5 items-center justify-center rounded bg-white/8 text-[10px] font-bold text-white/60 transition-colors hover:bg-white/15 disabled:opacity-25"
                                              >
                                                -
                                              </button>
                                              <input
                                                type="number"
                                                min={0}
                                                max={maxQty}
                                                value={qty}
                                                onChange={(e) => {
                                                  const v = Math.min(
                                                    maxQty,
                                                    Math.max(
                                                      0,
                                                      Number.parseInt(
                                                        e.target.value,
                                                        10,
                                                      ) || 0,
                                                    ),
                                                  );
                                                  updateSelection(key, v);
                                                }}
                                                className="h-5 w-full min-w-0 rounded border border-white/10 bg-black/40 px-1 text-center text-[10px] text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                              />
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  updateSelection(
                                                    key,
                                                    Math.min(
                                                      qty + 1,
                                                      maxQty,
                                                    ),
                                                  )
                                                }
                                                disabled={qty >= maxQty}
                                                className="flex h-5 w-5 items-center justify-center rounded bg-white/8 text-[10px] font-bold text-white/60 transition-colors hover:bg-white/15 disabled:opacity-25"
                                              >
                                                +
                                              </button>
                                            </div>
                                          )}

                                          {isSelected && !isBonus && (
                                            <p className="mt-0.5 text-center text-[9px] font-medium text-cyan-300/70">
                                              {formatKeys(
                                                sellPrice * BigInt(qty),
                                              )}{" "}
                                              KEY
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>

            {/* Sticky footer */}
            {isConnected && (
              <div className="shrink-0 border-t border-white/10 px-3 py-3">
                {!isShopApproved ? (
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isApproveBusy}
                    className="w-full rounded-lg border border-white/15 bg-white/8 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white/12 disabled:opacity-40"
                  >
                    {isApproveBusy ? "Approving..." : "Approve NFTs for Shop"}
                  </button>
                ) : showConfirm ? (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-lg border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                        Confirm Sale
                      </p>
                      <p className="mt-1 text-xs text-white">
                        Selling{" "}
                        <span className="font-bold text-cyan-300">
                          {selectionSummary.totalItems}
                        </span>{" "}
                        items for{" "}
                        <span className="font-bold text-green-300">
                          ~{formatKeys(selectionSummary.totalValue)} KEY
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        disabled={isSelling}
                        className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2 text-[10px] font-semibold uppercase text-white/60 transition-colors hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleBatchSell}
                        disabled={isSelling}
                        className="flex-1 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {isSelling ? "Selling..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {hasSelection && (
                      <div className="flex items-center justify-between px-1 text-[10px] text-white/50">
                        <span>
                          {selectionSummary.totalItems} item
                          {selectionSummary.totalItems !== 1 && "s"}
                        </span>
                        <span className="font-semibold text-green-300">
                          ~{formatKeys(selectionSummary.totalValue)} KEY
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowConfirm(true)}
                      disabled={!hasSelection || isSelling}
                      className={cn(
                        "w-full rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-all",
                        hasSelection
                          ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
                          : "border border-white/8 bg-white/[0.03] text-white/25",
                      )}
                    >
                      {isSelling
                        ? "Selling..."
                        : hasSelection
                          ? "Batch Sell"
                          : "Select items to sell"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
