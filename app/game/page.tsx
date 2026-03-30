"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { decodeEventLog, type Address, parseAbiItem } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { getContractConfig, contractAddresses } from "@/lib/contracts";
import { contractAbis } from "@/lib/contracts/abis";
import { normalizeChestConfig } from "@/lib/contracts/chest-config";
import { formatKeys } from "@/lib/format";
import {
  getChestMeta,
  getRarityTier,
  RARITY_COLORS,
  RARITY_LABELS,
} from "@/lib/chest-meta";
import { cn } from "@/lib/utils";

const erc20Abi = contractAbis.Key;

const chestOpenedEvent = parseAbiItem(
  "event ChestOpened(address indexed caller, address indexed user, uint32 indexed configId, uint256 rollNonce, uint256 rolledIndex, uint256 resultTokenId, address paymentToken, uint256 price)",
);

type OpenResult = {
  resultTokenId: bigint;
  rolledIndex: bigint;
  price: bigint;
};

function getTokenImage(configId: number, tokenId: bigint) {
  return `/collections/${configId}_${tokenId.toString()}.webp`;
}

function computeDropPercentages(weightRanges: bigint[]): number[] {
  if (weightRanges.length === 0) return [];
  const total = weightRanges[weightRanges.length - 1];
  if (total === BigInt(0)) return weightRanges.map(() => 0);
  return weightRanges.map((range, i) => {
    const weight = i === 0 ? range : range - weightRanges[i - 1];
    return Number((weight * BigInt(10000)) / total) / 100;
  });
}

export default function GamePage() {
  const searchParams = useSearchParams();
  const configId = Number(searchParams.get("configId") ?? "0");
  const referrer = searchParams.get("ref") ?? undefined;

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [isOpening, setIsOpening] = useState(false);
  const [openResult, setOpenResult] = useState<OpenResult | null>(null);
  const [displayedTokenId, setDisplayedTokenId] = useState<bigint | null>(null);
  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chestRef = useRef<HTMLDivElement>(null);

  const chestConfig = getContractConfig("InfiniteChest");
  const shopConfig = getContractConfig("Shop");
  const meta = getChestMeta(configId);

  const { data: chestData } = useReadContract({
    ...chestConfig,
    functionName: "getConfig",
    args: [configId],
    query: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  });

  const normalizedConfig = normalizeChestConfig(chestData);
  const chestPrice = normalizedConfig.price;
  const chestPaymentToken = normalizedConfig.token;
  const chestTokenIds = normalizedConfig.tokenIds;
  const weightRanges = normalizedConfig.weightRanges;

  const dropPercentages = useMemo(
    () => computeDropPercentages(weightRanges),
    [weightRanges],
  );

  const { data: prices } = useReadContracts({
    contracts: chestTokenIds.map((tid) => ({
      ...shopConfig,
      functionName: "tokenPrice" as const,
      args: [tid],
    })),
    query: {
      enabled: chestTokenIds.length > 0,
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const priceMap = useMemo(() => {
    const map = new Map<string, bigint>();
    if (prices) {
      for (let i = 0; i < chestTokenIds.length; i++) {
        const val = prices[i]?.result;
        if (val != null) map.set(chestTokenIds[i].toString(), val as bigint);
      }
    }
    return map;
  }, [prices, chestTokenIds]);

  const bestDrop = useMemo(() => {
    if (chestTokenIds.length === 0 || dropPercentages.length === 0) return null;
    let bestIdx = 0;
    let lowestPct = dropPercentages[0];
    for (let i = 1; i < dropPercentages.length; i++) {
      if (dropPercentages[i] < lowestPct) {
        lowestPct = dropPercentages[i];
        bestIdx = i;
      }
    }
    const tid = chestTokenIds[bestIdx];
    const price = priceMap.get(tid.toString());
    return { tokenId: tid, pct: lowestPct, price, index: bestIdx };
  }, [chestTokenIds, dropPercentages, priceMap]);

  const { data: paymentAllowance, refetch: refetchAllowance } = useReadContract({
    address: chestPaymentToken as Address | undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && chestPaymentToken ? [address, contractAddresses.Treasury] : undefined,
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
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const needsTokenApproval =
    chestPrice !== undefined &&
    paymentAllowance !== undefined &&
    (paymentAllowance as bigint) < chestPrice;

  const isApproveBusy = isApprovePending || isApproveConfirming;

  async function handleApproveToken() {
    if (!chestPrice || !chestPaymentToken) return;
    try {
      await writeApprove({
        address: chestPaymentToken as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [contractAddresses.Treasury, chestPrice * BigInt(100)],
      });
      toast.success("Approve enviado");
      refetchAllowance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar");
    }
  }

  useEffect(() => {
    if (chestTokenIds.length > 0 && !displayedTokenId && !openResult) {
      const rand = chestTokenIds[Math.floor(Math.random() * chestTokenIds.length)];
      setDisplayedTokenId(rand);
    }
  }, [chestTokenIds, displayedTokenId, openResult]);

  useEffect(() => {
    if (isOpening && chestTokenIds.length > 1) {
      spinIntervalRef.current = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * chestTokenIds.length);
        setDisplayedTokenId(chestTokenIds[randomIdx]);
      }, 120);
    } else if (spinIntervalRef.current) {
      clearInterval(spinIntervalRef.current);
      spinIntervalRef.current = null;
    }
    return () => {
      if (spinIntervalRef.current) {
        clearInterval(spinIntervalRef.current);
        spinIntervalRef.current = null;
      }
    };
  }, [isOpening, chestTokenIds]);

  useEffect(() => {
    if (openResult) {
      setDisplayedTokenId(openResult.resultTokenId);
    }
  }, [openResult]);

  // Parallax on mouse move
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
    if (!address || !publicClient) return;
    setIsOpening(true);
    setOpenResult(null);

    try {
      const res = await fetch("/api/open-chest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId, userAddress: address, referrer }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error del servidor");

      const txHash = data.hash as `0x${string}`;
      toast.info(`Tx enviada: ${txHash.slice(0, 10)}...`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error("Fail tx");
      }

      let eventFound = false;

      for (const log of receipt.logs) {
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
              resultTokenId: args.resultTokenId,
              rolledIndex: args.rolledIndex,
              price: args.price,
            });
            toast.success(`NFT #${args.resultTokenId} obtenido!`);
            eventFound = true;
            break;
          }
        } catch {
          // Not our event
        }
      }

      if (!eventFound) {
        toast.error("Fail tx");
      }

      refetchAllowance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al abrir el chest");
    } finally {
      setIsOpening(false);
    }
  }, [address, publicClient, configId, referrer, refetchAllowance]);

  const currentImage = displayedTokenId
    ? getTokenImage(configId, displayedTokenId)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-2">
      {/* Wallet disconnected */}
      {!isConnected && (
        <div className="w-full rounded-2xl border border-amber-400/30 bg-amber-500/8 px-5 py-4 text-center backdrop-blur-sm">
          <p className="text-sm font-semibold text-amber-200">
            Wallet desconectada
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            Conecta tu wallet para jugar.
          </p>
        </div>
      )}

      {/* ===== HERO CARD ===== */}
      <div
        className="game-hero-card relative w-full overflow-hidden rounded-3xl border border-white/12"
        style={{
          background: `linear-gradient(170deg, ${meta.accentFrom}18 0%, #0a0e1a 35%, #0d1117 100%)`,
          boxShadow: `0 0 80px ${meta.glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {/* Scanlines overlay */}
        <div className="game-scanlines pointer-events-none absolute inset-0 z-[1]" />

        {/* Ambient glow top */}
        <div
          className="pointer-events-none absolute -top-20 left-1/2 z-[2] h-40 w-[70%] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: `linear-gradient(90deg, ${meta.accentFrom}30, ${meta.accentTo}30)` }}
        />

        <div className="relative z-10 flex flex-col items-center px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
          {/* --- Identity --- */}
          <h1
            className="text-center text-2xl font-bold uppercase tracking-[0.14em] text-white sm:text-3xl"
            style={{ textShadow: `0 0 32px ${meta.glowColor}` }}
          >
            {meta.title}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-white/65">
            <span>{meta.subtitle}</span>
            <span className="text-white/30">|</span>
            <span>{chestTokenIds.length} possible NFTs</span>
          </div>

          {bestDrop && bestDrop.price && (
            <p className="mt-1.5 text-xs text-white/50">
              Best drop:{" "}
              <span className="font-semibold text-amber-300">
                NFT #{bestDrop.tokenId.toString()}
              </span>{" "}
              ({bestDrop.pct}%)
            </p>
          )}

          {/* --- Chest Art with float + parallax --- */}
          <div
            ref={chestRef}
            className="relative mb-[-4rem] mt-0 h-[280px] w-[90%] transition-transform duration-200 ease-out sm:h-[360px]"
          >
            {/* Breathing glow under chest */}
            <div
              className="game-chest-glow absolute bottom-2 left-1/2 h-16 w-[60%] -translate-x-1/2 rounded-full blur-3xl"
              style={{ background: `${meta.accentFrom}` }}
            />
            <div className="game-chest-float relative h-full w-full">
              {!openResult ? (
                <Image
                  src={meta.chestImage}
                  alt={meta.title}
                  fill
                  className={cn(
                    "object-contain scale-[1.75] translate-y-6 drop-shadow-[0_24px_48px_rgba(0,0,0,0.7)] sm:scale-[1.9] sm:translate-y-8",
                    isOpening && "animate-pulse",
                  )}
                  unoptimized
                  priority
                />
              ) : (
                <div className="relative h-full w-full">
                  {currentImage && (
                    <Image
                      src={currentImage}
                      alt="NFT Result"
                      fill
                      className="object-contain drop-shadow-[0_24px_48px_rgba(0,0,0,0.7)]"
                      unoptimized
                    />
                  )}
                  <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold text-white">
                    NFT #{openResult.resultTokenId.toString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* --- CTA with shimmer --- */}
          <div className="relative z-20 mt-6 flex w-full max-w-sm flex-col items-center gap-2">
            {needsTokenApproval ? (
              <button
                onClick={handleApproveToken}
                disabled={!isConnected || isApproveBusy}
                className="game-cta-btn w-full rounded-2xl border border-white/20 bg-white/8 px-8 py-4 text-center font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm transition-all hover:bg-white/14 disabled:opacity-40"
              >
                {isApproveBusy ? "Approving..." : "Approve Token"}
              </button>
            ) : (
              <button
                onClick={handleOpenChest}
                disabled={!isConnected || isOpening || needsTokenApproval}
                className="game-cta-btn game-cta-shimmer group relative w-full overflow-hidden rounded-2xl px-8 py-4 text-center font-bold uppercase tracking-[0.16em] text-white transition-all disabled:opacity-40"
                style={{
                  background: `linear-gradient(135deg, ${meta.accentFrom}, ${meta.accentTo})`,
                  boxShadow: `0 0 32px ${meta.glowColor}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                }}
              >
                <span className="relative z-10 text-lg">
                  {isOpening ? "Opening..." : "OPEN CHEST"}
                </span>
                {!isOpening && chestPrice && (
                  <span className="relative z-10 mt-0.5 block text-[11px] font-medium tracking-wider text-white/80">
                    Cost: {formatKeys(chestPrice)} KEY
                  </span>
                )}
                <div className="absolute inset-0 bg-white/0 transition-all group-hover:bg-white/10" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== SPARKLE SEPARATOR ===== */}
      {chestTokenIds.length > 0 && (
        <div className="flex w-full items-center gap-4 px-4">
          <div
            className="h-px flex-1"
            style={{ background: `linear-gradient(90deg, transparent, ${meta.accentFrom}40, transparent)` }}
          />
          <div className="flex items-center gap-1.5">
            <span className="game-sparkle inline-block h-1.5 w-1.5 rotate-45 rounded-sm" style={{ background: meta.accentFrom }} />
            <span className="game-sparkle inline-block h-2.5 w-2.5 rotate-45 rounded-sm" style={{ background: meta.accentFrom, animationDelay: "0.3s" }} />
            <span className="game-sparkle inline-block h-1.5 w-1.5 rotate-45 rounded-sm" style={{ background: meta.accentFrom, animationDelay: "0.6s" }} />
          </div>
          <div
            className="h-px flex-1"
            style={{ background: `linear-gradient(90deg, transparent, ${meta.accentFrom}40, transparent)` }}
          />
        </div>
      )}

      {/* ===== POSSIBLE DROPS ===== */}
      {chestTokenIds.length > 0 && (
        <section className="w-full">
          <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
            Possible Drops ({chestTokenIds.length})
          </h2>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {chestTokenIds.map((tid, i) => {
              const pct = dropPercentages[i];
              const price = priceMap.get(tid.toString());
              const tier = pct !== undefined ? getRarityTier(pct) : "common";
              const colors = RARITY_COLORS[tier];
              const label = RARITY_LABELS[tier];
              const isBest = bestDrop?.index === i;

              return (
                <div
                  key={tid.toString()}
                  className={cn(
                    "game-drop-tile group relative overflow-hidden rounded-xl border transition-all duration-200 hover:scale-[1.04]",
                    colors.border,
                  )}
                  style={{
                    boxShadow: `0 0 16px ${colors.glow}`,
                    "--tile-glow": colors.glow,
                  } as React.CSSProperties}
                >
                  {/* Best drop crown badge */}
                  {isBest && (
                    <div className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/50 bg-[#0a0e1a]/90 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                      Best
                    </div>
                  )}

                  <div className="relative aspect-square bg-gradient-to-b from-white/5 to-transparent">
                    <Image
                      src={getTokenImage(configId, tid)}
                      alt={`NFT #${tid.toString()}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {/* Percentage badge */}
                    {pct !== undefined && (
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        {pct}%
                      </span>
                    )}

                    {/* Micro-separator + Rarity tag */}
                    <div className="absolute right-1 top-1 flex items-center gap-1">
                      <span
                        className="h-3 w-0.5 rounded-full"
                        style={{ background: colors.glow.replace(/[\d.]+\)$/, "0.7)") }}
                      />
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-sm",
                          colors.border,
                          colors.text,
                        )}
                        style={{ background: "rgba(0,0,0,0.65)" }}
                      >
                        {label}
                      </span>
                    </div>
                  </div>
                  {/* Bottom info */}
                  <div className="bg-[#0a0e1a]/90 px-2 py-2 text-center">
                    <p className="truncate text-[11px] font-semibold text-white">
                      #{tid.toString()}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/55">
                      {price ? `${formatKeys(price)} KEY` : "---"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Best drop callout */}
          {bestDrop && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/50">
              <span>Best drop:</span>
              <span className="font-semibold text-amber-300">
                NFT #{bestDrop.tokenId.toString()}
              </span>
              <span>({bestDrop.pct}%)</span>
              {bestDrop.price && (
                <span className="rounded-md bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  {formatKeys(bestDrop.price)} KEY
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
