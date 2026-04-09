"use client";

import type { ChestConfigRarity } from "@/lib/chest-configs";

export type HomeRarityFilter = "all" | ChestConfigRarity;
export type HomeBonusFilter = "all" | "bonus" | "no-bonus";
export type HomeVolatilityLevel = 1 | 2 | 3 | 4 | 5;

type ChestFiltersBarProps = {
  rarity: HomeRarityFilter;
  bonus: HomeBonusFilter;
  volatilityMin: HomeVolatilityLevel;
  volatilityMax: HomeVolatilityLevel;
  resultCount: number;
  onRarityChange: (value: HomeRarityFilter) => void;
  onBonusChange: (value: HomeBonusFilter) => void;
  onVolatilityChange: (min: HomeVolatilityLevel, max: HomeVolatilityLevel) => void;
};

type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="flex min-w-[152px] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="home-filter-select rounded-lg border border-white/8 bg-black/15 px-2.5 py-2 text-sm text-white/85 outline-none transition-colors hover:bg-black/20 focus:border-white/18"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type RiskRangeProps = {
  min: HomeVolatilityLevel;
  max: HomeVolatilityLevel;
  onChange: (min: HomeVolatilityLevel, max: HomeVolatilityLevel) => void;
};

function RiskRange({ min, max, onChange }: RiskRangeProps) {
  const minPct = ((min - 1) / 4) * 100;
  const maxPct = ((max - 1) / 4) * 100;

  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Risk range
        </span>
        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white/70">
          {min} - {max}
        </span>
      </div>

      <div className="relative h-9 rounded-lg border border-white/8 bg-black/12 px-2">
        <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/12" />
        <div
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#2f8f4e] via-[#4aa4d9] to-[#a36b1f]"
          style={{
            left: `calc(${minPct}% + 0.5rem)`,
            right: `calc(${100 - maxPct}% + 0.5rem)`,
          }}
        />

        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={min}
          aria-label="Minimum risk"
          onChange={(event) => {
            const nextMin = Number(event.target.value) as HomeVolatilityLevel;
            onChange(nextMin > max ? max : nextMin, max);
          }}
          className="absolute inset-x-2 top-1/2 z-20 h-1 -translate-y-1/2 appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/40 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.18)]"
        />
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={max}
          aria-label="Maximum risk"
          onChange={(event) => {
            const nextMax = Number(event.target.value) as HomeVolatilityLevel;
            onChange(min, nextMax < min ? min : nextMax);
          }}
          className="absolute inset-x-2 top-1/2 z-30 h-1 -translate-y-1/2 appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/40 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.18)]"
        />
      </div>
    </div>
  );
}

export function ChestFiltersBar({
  rarity,
  bonus,
  volatilityMin,
  volatilityMax,
  resultCount,
  onRarityChange,
  onBonusChange,
  onVolatilityChange,
}: ChestFiltersBarProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/8 px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Rarity"
          value={rarity}
          onChange={(value) => onRarityChange(value as HomeRarityFilter)}
          options={[
            { value: "all", label: "All rarities" },
            { value: "infinite", label: "Infinite" },
            { value: "legendary", label: "Legendary" },
            { value: "epic", label: "Epic" },
            { value: "rare", label: "Rare" },
            { value: "common", label: "Common" },
          ]}
        />
        <FilterSelect
          label="Bonus"
          value={bonus}
          onChange={(value) => onBonusChange(value as HomeBonusFilter)}
          options={[
            { value: "all", label: "All chests" },
            { value: "bonus", label: "Bonus enabled" },
            { value: "no-bonus", label: "No bonus" },
          ]}
        />
        <RiskRange
          min={volatilityMin}
          max={volatilityMax}
          onChange={onVolatilityChange}
        />
        <div className="ml-auto rounded-md border border-white/8 bg-black/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {resultCount} visible
        </div>
      </div>
    </section>
  );
}
