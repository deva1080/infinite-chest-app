"use client";

import { ChestCard, type HomeChestCardData } from "./chest-card";

type ChestCatalogGridProps = {
  chests: HomeChestCardData[];
};

export function ChestCatalogGrid({ chests }: ChestCatalogGridProps) {
  if (chests.length === 0) {
    return (
      <section className="home-panel rounded-[1.5rem] px-5 py-10 text-center">
        <p className="home-section-label">Catalog</p>
        <h2 className="text-xl font-bold uppercase tracking-[0.08em] text-white">
          No chests match the current filters
        </h2>
        <p className="mt-2 text-sm text-white/45">
          Try another rarity, price band or sort mode.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="home-section-label">Catalog grid</p>
          <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
            Explore more chests
          </h2>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {chests.map((chest) => (
          <ChestCard key={chest.configId} chest={chest} />
        ))}
      </div>
    </section>
  );
}
