"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  size: number;
  twinkleSpeed: number;
  twinkleOffset: number;
};

type Props = {
  className?: string;
  starCount?: number;
  speed?: number;
  opacity?: number;
};

export function DeepSpaceBg({
  className = "",
  starCount = 80,
  speed = 0.15,
  opacity = 0.55,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initStars() {
      starsRef.current = Array.from({ length: starCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 0.8 + 0.2,
        size: Math.random() * 1.2 + 0.3,
        twinkleSpeed: Math.random() * 0.8 + 0.4,
        twinkleOffset: Math.random() * Math.PI * 2,
      }));
    }

    resize();
    initStars();

    const ro = new ResizeObserver(() => {
      resize();
      if (starsRef.current.length === 0) initStars();
    });
    ro.observe(canvas);

    let t = 0;
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      t += 0.016;

      for (const star of starsRef.current) {
        star.x -= speed * star.z * 0.6;
        star.y -= speed * star.z * 0.2;

        if (star.x < -2) star.x = w + 2;
        if (star.y < -2) star.y = h + 2;
        if (star.x > w + 2) star.x = -2;
        if (star.y > h + 2) star.y = -2;

        const twinkle =
          0.4 + 0.6 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset) ** 2;
        const alpha = twinkle * star.z * opacity;

        const r = star.size * star.z;
        ctx.beginPath();
        ctx.arc(star.x, star.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${alpha})`;
        ctx.fill();

        if (r > 0.8) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 200, 255, ${alpha * 0.12})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [starCount, speed, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden="true"
    />
  );
}
