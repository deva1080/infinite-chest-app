import { create } from "zustand";

type AppState = {
  selectedChestId: number;
  setSelectedChestId: (id: number) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedChestId: 0,
  setSelectedChestId: (id) => set({ selectedChestId: id }),
}));
