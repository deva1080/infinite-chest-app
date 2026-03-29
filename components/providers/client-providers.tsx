"use client";

import dynamic from "next/dynamic";

const AppProviders = dynamic(
  () =>
    import("@/components/providers/app-providers").then(
      (mod) => mod.AppProviders,
    ),
  { ssr: false },
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
