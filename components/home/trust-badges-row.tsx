"use client";

import { BadgeCheck, Headset, ShieldCheck, Zap } from "lucide-react";

const trustBadges = [
  {
    title: "Provably fair",
    description: "Drop tables come from your local chest configs.",
    icon: BadgeCheck,
  },
  {
    title: "Secure flows",
    description: "Wallet gating and inventory actions stay isolated from the home.",
    icon: ShieldCheck,
  },
  {
    title: "Fast access",
    description: "Featured chest and catalog route directly into the game screen.",
    icon: Zap,
  },
  {
    title: "Support ready",
    description: "Collections, referrals and account surfaces remain one click away.",
    icon: Headset,
  },
] as const;

export function TrustBadgesRow() {
  return (
    <section className="grid gap-3 lg:grid-cols-4">
      {trustBadges.map((badge) => {
        const Icon = badge.icon;
        return (
          <article
            key={badge.title}
            className="home-panel-muted rounded-2xl px-4 py-4 text-white"
          >
            <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-2 text-white/80">
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
              {badge.title}
            </h3>
            <p className="mt-1 text-sm text-white/45">{badge.description}</p>
          </article>
        );
      })}
    </section>
  );
}
