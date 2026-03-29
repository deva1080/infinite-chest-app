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

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getContractConfig, contractAddresses } from "@/lib/contracts";
import { contractAbis } from "@/lib/contracts/abis";
import { normalizeChestConfig } from "@/lib/contracts/chest-config";
import { formatKeys } from "@/lib/format";

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

  const chestConfig = getContractConfig("InfiniteChest");
  const shopConfig = getContractConfig("Shop");

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

  // Set initial random displayed image
  useEffect(() => {
    if (chestTokenIds.length > 0 && !displayedTokenId && !openResult) {
      const rand = chestTokenIds[Math.floor(Math.random() * chestTokenIds.length)];
      setDisplayedTokenId(rand);
    }
  }, [chestTokenIds, displayedTokenId, openResult]);

  // Spinning animation: cycle random images while opening
  useEffect(() => {
    if (isOpening && chestTokenIds.length > 1) {
      let idx = 0;
      spinIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % chestTokenIds.length;
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

  // When result arrives, show the correct image
  useEffect(() => {
    if (openResult) {
      setDisplayedTokenId(openResult.resultTokenId);
    }
  }, [openResult]);

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
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 py-4">
      {!isConnected && (
        <Alert>
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription>Conecta tu wallet para jugar.</AlertDescription>
        </Alert>
      )}

      {/* --- Open Chest Section --- */}
      <div className="flex w-full flex-col items-center gap-5">
        <div className="relative flex w-full items-center justify-center rounded-[2rem] border bg-card p-6 shadow-sm">
          {/* NFT image slot */}
          <div
            className={`relative aspect-square w-36 overflow-hidden rounded-lg border bg-muted ${
              isOpening ? "animate-pulse" : ""
            } ${openResult ? "ring-2 ring-primary ring-offset-2" : ""}`}
          >
            {currentImage ? (
              <Image
                src={currentImage}
                alt="NFT"
                fill
                className={`object-cover transition-transform ${
                  isOpening ? "scale-105" : ""
                }`}
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                ?
              </div>
            )}
          </div>

          {openResult && (
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-semibold text-primary">
              NFT #{openResult.resultTokenId.toString()}
            </p>
          )}
        </div>

        {/* Open / Approve button */}
        {needsTokenApproval ? (
          <Button
            onClick={handleApproveToken}
            disabled={!isConnected || isApproveBusy}
            variant="outline"
            className="w-full max-w-xs rounded-full text-base"
            size="lg"
          >
            {isApproveBusy ? "Aprobando..." : "Approve Token"}
          </Button>
        ) : (
          <Button
            onClick={handleOpenChest}
            disabled={!isConnected || isOpening || needsTokenApproval}
            className="w-full max-w-xs rounded-full text-base"
            size="lg"
          >
            {isOpening
              ? "Abriendo..."
              : `Open — ${chestPrice ? formatKeys(chestPrice) : "..."} KEY`}
          </Button>
        )}
      </div>

      {/* --- NFT Gallery (drop % + value) --- */}
      {chestTokenIds.length > 0 && (
        <section className="w-full space-y-3">
          <h2 className="text-center text-sm font-medium text-muted-foreground">
            {chestTokenIds.length} posibles NFTs
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {chestTokenIds.map((tid, i) => {
              const pct = dropPercentages[i];
              const price = priceMap.get(tid.toString());
              return (
                <div
                  key={tid.toString()}
                  className="group relative overflow-hidden rounded-lg border bg-muted"
                >
                  <div className="relative aspect-square">
                    <Image
                      src={getTokenImage(configId, tid)}
                      alt={`NFT #${tid.toString()}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {/* Drop % badge */}
                    {pct !== undefined && (
                      <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {pct}%
                      </span>
                    )}
                    {/* Value overlay at bottom center */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1 pt-4 text-center">
                      <span className="text-[11px] font-medium text-white">
                        {price ? `${formatKeys(price)} KEY` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
