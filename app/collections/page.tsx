"use client";

import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RewardArtFrame } from "@/components/reward-art-frame";
import { getContractConfig, contractAddresses } from "@/lib/contracts";
import { formatKeys } from "@/lib/format";
import {
  getTokenDisplayName,
  getTokenImageFromCatalog,
  isBonusTokenId,
} from "@/lib/item-catalog";
import { getAllLocalConfigs } from "@/lib/chest-configs";
import { useNftInventory } from "@/lib/hooks/use-nft-inventory";
import { useAppStore } from "@/lib/store/app-store";

const localConfigs = getAllLocalConfigs();

export default function CollectionsPage() {
  const { address, isConnected } = useAccount();
  const bumpInventoryNonce = useAppStore((s) => s.bumpInventoryNonce);

  const itemsConfig = getContractConfig("CrateGameItems");
  const shopConfig = getContractConfig("Shop");
  const { balanceMap, isFirstLoad, isRefreshing, refetchInventory } =
    useNftInventory(address);

  const { data: isShopApproved, refetch: refetchShopApproval } =
    useReadContract({
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

  const {
    data: sellHash,
    isPending: isSellPending,
    writeContractAsync: writeSell,
  } = useWriteContract();
  const { isLoading: isSellConfirming } = useWaitForTransactionReceipt({
    hash: sellHash,
  });
  const isSellBusy = isSellPending || isSellConfirming;

  async function handleApproveShop() {
    try {
      await writeApprove({
        ...itemsConfig,
        functionName: "setApprovalForAll",
        args: [contractAddresses.Shop, true],
      });
      toast.success("Approval para Shop enviado");
      refetchShopApproval();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar Shop");
    }
  }

  async function handleSell(cfgId: number, tokenId: bigint) {
    try {
      await writeSell({
        ...shopConfig,
        functionName: "sell",
        args: [cfgId, tokenId, BigInt(1)],
      });
      toast.success("Venta realizada!");
      await refetchInventory();
      bumpInventoryNonce();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al vender");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Collections</h1>
        <p className="text-muted-foreground">
          Tus NFTs agrupados por cofre.
        </p>
      </div>

      {!isConnected && (
        <Alert>
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription>
            Conecta tu wallet para ver tu coleccion.
          </AlertDescription>
        </Alert>
      )}

      {isConnected && !isShopApproved && (
        <Button
          onClick={handleApproveShop}
          disabled={isApproveBusy}
          variant="outline"
          className="w-fit"
        >
          {isApproveBusy ? "Aprobando..." : "Approve NFTs para vender"}
        </Button>
      )}

      {isConnected && localConfigs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay cofres configurados aun.
        </p>
      )}

      {isConnected && isFirstLoad && (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm text-white/70">Loading your NFTs...</p>
        </div>
      )}

      {isConnected && !isFirstLoad && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs text-white/50 hover:text-white/80"
            onClick={() => refetchInventory()}
            disabled={isRefreshing}
          >
            <span className={isRefreshing ? "animate-spin" : ""}>&#x21bb;</span>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      )}

      {isConnected &&
        localConfigs.map((cfg) => {
          const cfgId = cfg.configId;
          const tokenIds = cfg.tokenIds;
          const sellPrices = cfg.sellPrices;

          return (
            <section key={cfgId} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  Collection {cfgId}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    — {cfg.name}
                  </span>
                </h2>
                <Link
                  href={`/game?configId=${cfgId}`}
                  className="rounded-md border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Open Chest
                </Link>
              </div>

              {tokenIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin drops en esta coleccion.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {tokenIds.map((tid, i) => {
                    const bal = balanceMap.get(tid.toString());
                    const hasToken = bal !== undefined && bal > BigInt(0);
                    const price = sellPrices[i];
                    const isBonus = isBonusTokenId(tid);

                    return (
                      <Card key={tid.toString()} className="overflow-hidden">
                        <div className="relative">
                          <RewardArtFrame
                            src={getTokenImageFromCatalog(tid, cfgId)}
                            alt={`NFT ${tid.toString()}`}
                            isBonus={isBonus}
                            dimmed={!hasToken}
                          />
                          {isBonus && (
                            <span className="absolute top-1.5 left-1.5 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                              BONUS
                            </span>
                          )}
                          {hasToken && (
                            <span className="absolute top-1.5 right-1.5 rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                              x{bal.toString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-2.5 py-2">
                          <div className="flex flex-col">
                            <span className="max-w-[100px] truncate text-[11px] font-semibold">
                              {getTokenDisplayName(tid)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {price ? `${formatKeys(price)} KEY` : "-"}
                            </span>
                          </div>
                          {hasToken && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2.5 text-xs"
                              disabled={isSellBusy || !isShopApproved}
                              onClick={() => handleSell(cfgId, tid)}
                            >
                              {isSellBusy ? "..." : "Sell"}
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
