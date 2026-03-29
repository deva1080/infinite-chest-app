"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";

import { getContractConfig } from "@/lib/contracts";
import { formatKeys } from "@/lib/format";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  // { href: "/game", label: "Play" },
  { href: "/collections", label: "Collections" },
  { href: "/referrals", label: "Referrals" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  const keyConfig = getContractConfig("Key");
  const { data: keyBalance } = useReadContract({
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

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-white/15 bg-black/55 backdrop-blur-md">
      <div className="relative flex h-full w-full items-center px-4">
        <div className="flex shrink-0 items-center">
          <Link
            href="/"
            className="ml-1 text-xl font-bold tracking-tight text-white sm:text-2xl"
          >
            CREATE FRONT
          </Link>
        </div>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-3 sm:flex">
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {isConnected && (
            <div className="flex items-center rounded-md border border-cyan-300/30 bg-[#101227]/65 px-2.5 py-1.5 text-sm">
              <span className="text-[10px] uppercase tracking-wider text-white/70">
                Balance
              </span>
              <span className="ml-2 font-medium text-white">
                {formatKeys(keyBalance as bigint | undefined)} KEY
              </span>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
