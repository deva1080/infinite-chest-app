import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NftInventorySnapshot = {
  owner: string;
  ownedIds: string[];
  balances: Record<string, string>;
  updatedAt: number;
};

type AppState = {
  selectedChestId: number;
  setSelectedChestId: (id: number) => void;
  balanceNonce: number;
  bumpBalanceNonce: () => void;
  inventoryNonce: number;
  bumpInventoryNonce: () => void;
  nftInventory?: NftInventorySnapshot;
  setNftInventory: (snapshot: NftInventorySnapshot) => void;
  clearNftInventory: () => void;
  userDataNonce: number;
  bumpUserDataNonce: () => void;
  /** Optimistic KEY delta (in float, already formatted). Navbar adds this to on-chain balance. */
  keyDelta: number;
  addKeyDelta: (amount: number) => void;
  resetKeyDelta: () => void;
  /** Optimistic NFT count delta. Navbar adds this to on-chain count. */
  nftDelta: number;
  addNftDelta: (amount: number) => void;
  resetNftDelta: () => void;
  /** Prelaunch demo: when true, chest opens are simulated client-side with no tx, no balance changes. */
  testMode: boolean;
  setTestMode: (v: boolean) => void;
  toggleTestMode: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedChestId: 0,
      setSelectedChestId: (id) => set({ selectedChestId: id }),
      balanceNonce: 0,
      bumpBalanceNonce: () =>
        set((s) => ({ balanceNonce: s.balanceNonce + 1 })),
      inventoryNonce: 0,
      bumpInventoryNonce: () =>
        set((s) => ({ inventoryNonce: s.inventoryNonce + 1 })),
      nftInventory: undefined,
      setNftInventory: (snapshot) => set({ nftInventory: snapshot }),
      clearNftInventory: () => set({ nftInventory: undefined }),
      userDataNonce: 0,
      bumpUserDataNonce: () =>
        set((s) => ({ userDataNonce: s.userDataNonce + 1 })),
      keyDelta: 0,
      addKeyDelta: (amount) => set((s) => ({ keyDelta: s.keyDelta + amount })),
      resetKeyDelta: () => set({ keyDelta: 0 }),
      nftDelta: 0,
      addNftDelta: (amount) => set((s) => ({ nftDelta: s.nftDelta + amount })),
      resetNftDelta: () => set({ nftDelta: 0 }),
      testMode: false,
      setTestMode: (v) => set({ testMode: v }),
      toggleTestMode: () => set((s) => ({ testMode: !s.testMode })),
    }),
    {
      name: "infinite-chest-app",
      partialize: (state) => ({
        nftInventory: state.nftInventory,
        testMode: state.testMode,
      }),
    },
  ),
);
