"use client";

import type { ChestConfigRarity } from "@/lib/chest-configs";

export type HomeRarityFilter = "all" | ChestConfigRarity;
export type HomeBonusFilter = "all" | "bonus" | "no-bonus";
export type HomeVolatilityLevel = 1 | 2 | 3 | 4 | 5;

const VOLATILITY_LEVELS: { value: HomeVolatilityLevel; label: string }[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

type ChestFiltersBarProps = {
  rarity: HomeRarityFilter;
  bonus: HomeBonusFilter;
  activeVolatilities: Set<HomeVolatilityLevel>;
  resultCount: number;
  onRarityChange: (value: HomeRarityFilter) => void;
  onBonusChange: (value: HomeBonusFilter) => void;
  onVolatilityToggle: (level: HomeVolatilityLevel) => void;
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

type RiskTogglesProps = {
  active: Set<HomeVolatilityLevel>;
  onToggle: (level: HomeVolatilityLevel) => void;
};

function RiskToggles({ active, onToggle }: RiskTogglesProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Risk level
      </span>
      <div className="flex gap-1.5">
        {VOLATILITY_LEVELS.map(({ value, label }) => {
          const isActive = active.has(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-all ${
                isActive
                  ? "border-white/25 bg-white/15 text-white shadow-[0_0_8px_rgba(255,255,255,0.08)]"
                  : "border-white/8 bg-black/15 text-white/30 hover:bg-black/25 hover:text-white/50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChestFiltersBar({
  rarity,
  bonus,
  activeVolatilities,
  resultCount,
  onRarityChange,
  onBonusChange,
  onVolatilityToggle,
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
        <RiskToggles active={activeVolatilities} onToggle={onVolatilityToggle} />
        <div className="ml-auto rounded-md border border-white/8 bg-black/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {resultCount} visible
        </div>
      </div>
    </section>
  );
}
