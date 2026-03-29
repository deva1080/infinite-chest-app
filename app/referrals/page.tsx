"use client";

import { useAccount, useReadContract } from "wagmi";
import { toast } from "sonner";
import { type Address } from "viem";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getContractConfig } from "@/lib/contracts";

export default function ReferralsPage() {
  const { address, isConnected } = useAccount();
  const userStatsConfig = getContractConfig("UserStats");

  const { data: referrer } = useReadContract({
    ...userStatsConfig,
    functionName: "getReferrer",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const referrerAddr = referrer as Address | undefined;
  const hasReferrer =
    referrerAddr && referrerAddr !== "0x0000000000000000000000000000000000000000";

  const referralLink =
    typeof window !== "undefined" && address
      ? `${window.location.origin}/game?ref=${address}`
      : "";

  function copyLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado");
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-muted-foreground">
          Invita amigos y gana recompensas por cada apertura.
        </p>
      </div>

      {!isConnected && (
        <Alert>
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription>
            Conecta tu wallet para ver tu link de referido.
          </AlertDescription>
        </Alert>
      )}

      {isConnected && (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Tu link de referido</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {referralLink || "..."}
              </code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                Copiar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tu referrer</p>
            <p className="text-sm text-muted-foreground">
              {hasReferrer
                ? `${referrerAddr.slice(0, 6)}...${referrerAddr.slice(-4)}`
                : "Sin referrer asignado"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
