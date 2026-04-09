"use client";

import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

import { ChestCatalogGrid } from "@/components/home/chest-catalog-grid";
import {
  type HomeBonusFilter,
  ChestFiltersBar,
  type HomeRarityFilter,
  type HomeVolatilityLevel,
} from "@/components/home/chest-filters-bar";
import {
  type HomeChestCardData,
  type HomeRewardPreview,
} from "@/components/home/chest-card";
import { FeaturedChestHero } from "@/components/home/featured-chest-hero";
import { HomeFooter } from "@/components/home/home-footer";
import { PossibleRewardsStrip } from "@/components/home/possible-rewards-strip";
import { TrustBadgesRow } from "@/components/home/trust-badges-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAllLocalConfigs } from "@/lib/chest-configs";
import { getChestMeta } from "@/lib/chest-meta";
import {
  getTokenDisplayName,
  getTokenImageFromCatalog,
  isBonusTokenId,
} from "@/lib/item-catalog";

const configs = getAllLocalConfigs();
const KEY_DECIMALS = 18;

function toKeyFloat(value: bigint) {
  return Number(formatUnits(value, KEY_DECIMALS));
}

function sortRewards(rewards: HomeRewardPreview[]) {
  return [...rewards].sort((a, b) => {
    if (a.sellPrice !== b.sellPrice) return a.sellPrice > b.sellPrice ? -1 : 1;
    return a.dropPct - b.dropPct;
  });
}

function buildChestData(): HomeChestCardData[] {
  return configs.map((cfg) => {
    const meta = getChestMeta(cfg.configId);
    const rewardPreviews: HomeRewardPreview[] = [];
    let highestRewardValue = 0;
    let lowestDropPct = Number.POSITIVE_INFINITY;

    for (let index = 0; index < cfg.tokenIds.length; index++) {
      const tokenId = cfg.tokenIds[index];
      if (isBonusTokenId(tokenId)) continue;

      const sellPrice = cfg.sellPrices[index] ?? BigInt(0);
      const dropPct = cfg.dropPercentages[index] ?? 0;
      const rewardValue = toKeyFloat(sellPrice);
      rewardPreviews.push({
        tokenId,
        name: getTokenDisplayName(tokenId),
        imageSrc: getTokenImageFromCatalog(tokenId, cfg.configId),
        dropPct,
        sellPrice,
      });

      highestRewardValue = Math.max(highestRewardValue, rewardValue);
      if (dropPct > 0) {
        lowestDropPct = Math.min(lowestDropPct, dropPct);
      }
    }

    const topDrops = sortRewards(rewardPreviews);
    const priceValue = toKeyFloat(cfg.price);
    const bonusCount = cfg.tokenIds.filter((tokenId) => isBonusTokenId(tokenId)).length;
    const hasBonus = cfg.bonus;

    let typeLabel: HomeChestCardData["typeLabel"] = "standard";
    if (hasBonus) {
      typeLabel = "bonus";
    } else if (priceValue >= 1 || highestRewardValue >= Math.max(priceValue, 1)) {
      typeLabel = "premium";
    }

    return {
      configId: cfg.configId,
      configName: cfg.name,
      title: cfg.name,
      subtitle: meta.subtitle,
      chestImage: meta.chestImage,
      accentFrom: meta.accentFrom,
      accentTo: meta.accentTo,
      glowColor: meta.glowColor,
      price: cfg.price,
      priceValue,
      dropCount: topDrops.length,
      bonusCount,
      hasBonus,
      volatility: cfg.volatility,
      limited: cfg.limited,
      rarity: cfg.rarity,
      typeLabel,
      bestDrop: topDrops[0] ?? null,
      topDrops: topDrops.slice(0, 8),
    };
  });
}

function sortChests(chests: HomeChestCardData[]) {
  const sorted = [...chests];

  sorted.sort((a, b) => {
    const aBestValue = a.bestDrop ? toKeyFloat(a.bestDrop.sellPrice) : 0;
    const bBestValue = b.bestDrop ? toKeyFloat(b.bestDrop.sellPrice) : 0;
    if (a.priceValue !== b.priceValue) return b.priceValue - a.priceValue;
    if (a.bonusCount !== b.bonusCount) return b.bonusCount - a.bonusCount;
    return bBestValue - aBestValue;
  });

  return sorted;
}

function filterChests(
  chests: HomeChestCardData[],
  rarity: HomeRarityFilter,
  bonus: HomeBonusFilter,
  volatilityMin: HomeVolatilityLevel,
  volatilityMax: HomeVolatilityLevel,
) {
  return chests.filter((chest) => {
    const matchesBonus =
      bonus === "all"
        ? true
        : bonus === "bonus"
          ? chest.hasBonus
          : !chest.hasBonus;
    const matchesVolatility =
      chest.volatility >= volatilityMin && chest.volatility <= volatilityMax;
    const matchesRarity = rarity === "all" ? true : chest.rarity === rarity;

    return matchesBonus && matchesVolatility && matchesRarity;
  });
}

export default function Home() {
  const { isConnected } = useAccount();
  const [rarity, setRarity] = useState<HomeRarityFilter>("all");
  const [bonus, setBonus] = useState<HomeBonusFilter>("all");
  const [volatilityMin, setVolatilityMin] = useState<HomeVolatilityLevel>(1);
  const [volatilityMax, setVolatilityMax] = useState<HomeVolatilityLevel>(5);

  const homeChests = useMemo(() => buildChestData(), []);
  const featuredChest = useMemo(() => sortChests(homeChests)[0], [homeChests]);
  const visibleChests = useMemo(() => {
    const filtered = filterChests(
      homeChests,
      rarity,
      bonus,
      volatilityMin,
      volatilityMax,
    );
    const sorted = sortChests(filtered);

    if (featuredChest && sorted.length > 1) {
      return sorted.filter((chest) => chest.configId !== featuredChest.configId);
    }

    return sorted;
  }, [bonus, featuredChest, homeChests, rarity, volatilityMax, volatilityMin]);

  if (!featuredChest) {
    return <p className="text-sm text-white/75">No hay cofres configurados aun.</p>;
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <FeaturedChestHero chest={featuredChest} />

      {!isConnected && (
        <Alert className="border-white/20 bg-black/40 text-white backdrop-blur-sm">
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription className="text-white/80">
            Conecta tu wallet para abrir cofres y ver tu inventario.
          </AlertDescription>
        </Alert>
      )}

      <PossibleRewardsStrip />

      <ChestFiltersBar
        rarity={rarity}
        bonus={bonus}
        volatilityMin={volatilityMin}
        volatilityMax={volatilityMax}
        resultCount={visibleChests.length}
        onRarityChange={setRarity}
        onBonusChange={setBonus}
        onVolatilityChange={(min, max) => {
          setVolatilityMin(min);
          setVolatilityMax(max);
        }}
      />

      <ChestCatalogGrid chests={visibleChests} />
      <TrustBadgesRow />
      <HomeFooter />
    </div>
  );
}
