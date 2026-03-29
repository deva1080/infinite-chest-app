import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "viem";
import { createConfig } from "wagmi";
import { base } from "wagmi/chains";

export function createWagmiConfig() {
  const walletConnectProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo-project-id";

  const connectors = connectorsForWallets(
    [
      {
        groupName: "Recommended",
        wallets: [
          injectedWallet,
          metaMaskWallet,
          coinbaseWallet,
        ],
      },
    ],
    {
      appName: "CrateFront",
      projectId: walletConnectProjectId,
    },
  );

  return createConfig({
    chains: [base],
    connectors,
    transports: {
      [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL, { batch: true }),
    },
    ssr: true,
  });
}
