import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates a number from its current value to a target value,
 * incrementing/decrementing decimal by decimal like an odometer.
 *
 * @param target  The destination number
 * @param duration  Total animation time in ms (default 600)
 * @returns The current animated display value
 */
export function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(display);
  const startTimeRef = useRef(0);

  useEffect(() => {
    const from = startRef.current;
    const delta = target - from;

    if (Math.abs(delta) < 0.005) {
      setDisplay(target);
      startRef.current = target;
      return;
    }

    startTimeRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const current = from + delta * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        startRef.current = target;
        rafRef.current = null;
      }
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return display;
}
