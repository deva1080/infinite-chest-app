"use client";

import { useCallback, useRef, useEffect } from "react";
import useSound from "use-sound";

const SFX = {
  revealClink: "/sfx/reveal-clink.mp3",
  bonusChime: "/sfx/bonus-chime.mp3",
  bonusTransition: "/sfx/bonus-transition.mp3",
  openComplete: "/sfx/open-complete.mp3",
} as const;

const PITCH_RANGE = 0.12;

export function useGameSounds() {
  const [playRevealClink] = useSound(SFX.revealClink, {
    volume: 0.22,
    playbackRate: 1,
  });
  const [playBonusChime] = useSound(SFX.bonusChime, { volume: 0.3 });
  const [playBonusTransition] = useSound(SFX.bonusTransition, { volume: 0.26 });
  const [playOpenComplete] = useSound(SFX.openComplete, { volume: 0.28 });

  const revealClinkWithPitch = useCallback(() => {
    playRevealClink({
      playbackRate: 1 + (Math.random() - 0.5) * PITCH_RANGE * 2,
    } as Parameters<typeof playRevealClink>[0]);
  }, [playRevealClink]);

  return {
    playRevealClink: revealClinkWithPitch,
    playBonusChime,
    playBonusTransition,
    playOpenComplete,
  };
}
