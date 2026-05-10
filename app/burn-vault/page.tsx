"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  Clock,
  Flame,
  Gift,
  Layers3,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Vault,
} from "lucide-react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { contractAddresses, getContractConfig } from "@/lib/contracts";
import { getAllLocalConfigs } from "@/lib/chest-configs";
import { formatKeys } from "@/lib/format";
import { useNftInventory } from "@/lib/hooks/use-nft-inventory";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";

const localConfigs = getAllLocalConfigs();

type DropPosition = {
  positionId: bigint;
  configId: number;
  startDay: bigint;
  endDay: bigint;
  lastClaimDay: bigint;
  dailyReward: bigint;
  active: boolean;
  pendingToday: bigint;
};

function field<T>(value: unknown, name: string, index: number, fallback: T): T {
  const record = value as Record<string, unknown> | readonly unknown[] | undefined;
  if (!record) return fallback;
  if (Array.isArray(record) && record[index] !== undefined) return record[index] as T;
  if (!Array.isArray(record)) {
    const namedRecord = record as Record<string, unknown>;
    if (namedRecord[name] !== undefined) return namedRecord[name] as T;
  }
  return fallback;
}

function toPosition(value: unknown): DropPosition {
  return {
    positionId: field(value, "positionId", 0, BigInt(0)),
    configId: Number(field(value, "configId", 1, 0)),
    startDay: field(value, "startDay", 2, BigInt(0)),
    endDay: field(value, "endDay", 3, BigInt(0)),
    lastClaimDay: field(value, "lastClaimDay", 4, BigInt(0)),
    dailyReward: field(value, "dailyReward", 5, BigInt(0)),
    active: Boolean(field(value, "active", 6, false)),
    pendingToday: field(value, "pending", 7, BigInt(0)),
  };
}

function dayToDate(day: bigint) {
  if (day === BigInt(0)) return "-";
  return new Date(Number(day) * 86_400_000).toLocaleDateString();
}

function isExpired(position: DropPosition) {
  const currentDay = BigInt(Math.floor(Date.now() / 86_400_000));
  return position.active && currentDay > position.endDay;
}

function collectionAccent(index: number, complete: boolean) {
  if (!complete) return "border-white/12 from-white/8 to-white/[0.02]";
  const accents = [
    "border-emerald-300/45 from-emerald-400/25 to-cyan-400/10",
    "border-cyan-300/45 from-cyan-400/25 to-blue-400/10",
    "border-fuchsia-300/45 from-fuchsia-400/25 to-violet-400/10",
    "border-amber-300/45 from-amber-400/25 to-orange-400/10",
  ];
  return accents[index % accents.length];
}

function positionPct(position: DropPosition) {
  if (position.startDay === BigInt(0) || position.endDay < position.startDay) {
    return 0;
  }
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  const totalDays = position.endDay - position.startDay + BigInt(1);
  const elapsed = today <= position.startDay
    ? BigInt(1)
    : today >= position.endDay
      ? totalDays
      : today - position.startDay + BigInt(1);
  return Math.min(100, Number((elapsed * BigInt(100)) / totalDays));
}

export default function BurnVaultPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const vaultConfig = getContractConfig("BurnCollectionVault");
  const itemsConfig = getContractConfig("CrateGameItems");
  const bumpBalanceNonce = useAppStore((s) => s.bumpBalanceNonce);
  const bumpInventoryNonce = useAppStore((s) => s.bumpInventoryNonce);
  const bumpUserDataNonce = useAppStore((s) => s.bumpUserDataNonce);
  const { writeContractAsync } = useWriteContract();
  const { balanceMap, refetchInventory } = useNftInventory(address, {
    includeConfiguredTokens: true,
  });

  const { data: isVaultApproved, refetch: refetchApproval } = useReadContract({
    ...itemsConfig,
    functionName: "isApprovedForAll",
    args: address ? [address, contractAddresses.BurnCollectionVault] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const { data: durationDays } = useReadContract({
    ...vaultConfig,
    functionName: "durationDays",
    query: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const { data: bonusBps } = useReadContract({
    ...vaultConfig,
    functionName: "bonusBps",
    query: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const { data: summaryData, refetch: refetchSummary } = useReadContract({
    ...vaultConfig,
    functionName: "getUserSummary",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 15_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
    },
  });

  const { positions, contractPendingTotal } = useMemo(() => {
    if (!summaryData) return { positions: [] as DropPosition[], contractPendingTotal: BigInt(0) };
    const [rawPositions, totalPending] = summaryData as [unknown[], bigint];
    return {
      positions: rawPositions.map((raw) => toPosition(raw)),
      contractPendingTotal: totalPending,
    };
  }, [summaryData]);

  const collectionStatus = useMemo(() => {
    return localConfigs.map((cfg) => {
      const missing = cfg.tokenIds.filter((tokenId) => {
        const balance = balanceMap.get(tokenId.toString()) ?? BigInt(0);
        return balance < BigInt(1);
      });
      const totalValue = cfg.sellPrices.reduce((sum, value) => sum + value, BigInt(0));
      return {
        config: cfg,
        missing,
        complete: missing.length === 0,
        totalValue,
      };
    });
  }, [balanceMap]);

  const completeCollections = collectionStatus.filter((item) => item.complete).length;
  const activePositions = positions.filter((p) => p.active).length;
  const pendingTotal = contractPendingTotal;
  const projectedDaily = positions.reduce(
    (sum, p) => sum + (p.active ? p.dailyReward : BigInt(0)),
    BigInt(0),
  );

  async function refreshVaultData() {
    await Promise.all([
      refetchInventory(),
      refetchApproval(),
      refetchSummary(),
    ]);
    bumpBalanceNonce();
    bumpInventoryNonce();
    bumpUserDataNonce();
  }

  async function waitForTx(hash: `0x${string}`) {
    if (!publicClient) return;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error("Transaction reverted");
    }
  }

  async function sendVaultTx(label: string, action: () => Promise<`0x${string}`>) {
    try {
      const hash = await action();
      toast.info(`${label}: tx enviada`);
      await waitForTx(hash);
      toast.success(`${label}: confirmado`);
      await refreshVaultData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label}: error`);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-white">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide drop-shadow-[0_0_18px_rgba(255,255,255,0.25)]">
            Burn Vault
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-orange-100/45">
            Collection lockup protocol
          </p>
        </div>
        {isConnected && (
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300/30 bg-black/40 text-orange-100 hover:bg-orange-400/10"
            onClick={refreshVaultData}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        )}
      </div>

      {!isConnected && (
        <Alert className="border-orange-300/25 bg-black/50 text-white">
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription>
            Conecta tu wallet para ver colecciones y posiciones del vault.
          </AlertDescription>
        </Alert>
      )}

      {isConnected && (
        <div className="grid gap-3">
          <section className="overflow-hidden rounded-xl border border-orange-300/35 bg-black/55 shadow-[0_0_35px_rgba(249,115,22,0.16)] backdrop-blur-md">
            <div className="border-b border-white/10 bg-gradient-to-r from-orange-500/18 via-fuchsia-400/8 to-transparent px-4 py-2">
              <h2 className="text-sm font-black uppercase tracking-wider">
                Vault status
              </h2>
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-[1.25fr_1fr_auto] lg:items-center">
              <div className="flex items-center gap-4 rounded-lg border border-white/12 bg-black/45 px-4 py-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-orange-300/35 bg-[radial-gradient(circle,rgba(251,146,60,0.22),rgba(0,0,0,0.75)_70%)] shadow-[0_0_25px_rgba(251,146,60,0.22)]">
                  <Vault className="h-11 w-11 text-orange-200" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                    Pending daily rewards
                  </p>
                  <p className="text-4xl font-black tracking-wide text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]">
                    {formatKeys(pendingTotal, 2)} KEY
                  </p>
                  <p className="text-xs text-white/45">
                    Projected daily: {formatKeys(projectedDaily)} KEY
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="flex items-center gap-2 text-white/55">
                    <Clock className="h-4 w-4 text-cyan-200" />
                    Duration
                  </div>
                  <p className="mt-1 text-lg font-black text-white">
                    {String(durationDays ?? "-")}d
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="flex items-center gap-2 text-white/55">
                    <Sparkles className="h-4 w-4 text-amber-200" />
                    Bonus
                  </div>
                  <p className="mt-1 text-lg font-black text-amber-100">
                    {Number(bonusBps ?? 0) / 100}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="flex items-center gap-2 text-white/55">
                    <PackageCheck className="h-4 w-4 text-emerald-200" />
                    Complete
                  </div>
                  <p className="mt-1 text-lg font-black text-emerald-100">
                    {completeCollections}/{collectionStatus.length}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                  <div className="flex items-center gap-2 text-white/55">
                    <Flame className="h-4 w-4 text-orange-200" />
                    Active drops
                  </div>
                  <p className="mt-1 text-lg font-black text-orange-100">
                    {activePositions}
                  </p>
                </div>
              </div>

              <div className="flex min-w-60 flex-col gap-2">
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    isVaultApproved
                      ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
                      : "border-amber-300/35 bg-amber-400/10 text-amber-100",
                  )}
                >
                  <div className="flex items-center gap-2 font-black uppercase tracking-wide">
                    {isVaultApproved ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <LockKeyhole className="h-4 w-4" />
                    )}
                    {isVaultApproved ? "Vault approved" : "Approval required"}
                  </div>
                  <p className="mt-1 text-xs opacity-75">
                    {isVaultApproved
                      ? "Listo para quemar colecciones completas."
                      : "Autoriza ERC1155 para iniciar drops."}
                  </p>
                </div>
                {!isVaultApproved && (
                  <Button
                    className="h-10 border border-orange-300/60 bg-orange-500/20 font-black uppercase tracking-wide text-white shadow-[0_0_18px_rgba(249,115,22,0.25)] hover:bg-orange-500/30"
                    onClick={() =>
                      sendVaultTx("Approve Burn Vault", () =>
                        writeContractAsync({
                          ...itemsConfig,
                          functionName: "setApprovalForAll",
                          args: [contractAddresses.BurnCollectionVault, true],
                        }),
                      )
                    }
                  >
                    Approve Burn Vault
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-amber-300/30 bg-black/45 text-amber-100 hover:bg-amber-400/10"
                  disabled={pendingTotal === BigInt(0)}
                  onClick={() =>
                    sendVaultTx("Full claim", () =>
                      writeContractAsync({
                        ...vaultConfig,
                        functionName: "fullClaim",
                      }),
                    )
                  }
                >
                  Claim all rewards
                  <Gift className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="overflow-hidden rounded-xl border border-orange-300/35 bg-black/55 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Collection burn queue
                </h2>
                <span className="text-xs uppercase tracking-wider text-white/40">
                  Complete set required
                </span>
              </div>
              <div className="grid gap-2 p-3 md:grid-cols-2">
                {collectionStatus.map(({ config, missing, complete, totalValue }, index) => {
                  const ownedCount = config.tokenIds.length - missing.length;
                  const pct = config.tokenIds.length > 0
                    ? Math.round((ownedCount / config.tokenIds.length) * 100)
                    : 0;
                  return (
                    <div
                      key={config.configId}
                      className={cn(
                        "rounded-lg border bg-gradient-to-br p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                        collectionAccent(index, complete),
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black uppercase tracking-wide">
                            {config.name}
                          </p>
                          <p className="text-xs text-white/45">
                            Config #{config.configId} · {config.tokenIds.length} items
                          </p>
                        </div>
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                            complete
                              ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-100"
                              : "border-white/15 bg-black/35 text-white/45",
                          )}
                        >
                          {complete ? <CheckCircle2 className="h-6 w-6" /> : <Layers3 className="h-6 w-6" />}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-xs text-white/55">
                          <span>Collection progress</span>
                          <span>{ownedCount}/{config.tokenIds.length}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full border border-white/15 bg-black/70">
                          <div
                            className={cn(
                              "h-full",
                              complete
                                ? "bg-gradient-to-r from-emerald-300 to-cyan-300"
                                : "bg-gradient-to-r from-orange-300 to-fuchsia-300",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
                          <p className="text-white/40">Base value</p>
                          <p className="font-black text-amber-100">
                            {formatKeys(totalValue)} KEY
                          </p>
                        </div>
                        <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
                          <p className="text-white/40">Status</p>
                          <p className={cn("font-black", complete ? "text-emerald-200" : "text-orange-200")}>
                            {complete ? "Ready" : `${missing.length} missing`}
                          </p>
                        </div>
                      </div>

                      {!complete && (
                        <p className="mt-2 line-clamp-1 text-[10px] text-white/35">
                          Missing: {missing.map((id) => id.toString()).join(", ")}
                        </p>
                      )}

                      <Button
                        size="sm"
                        disabled={!complete || !isVaultApproved}
                        className="mt-3 w-full bg-white/85 font-black uppercase text-black hover:bg-white disabled:bg-white/25 disabled:text-white/40"
                        onClick={() =>
                          sendVaultTx("Burn collection", () =>
                            writeContractAsync({
                              ...vaultConfig,
                              functionName: "burnCollectionForDrop",
                              args: [config.configId],
                            }),
                          )
                        }
                      >
                        Burn for daily drop
                        <Flame className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-orange-300/35 bg-black/55 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Active positions
                </h2>
                <span className="text-xs uppercase tracking-wider text-white/40">
                  {positions.length} total
                </span>
              </div>

              <div className="space-y-2 p-3">
                {positions.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-black/35 px-3 py-8 text-center text-sm text-white/45">
                    No tienes posiciones creadas.
                  </p>
                ) : (
                  positions.map((pos) => {
                    const pct = positionPct(pos);
                    const expired = isExpired(pos);
                    return (
                      <div
                        key={pos.positionId.toString()}
                        className="rounded-lg border border-white/12 bg-black/45 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-orange-300/30 bg-orange-400/10">
                              <Archive className="h-7 w-7 text-orange-200" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black uppercase tracking-wide">
                                Position #{pos.positionId.toString()}
                              </p>
                              <p className="text-xs text-white/45">
                                Config #{pos.configId} · {dayToDate(pos.startDay)} - {dayToDate(pos.endDay)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "rounded border px-2 py-0.5 text-[10px] font-black uppercase",
                              !pos.active
                                ? "border-white/15 text-white/35"
                                : expired
                                  ? "border-orange-300/40 text-orange-200"
                                  : "border-emerald-300/40 text-emerald-200",
                            )}
                          >
                            {!pos.active ? "Inactive" : expired ? "Expired" : "Active"}
                          </span>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-xs text-white/55">
                            <span>Drop cycle</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full border border-white/15 bg-black/70">
                            <div
                              className="h-full bg-gradient-to-r from-orange-300 via-amber-200 to-emerald-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
                            <p className="text-white/40">Daily reward</p>
                            <p className="font-black text-amber-100">
                              {formatKeys(pos.dailyReward)} KEY
                            </p>
                          </div>
                          <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
                            <p className="text-white/40">Pending today</p>
                            <p className="font-black text-emerald-100">
                              {formatKeys(pos.pendingToday)} KEY
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={pos.pendingToday === BigInt(0)}
                            className="flex-1 bg-emerald-400/90 font-black uppercase text-black hover:bg-emerald-300 disabled:bg-white/20 disabled:text-white/35"
                            onClick={() =>
                              sendVaultTx("Claim position", () =>
                                writeContractAsync({
                                  ...vaultConfig,
                                  functionName: "claim",
                                  args: [pos.positionId],
                                }),
                              )
                            }
                          >
                            Claim
                            <Gift className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!expired}
                            className="border-white/15 bg-black/35 text-white hover:bg-white/10"
                            onClick={() =>
                              sendVaultTx("Expire position", () =>
                                writeContractAsync({
                                  ...vaultConfig,
                                  functionName: "expireDrop",
                                  args: [pos.positionId],
                                }),
                              )
                            }
                          >
                            Expire
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
