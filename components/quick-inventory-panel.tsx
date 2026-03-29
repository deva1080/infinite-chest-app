"use client";

import { useState } from "react";

export function QuickInventoryPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className="fixed right-2 top-[calc(var(--app-header-h)+0.5rem)] z-40 flex h-[calc(100dvh-var(--app-header-h)-1rem)] items-start">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-full rounded-l-md border border-r-0 border-cyan-300/30 bg-black/70 px-2 text-xs font-semibold uppercase tracking-widest text-cyan-200 backdrop-blur-sm transition hover:bg-black/80"
      >
        {isOpen ? "Close" : "Quick"}
      </button>
      <div
        className={`h-full overflow-hidden border border-cyan-300/20 bg-black/55 backdrop-blur-sm transition-all duration-300 ${
          isOpen ? "w-72 px-4 py-4" : "w-0 border-l-0 px-0 py-0"
        }`}
      >
        {isOpen && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Quick Inventory
            </h3>
          </div>
        )}
      </div>
    </aside>
  );
}
