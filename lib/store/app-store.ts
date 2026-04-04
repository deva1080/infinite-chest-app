import { create } from "zustand";

type AppState = {
  selectedChestId: number;
  setSelectedChestId: (id: number) => void;
  balanceNonce: number;
  bumpBalanceNonce: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedChestId: 0,
  setSelectedChestId: (id) => set({ selectedChestId: id }),
  balanceNonce: 0,
  bumpBalanceNonce: () => set((s) => ({ balanceNonce: s.balanceNonce + 1 })),
}));
