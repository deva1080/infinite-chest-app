"use client";

import { TokenImage } from "@/components/token-image";
import { cn } from "@/lib/utils";

type RewardArtFrameProps = {
  src: string;
  alt: string;
  isBonus?: boolean;
  dimmed?: boolean;
  showBottomFade?: boolean;
  className?: string;
  imageClassName?: string;
};

export function RewardArtFrame({
  src,
  alt,
  isBonus = false,
  dimmed = false,
  showBottomFade = false,
  className,
  imageClassName,
}: RewardArtFrameProps) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden bg-[#0a0e1a]",
        className,
      )}
    >
      {isBonus && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.22),transparent_58%),linear-gradient(180deg,rgba(245,158,11,0.12),rgba(10,14,26,0.92))]" />
      )}

      <div className="absolute inset-0">
        <TokenImage
          src={src}
          alt={alt}
          fallbackSrc={isBonus ? "/bonus/default.webp" : "/collections/0_1.webp"}
          fill
          className={cn(
            isBonus ? "object-contain p-3" : "object-cover",
            dimmed && "grayscale blur-[1.5px] opacity-50",
            imageClassName,
          )}
          unoptimized
        />
      </div>

      {showBottomFade && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      )}
    </div>
  );
}
