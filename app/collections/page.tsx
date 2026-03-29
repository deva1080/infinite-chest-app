"use client";

import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getContractConfig, contractAddresses } from "@/lib/contracts";
import { normalizeChestConfig } from "@/lib/contracts/chest-config";
import { formatKeys } from "@/lib/format";

export default function CollectionsPage() {
  const { address, isConnected } = useAccount();

  const chestConfig = getContractConfig("InfiniteChest");
  const itemsConfig = getContractConfig("CrateGameItems");
  const shopConfig = getContractConfig("Shop");

  const { data: configCount } = useReadContract({
    ...chestConfig,
    functionName: "configCount",
    query: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  });

  const count = configCount !== undefined ? Number(configCount) : 0;
  const configIds = Array.from({ length: count }, (_, i) => i);

  const { data: configs } = useReadContracts({
    contracts: configIds.map((id) => ({
      ...chestConfig,
      functionName: "getConfig" as const,
      args: [id],
    })),
    query: {
      enabled: count > 0,
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const configTokenIds: bigint[][] = [];
  for (let i = 0; i < count; i++) {
    const normalized = normalizeChestConfig(configs?.[i]?.result);
    configTokenIds.push(normalized.tokenIds);
  }

  const allTokenIds = configTokenIds.flat();

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

  const ownedSet = new Set(
    ((ownedIds as bigint[]) ?? []).map((id) => id.toString()),
  );

  const ownedIdsList = (ownedIds as bigint[]) ?? [];

  const { data: balances } = useReadContracts({
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

  const balanceMap = new Map<string, bigint>();
  if (balances) {
    for (let i = 0; i < ownedIdsList.length; i++) {
      const val = balances[i]?.result;
      if (val != null) {
        balanceMap.set(ownedIdsList[i].toString(), val as bigint);
      }
    }
  }

  const { data: prices } = useReadContracts({
    contracts: allTokenIds.map((tid) => ({
      ...shopConfig,
      functionName: "tokenPrice" as const,
      args: [tid],
    })),
    query: {
      enabled: allTokenIds.length > 0,
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const priceMap = new Map<string, bigint>();
  if (prices) {
    for (let i = 0; i < allTokenIds.length; i++) {
      const val = prices[i]?.result;
      if (val != null) {
        priceMap.set(allTokenIds[i].toString(), val as bigint);
      }
    }
  }

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
      refetchOwned();
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

      {isConnected && count === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay cofres configurados aun.
        </p>
      )}

      {isConnected &&
        configIds.map((cfgId) => {
          const tokenIds = configTokenIds[cfgId] ?? [];

          return (
            <section key={cfgId} className="space-y-3">
              <h2 className="text-lg font-semibold">Collection {cfgId}</h2>

              {tokenIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Cargando IDs de esta coleccion...
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {tokenIds.map((tid) => {
                    const bal = balanceMap.get(tid.toString());
                    const hasToken = ownedSet.has(tid.toString()) && bal !== undefined && bal > BigInt(0);
                    const price = priceMap.get(tid.toString());

                    return (
                      <Card key={tid.toString()} className="overflow-hidden">
                        <div className="relative">
                          <img
                            src={`/collections/${cfgId}_${tid.toString()}.webp`}
                            alt={`NFT ${tid.toString()}`}
                            className={
                              hasToken
                                ? "aspect-square w-full object-cover"
                                : "aspect-square w-full object-cover grayscale blur-[1.5px] opacity-50"
                            }
                          />
                          {hasToken && (
                            <span className="absolute top-1.5 right-1.5 rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                              x{bal.toString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-2.5 py-2">
                          <span className="text-xs text-muted-foreground">
                            {price ? `${formatKeys(price)} KEY` : "-"}
                          </span>
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
