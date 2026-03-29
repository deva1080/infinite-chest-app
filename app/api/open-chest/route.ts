import { NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  isAddress,
  parseGwei,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { contractAddresses } from "@/lib/contracts/addresses";
import { contractAbis } from "@/lib/contracts/abis";

const primaryRpcUrl =
  process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";
const fallbackRpcUrl =
  process.env.BASE_RPC_FALLBACK_URL ?? process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK_URL;
const rpcTimeoutMs = Number(process.env.RELAYER_RPC_TIMEOUT_MS ?? "1200");
const gasBumpPercent = BigInt(process.env.RELAYER_GAS_BUMP_PERCENT ?? "2");
const feeCacheTtlMs = Number(process.env.RELAYER_FEES_CACHE_TTL_MS ?? "1500");

const defaultPriorityFeePerGas = parseGwei("0.01");
const defaultGasPrice = parseGwei("0.02");

type RelayerFees = {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
};

function bumpPercent(value: bigint, percent: bigint) {
  return value + (value * percent) / BigInt(100);
}

const primaryPublicClient = createPublicClient({
  chain: base,
  transport: http(primaryRpcUrl, { timeout: rpcTimeoutMs, retryCount: 1 }),
});

const fallbackPublicClient = fallbackRpcUrl
  ? createPublicClient({
      chain: base,
      transport: http(fallbackRpcUrl, { timeout: rpcTimeoutMs, retryCount: 1 }),
    })
  : null;

let cachedRelayerAccount: ReturnType<typeof privateKeyToAccount> | null = null;
let cachedPrimaryWalletClient: ReturnType<typeof createWalletClient> | null = null;
let cachedFallbackWalletClient: ReturnType<typeof createWalletClient> | null = null;

let cachedFees: RelayerFees | null = null;
let cachedFeesAt = 0;

function getRelayerAccountCached() {
  if (cachedRelayerAccount) return cachedRelayerAccount;
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");
  cachedRelayerAccount = privateKeyToAccount(pk as `0x${string}`);
  return cachedRelayerAccount;
}

function getPrimaryWalletClient() {
  if (cachedPrimaryWalletClient) return cachedPrimaryWalletClient;
  cachedPrimaryWalletClient = createWalletClient({
    account: getRelayerAccountCached(),
    chain: base,
    transport: http(primaryRpcUrl, { timeout: rpcTimeoutMs, retryCount: 1 }),
  });
  return cachedPrimaryWalletClient;
}

function getFallbackWalletClient() {
  if (!fallbackRpcUrl) return null;
  if (cachedFallbackWalletClient) return cachedFallbackWalletClient;
  cachedFallbackWalletClient = createWalletClient({
    account: getRelayerAccountCached(),
    chain: base,
    transport: http(fallbackRpcUrl, { timeout: rpcTimeoutMs, retryCount: 1 }),
  });
  return cachedFallbackWalletClient;
}

async function estimateFeesWithFallback() {
  try {
    return await primaryPublicClient.estimateFeesPerGas({ type: "eip1559" });
  } catch (primaryError) {
    if (!fallbackPublicClient) throw primaryError;
    return fallbackPublicClient.estimateFeesPerGas({ type: "eip1559" });
  }
}

async function getBumpedFees(): Promise<RelayerFees> {
  const now = Date.now();
  if (cachedFees && now - cachedFeesAt < feeCacheTtlMs) {
    return cachedFees;
  }

  const fees = await estimateFeesWithFallback();
  const maxPriorityFeePerGas = bumpPercent(
    fees.maxPriorityFeePerGas ?? defaultPriorityFeePerGas,
    gasBumpPercent,
  );
  const maxFeePerGas = bumpPercent(
    fees.maxFeePerGas ?? ((fees.gasPrice ?? defaultGasPrice) + maxPriorityFeePerGas),
    gasBumpPercent,
  );

  cachedFees = { maxPriorityFeePerGas, maxFeePerGas };
  cachedFeesAt = now;
  return cachedFees;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { configId, userAddress, referrer } = body as {
      configId: number;
      userAddress: string;
      referrer?: string;
    };

    if (configId === undefined || configId === null) {
      return NextResponse.json({ error: "configId is required" }, { status: 400 });
    }

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 });
    }

    const validReferrer = referrer && isAddress(referrer) ? referrer : null;

    const account = getRelayerAccountCached();
    const { maxPriorityFeePerGas, maxFeePerGas } = await getBumpedFees();

    const baseTx = {
      account,
      chain: base,
      address: contractAddresses.InfiniteChest,
      abi: contractAbis.InfiniteChest,
      maxPriorityFeePerGas,
      maxFeePerGas,
    } as const;

    const txParams = validReferrer
      ? ({
          ...baseTx,
          functionName: "openAndSetReferrer" as const,
          args: [configId, userAddress as Address, validReferrer as Address],
        } as const)
      : ({
          ...baseTx,
          functionName: "open" as const,
          args: [configId, userAddress as Address],
        } as const);

    let hash: `0x${string}`;
    try {
      hash = await getPrimaryWalletClient().writeContract(txParams);
    } catch (primaryError) {
      const fallbackWalletClient = getFallbackWalletClient();
      if (!fallbackWalletClient) throw primaryError;
      hash = await fallbackWalletClient.writeContract(txParams);
    }

    return NextResponse.json({ hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("open-chest error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
