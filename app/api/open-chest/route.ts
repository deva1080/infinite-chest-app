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
const MAX_BATCH = 50;
const singleOpenGasLimit = BigInt(process.env.RELAYER_GAS_LIMIT_SINGLE ?? "500000");
const batchGasBase = BigInt(process.env.RELAYER_GAS_LIMIT_BATCH_BASE ?? "1800000");
const batchGasPerOpen = BigInt(process.env.RELAYER_GAS_LIMIT_BATCH_PER_OPEN ?? "300000");
const batchGasAutoSellExtra = BigInt(
  process.env.RELAYER_GAS_LIMIT_BATCH_AUTOSELL_EXTRA ?? "600000",
);
const batchGasBonusHeadroom = BigInt(
  process.env.RELAYER_GAS_LIMIT_BATCH_BONUS_HEADROOM ?? "2500000",
);
const batchGasCap = BigInt(process.env.RELAYER_GAS_LIMIT_BATCH_CAP ?? "12000000");

const defaultPriorityFeePerGas = parseGwei("0.01");
const defaultGasPrice = parseGwei("0.02");

type RelayerFees = {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
};

type OpenChestBody = {
  configId: number;
  userAddress: string;
  referrer?: string;
  amount?: number;
  autoSell?: boolean;
};

function bumpPercent(value: bigint, percent: bigint) {
  return value + (value * percent) / BigInt(100);
}

function isValidUint32(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function formatCallArg(value: string | number | boolean) {
  return typeof value === "string" ? `"${value}"` : String(value);
}

function buildCallPreview(
  functionName: "open" | "openAndSetReferrer" | "openBatch",
  args: readonly (string | number | boolean)[],
) {
  return `${functionName}(${args.map(formatCallArg).join(", ")})`;
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

function computeFixedGasLimit(openAmount: number, isBatch: boolean, autoSell: boolean) {
  if (!isBatch) return singleOpenGasLimit;

  let gas =
    batchGasBase +
    batchGasPerOpen * BigInt(openAmount) +
    batchGasBonusHeadroom;
  if (autoSell) gas += batchGasAutoSellExtra;
  if (gas > batchGasCap) gas = batchGasCap;
  return gas;
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
  let requestBody: OpenChestBody | null = null;
  let callPreview: string | null = null;

  try {
    const body = (await request.json()) as OpenChestBody;
    requestBody = body;
    const { configId, userAddress, referrer, amount, autoSell } = body;

    if (configId === undefined || configId === null) {
      return NextResponse.json(
        { error: "configId is required", requestBody },
        { status: 400 },
      );
    }

    if (!isValidUint32(configId)) {
      return NextResponse.json(
        {
          error: `Invalid configId: ${String(configId)}`,
          requestBody,
        },
        { status: 400 },
      );
    }

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json(
        { error: "Invalid userAddress", requestBody },
        { status: 400 },
      );
    }

    const openAmount = Number.isInteger(amount) ? Number(amount) : 1;
    if (openAmount < 1 || openAmount > MAX_BATCH) {
      return NextResponse.json(
        { error: `amount must be between 1 and ${MAX_BATCH}`, requestBody },
        { status: 400 },
      );
    }

    const openWithAutoSell = Boolean(autoSell);
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

    const isBatch = openAmount > 1 || openWithAutoSell;
    const txParams =
      openAmount > 1 || openWithAutoSell
        ? ({
            ...baseTx,
            functionName: "openBatch" as const,
            args: [configId, userAddress as Address, openAmount, openWithAutoSell],
          } as const)
        : validReferrer
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

    callPreview = buildCallPreview(
      txParams.functionName,
      txParams.args as readonly (string | number | boolean)[],
    );

    const gas = computeFixedGasLimit(openAmount, isBatch, openWithAutoSell);
    const txParamsWithGas = { ...txParams, gas } as const;

    console.info("open-chest request", {
      callPreview,
      requestBody,
      gas: gas.toString(),
      relayer: account.address,
    });

    let hash: `0x${string}`;
    try {
      hash = await getPrimaryWalletClient().writeContract(txParamsWithGas);
    } catch (primaryError) {
      const fallbackWalletClient = getFallbackWalletClient();
      if (!fallbackWalletClient) throw primaryError;
      hash = await fallbackWalletClient.writeContract(txParamsWithGas);
    }

    return NextResponse.json({
      hash,
      mode: openAmount > 1 || openWithAutoSell ? "batch" : "single",
      amount: openAmount,
      autoSell: openWithAutoSell,
      callPreview,
    });
  } catch (err: unknown) {
    const viemError = err as {
      shortMessage?: string;
      details?: string;
      cause?: { reason?: string; shortMessage?: string; data?: { errorName?: string } };
      message?: string;
    };

    const reason =
      viemError.cause?.reason ??
      viemError.cause?.data?.errorName ??
      viemError.cause?.shortMessage ??
      viemError.shortMessage ??
      viemError.details ??
      viemError.message ??
      "Unknown server error";

    console.error("open-chest error:", {
      reason,
      callPreview,
      requestBody,
      error: viemError,
    });
    return NextResponse.json(
      {
        error: reason,
        callPreview,
        requestBody,
      },
      { status: 500 },
    );
  }
}
