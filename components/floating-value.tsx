"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 2200;
const TRAVEL_PX = 70;
const FADE_IN_PCT = 0.08;
const FADE_OUT_START_PCT = 0.55;
const INITIAL_SCALE = 1.25;
const FINAL_SCALE = 0.92;

type Props = {
  text: string;
  color: string;
  onComplete?: () => void;
};

export function FloatingValue({ text, color, onComplete }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    startRef.current = performance.now();
    doneRef.current = false;

    function frame(now: number) {
      const el = ref.current;
      if (!el || doneRef.current) return;

      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / DURATION_MS, 1);

      const y = -(t * TRAVEL_PX);

      let opacity: number;
      if (t < FADE_IN_PCT) {
        opacity = t / FADE_IN_PCT;
      } else if (t > FADE_OUT_START_PCT) {
        opacity = 1 - (t - FADE_OUT_START_PCT) / (1 - FADE_OUT_START_PCT);
      } else {
        opacity = 1;
      }

      const scale = INITIAL_SCALE + (FINAL_SCALE - INITIAL_SCALE) * t;

      el.style.transform = `translate(-50%, ${y}px) scale(${scale})`;
      el.style.opacity = `${Math.max(0, opacity)}`;

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        doneRef.current = true;
        onComplete?.();
      }
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      doneRef.current = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [onComplete]);

  return (
    <span
      ref={ref}
      className="pointer-events-none absolute left-1/2 top-1/2 z-[14] whitespace-nowrap rounded-full font-mono text-[17px] font-black tracking-wider"
      style={{
        color,
        opacity: 0,
        transform: "translate(-50%, 0) scale(1.25)",
        padding: "0.22rem 0.5rem",
        background:
          "radial-gradient(circle at center, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 68%, transparent 100%)",
        boxShadow: `0 0 18px color-mix(in srgb, ${color} 38%, transparent), 0 0 34px color-mix(in srgb, ${color} 20%, transparent)`,
        textShadow: `0 0 10px ${color}, 0 0 22px color-mix(in srgb, ${color} 60%, transparent), 0 2px 10px rgba(0,0,0,0.88)`,
        willChange: "transform, opacity",
      }}
    >
      {text}
    </span>
  );
}
