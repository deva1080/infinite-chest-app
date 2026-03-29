"use client";

import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getContractConfig, contractAddresses } from "@/lib/contracts";
import { formatKeys } from "@/lib/format";

export default function ShopPage() {
  const { address, isConnected } = useAccount();

  const [sellTokenId, setSellTokenId] = useState("");
  const [sellAmount, setSellAmount] = useState("1");
  const [sellConfigId, setSellConfigId] = useState("0");

  const shopConfig = getContractConfig("Shop");
  const itemsConfig = getContractConfig("CrateGameItems");

  // --- NFT inventory ---
  const { data: ownedIds, refetch: refetchInventory } = useReadContract({
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

  const { data: nftBalances } = useReadContracts({
    contracts: ownedIdsList.map((id) => ({
      ...itemsConfig,
      functionName: "balanceOf" as const,
      args: [address!, id],
    })),
    query: {
      enabled: Boolean(address) && ownedIdsList.length > 0,
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  // --- Sell prices ---
  const { data: sellPrices } = useReadContracts({
    contracts: ownedIdsList.map((id) => ({
      ...shopConfig,
      functionName: "tokenPrice" as const,
      args: [id],
    })),
    query: {
      enabled: ownedIdsList.length > 0,
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  // --- Shop approval ---
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

  // --- Write: shop approve ---
  const {
    data: shopApproveHash,
    isPending: isShopApprovePending,
    writeContractAsync: writeShopApprove,
  } = useWriteContract();
  const { isLoading: isShopApproveConfirming } = useWaitForTransactionReceipt({
    hash: shopApproveHash,
  });

  // --- Write: sell ---
  const {
    data: sellHash,
    isPending: isSellPending,
    writeContractAsync: writeSell,
  } = useWriteContract();
  const { isLoading: isSellConfirming } = useWaitForTransactionReceipt({
    hash: sellHash,
  });

  const isShopApproveBusy = isShopApprovePending || isShopApproveConfirming;
  const isSellBusy = isSellPending || isSellConfirming;

  async function handleApproveShop() {
    try {
      await writeShopApprove({
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

  async function handleSell(e: React.FormEvent) {
    e.preventDefault();
    const tokenId = Number.parseInt(sellTokenId, 10);
    const amount = Number.parseInt(sellAmount, 10);
    const cfgId = Number.parseInt(sellConfigId, 10);
    if (Number.isNaN(tokenId) || Number.isNaN(amount) || amount <= 0 || Number.isNaN(cfgId)) {
      toast.error("Config ID, Token ID y cantidad deben ser validos");
      return;
    }
    try {
      await writeSell({
        ...shopConfig,
        functionName: "sell",
        args: [cfgId, BigInt(tokenId), BigInt(amount)],
      });
      toast.success("Venta realizada!");
      setSellTokenId("");
      setSellAmount("1");
      refetchInventory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al vender");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shop</h1>
        <p className="text-muted-foreground">
          Vende tus NFTs de vuelta por Keys.
        </p>
      </div>

      {!isConnected && (
        <Alert>
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription>
            Conecta tu wallet para vender NFTs.
          </AlertDescription>
        </Alert>
      )}

      {isConnected && (
        <>
          {/* Inventory grid */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Tu Inventario</h2>
            {ownedIdsList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tienes NFTs para vender.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {ownedIdsList.map((id, idx) => {
                  const bal = nftBalances?.[idx]?.result;
                  const price = sellPrices?.[idx]?.result;
                  return (
                    <Card key={id.toString()}>
                      <CardContent className="flex flex-col gap-2 pt-4">
                        <div className="flex items-baseline justify-between">
                          <span className="text-lg font-bold">
                            #{id.toString()}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            x{bal != null ? bal.toString() : "?"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Sell price:{" "}
                          {price ? formatKeys(price as bigint) : "-"} KEY
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSellTokenId(id.toString());
                            setSellAmount("1");
                            document
                              .getElementById("sell-form")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          Vender
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sell form */}
          <Card id="sell-form">
            <CardHeader>
              <CardTitle>Vender NFTs</CardTitle>
              <CardDescription>
                Transfiere NFTs a la Shop y recibe Keys a cambio.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isShopApproved && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Primero debes aprobar a la Shop para transferir tus NFTs.
                  </p>
                  <Button
                    onClick={handleApproveShop}
                    disabled={isShopApproveBusy}
                    variant="outline"
                  >
                    {isShopApproveBusy
                      ? "Aprobando..."
                      : "Approve NFTs para Shop"}
                  </Button>
                </div>
              )}
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={handleSell}
              >
                <div className="space-y-1">
                  <label htmlFor="sell-cfg" className="text-sm font-medium">
                    Config ID
                  </label>
                  <Input
                    id="sell-cfg"
                    value={sellConfigId}
                    onChange={(e) => setSellConfigId(e.target.value)}
                    placeholder="0"
                    className="w-24"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="sell-tid" className="text-sm font-medium">
                    Token ID
                  </label>
                  <Input
                    id="sell-tid"
                    value={sellTokenId}
                    onChange={(e) => setSellTokenId(e.target.value)}
                    placeholder="0"
                    className="w-24"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="sell-amt" className="text-sm font-medium">
                    Cantidad
                  </label>
                  <Input
                    id="sell-amt"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    placeholder="1"
                    className="w-24"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!isConnected || isSellBusy || !isShopApproved}
                >
                  {isSellBusy ? "Vendiendo..." : "Vender"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
