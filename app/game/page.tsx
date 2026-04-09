"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { decodeEventLog, formatUnits, type Address, parseAbiItem } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ArrowRight, Coins, Lock } from "lucide-react";

import { contractAddresses } from "@/lib/contracts";
import { contractAbis } from "@/lib/contracts/abis";
import { formatKeys } from "@/lib/format";
import {
  getChestMeta,
  getRarityTier,
  RARITY_COLORS,
  RARITY_LABELS,
} from "@/lib/chest-meta";
import { RewardArtFrame } from "@/components/reward-art-frame";
import {
  getTokenDisplayName,
  getTokenImageFromCatalog,
  isBonusTokenId,
} from "@/lib/item-catalog";
import { cn } from "@/lib/utils";
import { getLocalConfig, type LocalChestConfig } from "@/lib/chest-configs";
import { useAppStore } from "@/lib/store/app-store";
import { LootGrid, type RevealItem } from "@/components/loot-grid";
import { RunicBackdrop } from "@/components/runic-backdrop";

const erc20Abi = contractAbis.Key;

const chestOpenedEvent = parseAbiItem(
  "event ChestOpened(address indexed caller, address indexed user, uint32 indexed configId, uint256 rollNonce, uint256 rolledIndex, uint256 resultTokenId, address paymentToken, uint256 price)",
);
const chestBatchOpenedEvent = parseAbiItem(
  "event ChestBatchOpened(address indexed caller, address indexed user, uint32 indexed configId, uint256 startNonce, uint32 paidOpens, uint32 bonusOpens, bool autoSell, address paymentToken, uint256 totalPrice, uint256[] rolledIndexes)",
);

const MAX_BATCH = 50;
const QTY_PRESETS = [1, 5, 10, 25, 50] as const;

type OpenResult =
  | {
      mode: "single";
      resultTokenId: bigint;
      rolledIndex: bigint;
      price: bigint;
    }
  | {
      mode: "batch";
      resultTokenId: bigint;
      price: bigint;
      paidOpens: number;
      bonusOpens: number;
      totalRolls: number;
      autoSell: boolean;
      rolledIndexes: bigint[];
    };

type RevealPhase = "idle" | "charging" | "revealing" | "done";

type OpenChestApiResponse = {
  hash?: `0x${string}`;
  error?: string;
  callPreview?: string;
  requestBody?: unknown;
};

function getTokenImage(configId: number, tokenId: bigint) {
  return getTokenImageFromCatalog(tokenId, configId);
}

function pickDominantTokenId(
  chestTokenIds: bigint[],
  rolledIndexes: bigint[],
): bigint | null {
  if (rolledIndexes.length === 0 || chestTokenIds.length === 0) return null;
  const counts = new Map<number, number>();
  for (const rolledIndex of rolledIndexes) {
    const idx = Number(rolledIndex);
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  let bestIdx = Number(rolledIndexes[0]);
  let bestCount = 0;
  for (const [idx, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestIdx = idx;
    }
  }
  return chestTokenIds[bestIdx] ?? chestTokenIds[0] ?? null;
}

function buildRevealItems(
  localCfg: LocalChestConfig,
  rolledIndexes: bigint[],
): RevealItem[] {
  return rolledIndexes.map((rolledIdx) => {
    const i = Number(rolledIdx);
    const tokenId = localCfg.tokenIds[i] ?? BigInt(0);
    const sellPrice = localCfg.sellPrices[i] ?? BigInt(0);
    const dropPct = localCfg.dropPercentages[i] ?? 0;
    return { tokenId, sellPrice, dropPct, index: i };
  });
}

export default function GamePage() {
  const searchParams = useSearchParams();
  const configId = Number(searchParams.get("configId") ?? "0");
  const referrer = searchParams.get("ref") ?? undefined;

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const bumpBalanceNonce = useAppStore((s) => s.bumpBalanceNonce);
  const addKeyDelta = useAppStore((s) => s.addKeyDelta);
  const addNftDelta = useAppStore((s) => s.addNftDelta);

  const [openResult, setOpenResult] = useState<OpenResult | null>(null);
  const [openAmount, setOpenAmount] = useState(1);
  const [autoSell, setAutoSell] = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("idle");
  const [revealItems, setRevealItems] = useState<RevealItem[]>([]);
  const chestRef = useRef<HTMLDivElement>(null);
  const handledApproveHashRef = useRef<`0x${string}` | null>(null);

  const meta = getChestMeta(configId);
  const localCfg: LocalChestConfig | undefined = getLocalConfig(configId);

  const chestPrice = localCfg?.price;
  const chestPaymentToken = localCfg?.token;
  const chestTokenIds = localCfg?.tokenIds ?? [];
  const dropPercentages = localCfg?.dropPercentages ?? [];
  const sellPrices = localCfg?.sellPrices ?? [];

  const bestDrop = useMemo(() => {
    if (chestTokenIds.length === 0 || dropPercentages.length === 0) return null;
    let bestIdx = 0;
    let lowestPct = dropPercentages[0];
    for (let i = 1; i < dropPercentages.length; i++) {
      if (dropPercentages[i] < lowestPct && dropPercentages[i] > 0) {
        lowestPct = dropPercentages[i];
        bestIdx = i;
      }
    }
    const tid = chestTokenIds[bestIdx];
    const price = sellPrices[bestIdx];
    return { tokenId: tid, pct: lowestPct, price, index: bestIdx };
  }, [chestTokenIds, dropPercentages, sellPrices]);

  const totalCost = chestPrice ? chestPrice * BigInt(openAmount) : undefined;
  const requiredApproval = totalCost ?? chestPrice;

  const { data: paymentAllowance, refetch: refetchAllowance } =
    useReadContract({
      address: chestPaymentToken as Address | undefined,
      abi: erc20Abi,
      functionName: "allowance",
      args:
        address && chestPaymentToken
          ? [address, contractAddresses.Treasury]
          : undefined,
      query: {
        enabled: Boolean(address) && Boolean(chestPaymentToken),
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    });

  const {
    data: approveHash,
    isPending: isApprovePending,
    writeContractAsync: writeApprove,
  } = useWriteContract();
  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveConfirmed,
  } = useWaitForTransactionReceipt({ hash: approveHash });

  const needsTokenApproval =
    requiredApproval !== undefined &&
    paymentAllowance !== undefined &&
    (paymentAllowance as bigint) < requiredApproval;

  const isApproveBusy = isApprovePending || isApproveConfirming;

  useEffect(() => {
    if (!approveHash || !isApproveConfirmed) return;
    if (handledApproveHashRef.current === approveHash) return;

    handledApproveHashRef.current = approveHash;
    refetchAllowance();
    toast.success("Approve confirmado");
  }, [approveHash, isApproveConfirmed, refetchAllowance]);

  async function handleApproveToken() {
    if (!requiredApproval || !chestPaymentToken) return;
    try {
      await writeApprove({
        address: chestPaymentToken as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [contractAddresses.Treasury, requiredApproval],
      });
      toast.info("Approve enviado. Esperando confirmacion...");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar");
    }
  }

  // Parallax
  useEffect(() => {
    const el = chestRef.current;
    if (!el) return;
    const parent = el.closest(".game-hero-card") as HTMLElement | null;
    if (!parent) return;

    function handleMove(e: MouseEvent) {
      if (!parent || !el) return;
      const rect = parent.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      el.style.transform = `translate(${x * 8}px, ${y * 6}px)`;
    }
    function handleLeave() {
      if (el) el.style.transform = "translate(0,0)";
    }

    parent.addEventListener("mousemove", handleMove);
    parent.addEventListener("mouseleave", handleLeave);
    return () => {
      parent.removeEventListener("mousemove", handleMove);
      parent.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  const handleOpenChest = useCallback(async () => {
    if (!address || !publicClient || !localCfg) return;

    if (!Number.isInteger(configId) || configId < 0) {
      const invalidMsg = `Config ID invalido: ${String(configId)}`;
      console.error("open-chest aborted: invalid configId", {
        configId,
        searchParamValue: searchParams.get("configId"),
        address,
      });
      toast.error(invalidMsg, { duration: 8000 });
      return;
    }

    setRevealPhase("charging");
    setOpenResult(null);
    setRevealItems([]);

    // Optimistic deduction — animate header KEY balance down
    if (chestPrice) {
      const costFloat = Number(formatUnits(chestPrice * BigInt(openAmount), 18));
      addKeyDelta(-costFloat);
    }

    try {
      const payload = {
        configId,
        userAddress: address,
        referrer,
        amount: openAmount,
        autoSell,
      };
      const res = await fetch("/api/open-chest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as OpenChestApiResponse;
      if (!res.ok) {
        console.error("open-chest request failed", {
          status: res.status,
          payload,
          callPreview: data.callPreview,
          requestBody: data.requestBody,
          error: data.error,
        });
        const detail = data.callPreview
          ? `${data.error ?? `Error del servidor (${res.status})`} | ${data.callPreview}`
          : (data.error ?? `Error del servidor (${res.status})`);
        throw new Error(detail);
      }

      const txHash = data.hash as `0x${string}`;
      toast.info(
        data.callPreview
          ? `Tx enviada: ${txHash.slice(0, 10)}... | ${data.callPreview}`
          : `Tx enviada: ${txHash.slice(0, 10)}...`,
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      if (receipt.status !== "success") {
        let revertReason = `Tx reverted (${txHash})`;
        try {
          const sentTx = await publicClient.getTransaction({ hash: txHash });
          await publicClient.call({
            account: sentTx.from,
            to: sentTx.to ?? undefined,
            data: sentTx.input,
            value: sentTx.value,
            blockNumber: receipt.blockNumber,
          });
        } catch (simErr: unknown) {
          const vErr = simErr as {
            shortMessage?: string;
            details?: string;
            cause?: { reason?: string; shortMessage?: string };
          };
          revertReason =
            vErr.cause?.reason ??
            vErr.cause?.shortMessage ??
            vErr.shortMessage ??
            vErr.details ??
            revertReason;
          console.error("open-chest tx reverted", {
            txHash,
            callPreview: data.callPreview,
            receipt,
            simErr: vErr,
          });
        }
        throw new Error(revertReason);
      }

      let eventFound = false;

      for (const log of receipt.logs) {
        try {
          const decodedBatch = decodeEventLog({
            abi: [chestBatchOpenedEvent],
            data: log.data,
            topics: log.topics,
          });
          if (decodedBatch.eventName === "ChestBatchOpened") {
            const args = decodedBatch.args as {
              paidOpens: bigint | number;
              bonusOpens: bigint | number;
              autoSell: boolean;
              totalPrice: bigint;
              rolledIndexes: readonly bigint[];
            };
            const paidOpens = Number(args.paidOpens);
            const bonusOpens = Number(args.bonusOpens);
            const rolledIndexes = [...args.rolledIndexes];
            const resultTokenId =
              pickDominantTokenId(chestTokenIds, rolledIndexes) ??
              chestTokenIds[0];

            setOpenResult({
              mode: "batch",
              resultTokenId,
              price: args.totalPrice,
              paidOpens,
              bonusOpens,
              totalRolls: paidOpens + bonusOpens,
              autoSell: args.autoSell,
              rolledIndexes,
            });
            const items = buildRevealItems(localCfg, rolledIndexes);
            setRevealItems(items);
            setRevealPhase("revealing");

            // Optimistic: if auto-sell, loot value goes back as KEY
            // If not auto-sell, NFT count goes up
            if (args.autoSell) {
              let lootValue = BigInt(0);
              for (const item of items) lootValue += item.sellPrice;
              addKeyDelta(Number(formatUnits(lootValue, 18)));
            } else {
              addNftDelta(paidOpens + bonusOpens);
            }

            eventFound = true;
            break;
          }
        } catch {
          /* not our event */
        }

        try {
          const decoded = decodeEventLog({
            abi: [chestOpenedEvent],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "ChestOpened") {
            const args = decoded.args as {
              resultTokenId: bigint;
              rolledIndex: bigint;
              price: bigint;
            };
            setOpenResult({
              mode: "single",
              resultTokenId: args.resultTokenId,
              rolledIndex: args.rolledIndex,
              price: args.price,
            });
            const i = Number(args.rolledIndex);
            const sp = localCfg.sellPrices[i] ?? BigInt(0);
            setRevealItems([
              {
                tokenId: args.resultTokenId,
                sellPrice: sp,
                dropPct: localCfg.dropPercentages[i] ?? 0,
                index: i,
              },
            ]);
            setRevealPhase("revealing");

            // Single open always gives 1 NFT
            addNftDelta(1);

            eventFound = true;
            break;
          }
        } catch {
          /* not our event */
        }
      }

      if (!eventFound) {
        toast.error(
          "Tx confirmada pero no se encontró evento de apertura.",
        );
        setRevealPhase("idle");
      }

      refetchAllowance();
      bumpBalanceNonce();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al abrir el chest";
      toast.error(msg, { duration: 8000 });
      setRevealPhase("idle");

      // Revert the optimistic deduction
      if (chestPrice) {
        const costFloat = Number(formatUnits(chestPrice * BigInt(openAmount), 18));
        addKeyDelta(costFloat);
      }
    }
  }, [
    address,
    publicClient,
    configId,
    referrer,
    refetchAllowance,
    openAmount,
    autoSell,
    chestTokenIds,
    bumpBalanceNonce,
    localCfg,
    addKeyDelta,
    addNftDelta,
    chestPrice,
    searchParams,
  ]);

  function handleReset() {
    setRevealPhase("idle");
    setOpenResult(null);
    setRevealItems([]);
  }

  const handleRevealComplete = useCallback(() => {
    setRevealPhase("done");
  }, []);

  const isCharging = revealPhase === "charging";
  const isRevealing = revealPhase === "revealing";
  const isDone = revealPhase === "done";
  const isIdle = revealPhase === "idle";
  const showChest = revealPhase === "idle" || revealPhase === "charging";
  const showLoot = revealPhase === "revealing" || revealPhase === "done";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 py-1">
      {!isConnected && (
        <div className="w-full rounded-xl border border-amber-400/30 bg-amber-500/8 px-4 py-3 text-center backdrop-blur-sm">
          <p className="text-xs font-semibold text-amber-200">
            Wallet desconectada — conecta tu wallet para jugar.
          </p>
        </div>
      )}

      {/* ===== HERO CARD ===== */}
      <div
        className="game-hero-card relative w-full overflow-hidden rounded-2xl border border-white/12"
        style={{
          background: `linear-gradient(170deg, ${meta.accentFrom}18 0%, #0a0e1a 35%, #0d1117 100%)`,
          boxShadow: `0 0 60px ${meta.glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        <div className="game-scanlines pointer-events-none absolute inset-0 z-[1]" />
        {showChest && (
          <RunicBackdrop
            accentFrom={meta.accentFrom}
            accentTo={meta.accentTo}
            intensity={isCharging ? "high" : "low"}
          />
        )}
        <div
          className="pointer-events-none absolute -top-16 left-1/2 z-[2] h-32 w-[70%] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background: `linear-gradient(90deg, ${meta.accentFrom}30, ${meta.accentTo}30)`,
          }}
        />

        <div className="relative z-10 flex flex-col items-center px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          {/* Compact header — title inline with info */}
          <div className="flex w-full items-center justify-between">
            <div className="min-w-0 flex-1">
              <h1
                className="truncate text-lg font-bold uppercase tracking-[0.12em] text-white sm:text-xl"
                style={{ textShadow: `0 0 24px ${meta.glowColor}` }}
              >
                {meta.title}
              </h1>
              <p className="text-[10px] text-white/45">
                {meta.subtitle} · {chestTokenIds.length} NFTs
              </p>
            </div>
            {bestDrop && bestDrop.price && !showLoot && (
              <div className="ml-3 shrink-0 rounded-lg border border-amber-400/20 bg-amber-500/8 px-2.5 py-1 text-right">
                <p className="text-[9px] uppercase tracking-wider text-amber-300/60">
                  Best
                </p>
                <p className="text-[11px] font-bold text-amber-300">
                  {formatKeys(bestDrop.price)} KEY
                </p>
              </div>
            )}
          </div>

          {/* --- Chest Art (idle + charging) --- */}
          {showChest && (
            <div
              ref={chestRef}
              className={cn(
                "relative mt-1 h-[200px] w-[85%] transition-transform duration-200 ease-out sm:h-[260px]",
                isCharging && "pointer-events-none",
              )}
            >
              <div
                className={cn(
                  "absolute bottom-0 left-1/2 h-12 w-[55%] -translate-x-1/2 rounded-full blur-3xl",
                  isCharging ? "game-glow-intensify" : "game-chest-glow",
                )}
                style={{ background: meta.accentFrom }}
              />

              {isCharging && (
                <>
                  <div
                    className="game-energy-ring"
                    style={{ "--card-accent": meta.accentFrom } as React.CSSProperties}
                  />
                  <div
                    className="game-energy-ring"
                    style={{ "--card-accent": meta.accentFrom, animationDelay: "0.4s" } as React.CSSProperties}
                  />
                  <div
                    className="game-energy-ring"
                    style={{ "--card-accent": meta.accentFrom, animationDelay: "0.8s" } as React.CSSProperties}
                  />
                </>
              )}

              <div
                className={cn(
                  "relative h-full w-full",
                  !isCharging && "game-chest-float",
                  isCharging && "game-chest-charging",
                )}
              >
                <Image
                  src={meta.chestImage}
                  alt={meta.title}
                  fill
                  className="scale-[1.6] translate-y-4 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.7)] sm:scale-[1.75] sm:translate-y-6"
                  unoptimized
                  priority
                />
              </div>
            </div>
          )}

          {/* --- Loot Grid --- */}
          {showLoot && (
            <div className="mt-3 w-full">
              <LootGrid
                configId={configId}
                items={revealItems}
                paidCount={
                  openResult?.mode === "batch"
                    ? openResult.paidOpens
                    : revealItems.length
                }
                bonusCount={
                  openResult?.mode === "batch"
                    ? openResult.bonusOpens
                    : 0
                }
                onRevealComplete={handleRevealComplete}
                accentFrom={meta.accentFrom}
              />
            </div>
          )}

          {/* === CONTROLS — always visible === */}
          <div className="relative z-20 mt-3 w-full max-w-md">
            {/* Presets + toggle row */}
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center", isIdle ? "gap-1.5" : "gap-1")}>
                {QTY_PRESETS.map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setOpenAmount(qty)}
                    className={cn(
                      "font-bold uppercase tracking-wider transition-all",
                      isIdle
                        ? "rounded-lg border px-2.5 py-1.5 text-[11px] font-black shadow-[0_6px_24px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-3 sm:py-2 sm:text-xs"
                        : "rounded-md px-2 py-1 text-[10px]",
                      openAmount === qty
                        ? isIdle
                          ? "border-white/35 text-white"
                          : "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                        : isIdle
                          ? "border-white/[0.18] bg-black/55 text-white/85 hover:border-white/32 hover:bg-black/70 hover:text-white"
                          : "bg-white/[0.04] text-white/35 hover:bg-white/[0.08] hover:text-white/60",
                    )}
                    style={
                      openAmount === qty
                        ? {
                            background: `linear-gradient(135deg, ${meta.accentFrom}40, ${meta.accentTo}40)`,
                          }
                        : undefined
                    }
                  >
                    x{qty}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoSell}
                      onChange={(e) => setAutoSell(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-3.5 w-6 rounded-full bg-white/10 transition-colors peer-checked:bg-cyan-500/50" />
                    <div className="absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-white/50 transition-all peer-checked:left-3 peer-checked:bg-cyan-300" />
                  </div>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">
                    Auto-sell
                  </span>
                </label>
                {totalCost && (
                  <span className="text-[9px] tabular-nums text-white/30">
                    {formatKeys(totalCost)} KEY
                  </span>
                )}
              </div>
            </div>

            {/* CTA button */}
            <div className="mt-2">
              {needsTokenApproval ? (
                <button
                  onClick={handleApproveToken}
                  disabled={!isConnected || isApproveBusy}
                  className="game-cta-btn w-full rounded-xl border border-white/20 bg-white/8 px-6 py-2.5 text-center text-sm font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition-all hover:bg-white/14 disabled:opacity-40"
                >
                  {isApproveBusy ? "Approving..." : "Approve Token"}
                </button>
              ) : (
                <button
                  onClick={isDone ? handleReset : handleOpenChest}
                  disabled={
                    !isConnected ||
                    isCharging ||
                    isRevealing ||
                    needsTokenApproval
                  }
                  className="game-cta-btn game-cta-shimmer group relative w-full overflow-hidden rounded-xl px-6 py-2.5 text-center text-sm font-bold uppercase tracking-[0.14em] text-white transition-all disabled:opacity-40"
                  style={{
                    background: `linear-gradient(135deg, ${meta.accentFrom}, ${meta.accentTo})`,
                    boxShadow: `0 0 24px ${meta.glowColor}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                  }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    {isCharging
                      ? "Opening..."
                      : isDone
                        ? "OPEN AGAIN"
                        : openAmount > 1
                          ? `OPEN x${openAmount}`
                          : "OPEN"}
                    {!isCharging && !isDone && (
                      <Lock className="h-3.5 w-3.5 text-white/60" />
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/0 transition-all group-hover:bg-white/10" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== SPARKLE SEPARATOR ===== */}
      {chestTokenIds.length > 0 && (
        <div className="flex w-full items-center gap-4 px-4">
          <div
            className="h-px flex-1"
            style={{
              background: `linear-gradient(90deg, transparent, ${meta.accentFrom}40, transparent)`,
            }}
          />
          <div className="flex items-center gap-1.5">
            <span
              className="game-sparkle inline-block h-1.5 w-1.5 rotate-45 rounded-sm"
              style={{ background: meta.accentFrom }}
            />
            <span
              className="game-sparkle inline-block h-2.5 w-2.5 rotate-45 rounded-sm"
              style={{ background: meta.accentFrom, animationDelay: "0.3s" }}
            />
            <span
              className="game-sparkle inline-block h-1.5 w-1.5 rotate-45 rounded-sm"
              style={{ background: meta.accentFrom, animationDelay: "0.6s" }}
            />
          </div>
          <div
            className="h-px flex-1"
            style={{
              background: `linear-gradient(90deg, transparent, ${meta.accentFrom}40, transparent)`,
            }}
          />
        </div>
      )}

      {/* ===== POSSIBLE DROPS ===== */}
      {chestTokenIds.length > 0 && (
        <section className="w-full">
          <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            Possible Drops ({chestTokenIds.length})
          </h2>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {chestTokenIds.map((tid, i) => {
              const pct = dropPercentages[i];
              const price = sellPrices[i];
              const isBonus = isBonusTokenId(tid);
              const tier =
                isBonus
                  ? "legendary"
                  : pct !== undefined
                    ? getRarityTier(pct)
                    : "common";
              const colors = RARITY_COLORS[tier];
              const label = isBonus ? "BONUS" : RARITY_LABELS[tier];
              const isBest = bestDrop?.index === i;
              const tokenLabel = `NFT #${tid.toString()}`;
              const displayName = getTokenDisplayName(tid);
              const priceLabel = price ? `${formatKeys(price, 3)} KEY` : "---";

              return (
                <div
                  key={tid.toString()}
                  className={cn(
                    "game-drop-tile group relative overflow-hidden rounded-xl border bg-[#0a0e1a] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.03]",
                    colors.border,
                  )}
                  style={
                    {
                      boxShadow: `0 0 16px ${colors.glow}`,
                      "--tile-glow": colors.glow,
                    } as React.CSSProperties
                  }
                >
                  {/* IMAGE — elemento principal */}
                  <RewardArtFrame
                    src={getTokenImage(configId, tid)}
                    alt={tokenLabel}
                    isBonus={isBonus}
                    imageClassName="transition-transform duration-300 ease-out group-hover:scale-[1.06]"
                  />

                  {/* Glow de rareza visible solo en hover (inset sobre el borde ya existente) */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ boxShadow: `inset 0 0 0 1.5px ${colors.glow}` }}
                  />

                  {/* Drop rate — arriba izquierda */}
                  {pct !== undefined && (
                    <span className="absolute left-2 top-2 z-20 rounded-md border border-white/15 bg-black/20 px-1.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-md">
                      {pct}%
                    </span>
                  )}

                  {/* Rareza — arriba derecha */}
                  <span
                    className={cn(
                      "absolute right-2 top-2 z-20 rounded-md border bg-black/20 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-md",
                      colors.border,
                      colors.text,
                    )}
                  >
                    {label}
                  </span>

                  {/* Footer minimal — siempre visible, se va en hover */}
                  <div className="absolute inset-x-0 bottom-0 z-20 px-2.5 pb-2.5 transition-all duration-200 group-hover:translate-y-2 group-hover:opacity-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/55">
                      {tokenLabel}
                    </p>
                    <div
                      className="mt-1.5 h-[2px] w-8 rounded-full"
                      style={{ background: colors.glow }}
                    />
                  </div>

                  {/* Panel hover — sube desde abajo, flush con los bordes de la card */}
                  <div className="absolute inset-x-0 bottom-0 z-30 translate-y-full transition-transform duration-200 ease-out group-hover:translate-y-0">
                    <div className="bg-[#0d111c]/75 px-2.5 pb-2 pt-2.5 backdrop-blur-md">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">
                        {tokenLabel}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-extrabold uppercase leading-tight tracking-[0.03em] text-white">
                        {displayName}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold text-white/70">
                          <Coins className="h-3 w-3 shrink-0 text-white/45" />
                          <span className="truncate">{priceLabel}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-white/12 bg-white/6 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-white/65">
                          View
                          <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                      </div>
                    </div>
                    {/* Línea de acento de rareza — flush con el fondo de la card */}
                    <div
                      className="h-[3px] w-full"
                      style={{ background: colors.glow }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {bestDrop && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/50">
              <span>Best drop:</span>
              <span className="font-semibold text-amber-300">
                {getTokenDisplayName(bestDrop.tokenId)}
              </span>
              <span>({bestDrop.pct}%)</span>
              {bestDrop.price && (
                <span className="rounded-md bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  {formatKeys(bestDrop.price, 3)} KEY
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
