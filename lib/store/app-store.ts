import { create } from "zustand";

type AppState = {
  selectedChestId: number;
  setSelectedChestId: (id: number) => void;
  balanceNonce: number;
  bumpBalanceNonce: () => void;
  inventoryNonce: number;
  bumpInventoryNonce: () => void;
  /** Optimistic KEY delta (in float, already formatted). Navbar adds this to on-chain balance. */
  keyDelta: number;
  addKeyDelta: (amount: number) => void;
  resetKeyDelta: () => void;
  /** Optimistic NFT count delta. Navbar adds this to on-chain count. */
  nftDelta: number;
  addNftDelta: (amount: number) => void;
  resetNftDelta: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedChestId: 0,
  setSelectedChestId: (id) => set({ selectedChestId: id }),
  balanceNonce: 0,
  bumpBalanceNonce: () => set((s) => ({ balanceNonce: s.balanceNonce + 1 })),
  inventoryNonce: 0,
  bumpInventoryNonce: () =>
    set((s) => ({ inventoryNonce: s.inventoryNonce + 1 })),
  keyDelta: 0,
  addKeyDelta: (amount) => set((s) => ({ keyDelta: s.keyDelta + amount })),
  resetKeyDelta: () => set({ keyDelta: 0 }),
  nftDelta: 0,
  addNftDelta: (amount) => set((s) => ({ nftDelta: s.nftDelta + amount })),
  resetNftDelta: () => set({ nftDelta: 0 }),
}));
