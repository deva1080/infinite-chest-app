"use client";

import Image from "next/image";
import Link from "next/link";
import { useAccount } from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TokenImage } from "@/components/token-image";
import { getTokenImageFromCatalog, isBonusTokenId } from "@/lib/item-catalog";
import { getAllLocalConfigs } from "@/lib/chest-configs";

const configs = getAllLocalConfigs();

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Chests</h1>
        <p className="text-sm text-white/75">
          Selecciona un cofre para jugar.
        </p>
      </div>

      {!isConnected && (
        <Alert className="border-white/20 bg-black/40 text-white backdrop-blur-sm">
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription className="text-white/80">
            Conecta tu wallet para abrir cofres y ver tu inventario.
          </AlertDescription>
        </Alert>
      )}

      {configs.length === 0 ? (
        <p className="text-sm text-white/75">
          No hay cofres configurados aun.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {configs.map((cfg) => {
            const id = cfg.configId;
            const tokenIds = cfg.tokenIds;
            const chestImageIndex = id % 5;
            const bonusTokenIds = tokenIds.filter((tid) => isBonusTokenId(tid));
            const dropTokenIds = tokenIds.filter((tid) => !isBonusTokenId(tid));

            return (
              <article
                key={id}
                className="mx-auto w-full max-w-[290px] rounded-2xl border border-cyan-300/35 bg-[#110a2f]/70 p-4 text-white shadow-[0_0_0_1px_rgba(99,102,241,0.45),0_0_20px_rgba(34,211,238,0.35),0_0_36px_rgba(139,92,246,0.25)] backdrop-blur-sm"
              >
                <div className="mb-3 text-center">
                  <h2 className="text-lg font-semibold uppercase tracking-wider">
                    Cyber Core #{id}
                  </h2>
                  <p className="text-xs text-white/70">
                    {dropTokenIds.length > 0
                      ? `${dropTokenIds.length} drops + ${bonusTokenIds.length} bonus`
                      : "Sin drops"}
                  </p>
                </div>

                <div className="relative mb-4 h-36 overflow-hidden rounded-xl border border-cyan-300/30 bg-gradient-to-b from-indigo-950/80 to-purple-950/80">
                  <Image
                    src={`/chesties/${chestImageIndex}.webp`}
                    alt={`Chest ${id}`}
                    fill
                    className="scale-125 object-contain"
                    unoptimized
                  />
                </div>

                <div className="mb-4 flex items-center justify-center gap-2 overflow-hidden">
                  {tokenIds.length > 0 ? (
                    tokenIds.map((tokenId) => (
                      <div
                        key={tokenId.toString()}
                        className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-md border ${
                          isBonusTokenId(tokenId)
                            ? "border-amber-300/60 bg-amber-400/20"
                            : "border-white/20 bg-black/30"
                        }`}
                      >
                        <TokenImage
                          src={getTokenImageFromCatalog(tokenId, id)}
                          alt={`Drop ${tokenId.toString()}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/60">Sin drops cargados</p>
                  )}
                </div>

                <div>
                  <Link href={`/game?configId=${id}`}>
                    <Button className="w-full bg-gradient-to-r from-violet-500 to-cyan-400 font-semibold text-black hover:from-violet-400 hover:to-cyan-300">
                      Open Now
                    </Button>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
