"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { useEffect, useMemo } from "react";
import { formatUnits } from "viem";
import { Home, LayoutGrid, Users, Trophy } from "lucide-react";

import { getContractConfig } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store/app-store";
import { useAnimatedNumber } from "@/lib/hooks/use-animated-number";

const KEY_DECIMALS = 18;

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/collections", label: "Collections", icon: LayoutGrid },
  { href: "/referrals", label: "Referrals", icon: Users },
  { href: "/achievements", label: "Achievements", icon: Trophy },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const balanceNonce = useAppStore((s) => s.balanceNonce);
  const keyDelta = useAppStore((s) => s.keyDelta);
  const nftDelta = useAppStore((s) => s.nftDelta);
  const resetKeyDelta = useAppStore((s) => s.resetKeyDelta);
  const resetNftDelta = useAppStore((s) => s.resetNftDelta);

  const keyConfig = getContractConfig("Key");
  const itemsConfig = getContractConfig("CrateGameItems");

  const { data: keyBalance, refetch: refetchBalance } = useReadContract({
    ...keyConfig,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const { data: ownedIds, refetch: refetchOwned } = useReadContract({
    ...itemsConfig,
    functionName: "ownedIds",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const onChainKeyFloat = useMemo(() => {
    if (keyBalance === undefined) return 0;
    return Number(formatUnits(keyBalance as bigint, KEY_DECIMALS));
  }, [keyBalance]);

  const onChainNftCount = (ownedIds as bigint[] | undefined)?.length ?? 0;

  useEffect(() => {
    if (balanceNonce > 0) {
      refetchBalance().then(() => resetKeyDelta());
      refetchOwned().then(() => resetNftDelta());
    }
  }, [balanceNonce, refetchBalance, refetchOwned, resetKeyDelta, resetNftDelta]);

  const targetKeyValue = onChainKeyFloat + keyDelta;
  const targetNftValue = onChainNftCount + nftDelta;

  const animatedKey = useAnimatedNumber(targetKeyValue, 800);
  const animatedNft = useAnimatedNumber(targetNftValue, 600);

  const displayKey = animatedKey.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const displayNft = Math.round(animatedNft);

  const keyIsChanging = Math.abs(animatedKey - targetKeyValue) > 0.01;
  const nftIsChanging = Math.abs(animatedNft - targetNftValue) > 0.5;

  return (
    <header className="relative sticky top-0 z-50 h-14 overflow-hidden border-b border-white/10">
      <img
        src="/hederbg.webp"
        alt=""
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-auto min-w-[2928px] -translate-x-1/2"
        draggable={false}
      />

      <div className="flex h-full w-full items-center gap-3 px-4">
        <Link
          href="/"
          className="mr-2 shrink-0 text-lg font-extrabold italic tracking-wide text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)] sm:text-xl"
        >
          INFINITE CHEST
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all",
                  isActive
                    ? "bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {isConnected && (
          <div className="hidden items-center gap-2.5 sm:flex">
            {/* KEY Balance badge */}
            <div className="flex items-center gap-0 rounded-xl border border-white/[0.12] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.4)]">
              <a
                href="https://app.uniswap.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full items-center border-r border-white/[0.08] px-2.5 transition-opacity hover:opacity-80"
                title="Buy KEY on Uniswap"
              >
                <Image
                  src="/Uniswap_icon_pink.png"
                  alt="Uniswap"
                  width={20}
                  height={20}
                  unoptimized
                />
              </a>
              <div className="flex flex-col px-3 py-1">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums leading-tight text-white transition-colors duration-300",
                      keyIsChanging && keyDelta < 0 && "text-red-400",
                      keyIsChanging && keyDelta > 0 && "text-green-400",
                    )}
                  >
                    {displayKey}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    KEY
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[9px] leading-tight text-white/30">
                  <span>24h change</span>
                  <span className="uppercase tracking-wider text-white/25">
                    KEY
                  </span>
                  <span className="font-semibold text-emerald-400/70">
                    +2.14%
                  </span>
                </div>
              </div>
            </div>

            {/* NFT Shield badge */}
            <div className="relative flex h-10 w-10 items-center justify-center">
              <img
                src="/nft-shield.svg"
                alt=""
                className="absolute inset-0 h-full w-full"
                draggable={false}
              />
              <div className="relative flex flex-col items-center leading-none">
                <span className="text-[7px] font-bold uppercase tracking-widest text-white/50">
                  NFTs
                </span>
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums text-white/90 transition-colors duration-300",
                    nftIsChanging && nftDelta > 0 && "text-green-400",
                    nftIsChanging && nftDelta < 0 && "text-red-400",
                  )}
                >
                  {displayNft}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
