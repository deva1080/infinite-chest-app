"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Gift,
  KeyRound,
  RefreshCw,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { contractAddresses, getContractConfig } from "@/lib/contracts";
import { formatKeys } from "@/lib/format";
import { useNftInventory } from "@/lib/hooks/use-nft-inventory";
import { useUserStats } from "@/lib/hooks/use-user-stats";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import questCatalogJson from "@/public/quest/quest.json";

const questKinds = [
  "Open count",
  "Open before deadline",
  "Open specific config",
  "Open random config",
  "Batch open once",
  "Bonus open count",
  "Burn specific token",
  "Burn random token",
  "Complete quests",
] as const;

const questKindByName: Record<string, number> = {
  OpenCount: 0,
  OpenBeforeDeadline: 1,
  OpenSpecificConfig: 2,
  OpenRandomConfig: 3,
  BatchOpenOnce: 4,
  BonusOpenCount: 5,
  BurnSpecificToken: 6,
  BurnRandomTokenFromPool: 7,
  CompleteNQuestsBeforeDeadline: 8,
};

type QuestTemplate = {
  kind: number;
  active: boolean;
  target: number;
  fixedConfigId: number;
  minLevelToAccept: number;
  acceptStart: bigint;
  acceptEnd: bigint;
  completionWindow: bigint;
  fixedTokenId: bigint;
  rewardAmount: bigint;
  expReward: bigint;
  rewardToken: string;
};

type QuestCatalogItem = {
  name: string;
  active: boolean;
  kind: string;
  target: number;
  fixedConfigId: number;
  minLevelToAccept: number;
  acceptStart: number | string;
  acceptEnd: number | string;
  completionWindow: number;
  fixedTokenId: number | string;
  rewardToken: string;
  rewardAmount: number | string;
  expReward: number | string;
  configPool: number[];
  tokenPool: Array<number | string>;
};

type AcceptedQuest = {
  templateId: bigint;
  acceptedAt: bigint;
  deadline: bigint;
  progress: number;
  resolvedConfigId: number;
  resolvedTokenId: bigint;
  expReward: bigint;
  completed: boolean;
  claimed: boolean;
  rewardAmount: bigint;
};

type ActiveQuestItem = {
  id: bigint;
  data: AcceptedQuest;
};

type QuestBoardEntry = {
  acceptedQuestId: bigint;
  quest: AcceptedQuest;
  template: QuestTemplate;
};

const questCatalog = questCatalogJson as QuestCatalogItem[];

function templateFromCatalog(templateId: bigint): QuestTemplate | undefined {
  const item = questCatalog[Number(templateId)];
  if (!item) return undefined;

  return {
    kind: questKindByName[item.kind] ?? 0,
    active: item.active,
    target: item.target,
    fixedConfigId: item.fixedConfigId,
    minLevelToAccept: item.minLevelToAccept,
    acceptStart: BigInt(item.acceptStart),
    acceptEnd: BigInt(item.acceptEnd),
    completionWindow: BigInt(item.completionWindow),
    fixedTokenId: BigInt(item.fixedTokenId),
    rewardAmount: BigInt(item.rewardAmount),
    expReward: BigInt(item.expReward),
    rewardToken: item.rewardToken,
  };
}

function field<T>(value: unknown, name: string, index: number, fallback: T): T {
  const record = value as Record<string, unknown> | readonly unknown[] | undefined;
  if (!record) return fallback;
  if (Array.isArray(record) && record[index] !== undefined) return record[index] as T;
  if (!Array.isArray(record)) {
    const namedRecord = record as Record<string, unknown>;
    if (namedRecord[name] !== undefined) return namedRecord[name] as T;
  }
  return fallback;
}

function toTemplate(value: unknown): QuestTemplate {
  return {
    kind: Number(field(value, "kind", 0, 0)),
    active: Boolean(field(value, "active", 1, false)),
    target: Number(field(value, "target", 3, 0)),
    fixedConfigId: Number(field(value, "fixedConfigId", 4, 0)),
    minLevelToAccept: Number(field(value, "minLevelToAccept", 5, 0)),
    acceptStart: field(value, "acceptStart", 7, BigInt(0)),
    acceptEnd: field(value, "acceptEnd", 8, BigInt(0)),
    completionWindow: field(value, "completionWindow", 9, BigInt(0)),
    fixedTokenId: field(value, "fixedTokenId", 11, BigInt(0)),
    rewardAmount: field(value, "rewardAmount", 12, BigInt(0)),
    expReward: field(value, "expReward", 15, BigInt(0)),
    rewardToken: field(value, "rewardToken", 17, ""),
  };
}

function toAcceptedQuest(value: unknown): AcceptedQuest {
  return {
    templateId: field(value, "templateId", 0, BigInt(0)),
    acceptedAt: field(value, "acceptedAt", 2, BigInt(0)),
    deadline: field(value, "deadline", 3, BigInt(0)),
    progress: Number(field(value, "progress", 4, 0)),
    resolvedConfigId: Number(field(value, "resolvedConfigId", 5, 0)),
    resolvedTokenId: field(value, "resolvedTokenId", 6, BigInt(0)),
    expReward: field(value, "expReward", 7, BigInt(0)),
    completed: Boolean(field(value, "completed", 8, false)),
    claimed: Boolean(field(value, "claimed", 9, false)),
    rewardAmount: field(value, "rewardAmount", 11, BigInt(0)),
  };
}

function toBoardEntry(value: unknown): QuestBoardEntry {
  return {
    acceptedQuestId: field(value, "acceptedQuestId", 0, BigInt(0)),
    quest: toAcceptedQuest(field(value, "quest", 1, undefined)),
    template: toTemplate(field(value, "template", 2, undefined)),
  };
}

function formatDate(seconds: bigint) {
  if (seconds === BigInt(0)) return "No deadline";
  return new Date(Number(seconds) * 1000).toLocaleString();
}

function isBurnKind(kind: number) {
  return kind === 6 || kind === 7;
}

function isOpenKind(kind: number) {
  return kind >= 0 && kind <= 5;
}

function progressPct(progress: number, target: number) {
  if (target <= 0) return progress > 0 ? 100 : 0;
  return Math.min(100, Math.round((progress / target) * 100));
}

function playerTitle(level: number) {
  if (level >= 25) return "Chrono Legend";
  if (level >= 15) return "Vault Raider";
  if (level >= 8) return "Key Hunter";
  return "Novice Adventurer";
}

function templateAccent(kind: number) {
  if (kind === 0 || kind === 1) return "from-emerald-400/35 to-lime-300/20 border-emerald-300/55";
  if (kind === 2 || kind === 3) return "from-cyan-400/35 to-sky-400/20 border-cyan-300/55";
  if (kind === 4 || kind === 5) return "from-violet-400/35 to-fuchsia-400/20 border-violet-300/55";
  return "from-amber-400/35 to-orange-400/20 border-amber-300/55";
}

function questIcon(kind: number) {
  if (kind === 6 || kind === 7) return KeyRound;
  if (kind === 5) return Zap;
  if (kind === 8) return Trophy;
  return Gift;
}

function currentDay() {
  return Math.floor(Date.now() / 86_400_000);
}

function seededValue(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dailyRank(address: string | undefined, templateId: bigint) {
  return seededValue(`${address ?? "anon"}-${currentDay()}-${templateId.toString()}`);
}

function questTitle(templateId: bigint) {
  return questCatalog[Number(templateId)]?.name ?? `Template #${templateId.toString()}`;
}

function questRequirement(template: QuestTemplate, catalog?: QuestCatalogItem) {
  if (template.kind === 2) return `Open config #${template.fixedConfigId}`;
  if (template.kind === 3 && catalog?.configPool.length) {
    return `Random config: ${catalog.configPool.map((id) => `#${id}`).join(", ")}`;
  }
  if (template.kind === 4) return "Do one batch open";
  if (template.kind === 5) return "Hit bonus opens";
  if (template.kind === 6) return `Burn NFT #${template.fixedTokenId.toString()}`;
  if (template.kind === 7 && catalog?.tokenPool.length) {
    return `Burn one token from pool (${catalog.tokenPool.length} options)`;
  }
  return `Open ${template.target} chest${template.target === 1 ? "" : "s"}`;
}

function availabilityReason(
  template: QuestTemplate,
  level: number,
  activeTemplateIds: Set<string>,
  templateId: bigint,
  maxActiveReached: boolean,
  balanceMap: Map<string, bigint>,
) {
  if (!template.active) return "Inactive";
  if (activeTemplateIds.has(templateId.toString())) return "Already active";
  if (maxActiveReached) return "Max active quests";
  if (level < template.minLevelToAccept) return `Requires level ${template.minLevelToAccept}`;

  const now = Math.floor(Date.now() / 1000);
  if (template.acceptStart > BigInt(0) && now < Number(template.acceptStart)) return "Not started";
  if (template.acceptEnd > BigInt(0) && now > Number(template.acceptEnd)) return "Window closed";

  if (template.kind === 6) {
    const balance = balanceMap.get(template.fixedTokenId.toString()) ?? BigInt(0);
    if (balance === BigInt(0)) return `Missing NFT #${template.fixedTokenId.toString()}`;
  }

  return null;
}

export default function QuestsPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const questConfig = getContractConfig("QuestController");
  const itemsConfig = getContractConfig("CrateGameItems");
  const userStats = useUserStats(address);
  const { balanceMap } = useNftInventory(address, {
    includeConfiguredTokens: true,
  });
  const bumpUserDataNonce = useAppStore((s) => s.bumpUserDataNonce);
  const bumpBalanceNonce = useAppStore((s) => s.bumpBalanceNonce);
  const bumpInventoryNonce = useAppStore((s) => s.bumpInventoryNonce);

  const { writeContractAsync } = useWriteContract();

  const { data: templateCount, refetch: refetchTemplateCount } = useReadContract({
    ...questConfig,
    functionName: "templateCount",
    query: {
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const { data: questBoardData, refetch: refetchQuestBoard } = useReadContract({
    ...questConfig,
    functionName: "getUserQuestBoard",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 15_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
    },
  });

  const { boardEntries, pendingReward, maxActiveCount } = useMemo(() => {
    if (!questBoardData) {
      return { boardEntries: [] as QuestBoardEntry[], pendingReward: BigInt(0), maxActiveCount: 3 };
    }
    const [rawBoard, streak, maxActive] = questBoardData as [unknown[], bigint, number];
    return {
      boardEntries: rawBoard.map((raw) => toBoardEntry(raw)),
      pendingReward: streak,
      maxActiveCount: Number(maxActive),
    };
  }, [questBoardData]);

  const activeQuests = useMemo<ActiveQuestItem[]>(() => {
    return boardEntries.map((entry) => ({
      id: entry.acceptedQuestId,
      data: entry.quest,
    }));
  }, [boardEntries]);

  const boardTemplateMap = useMemo(() => {
    const map = new Map<string, QuestTemplate>();
    for (const entry of boardEntries) {
      map.set(entry.quest.templateId.toString(), entry.template);
    }
    return map;
  }, [boardEntries]);

  const templateIds = useMemo(() => {
    const count = Number((templateCount as bigint | undefined) ?? BigInt(0));
    const visibleCount = count > 0 ? count : questCatalog.length;
    return Array.from({ length: visibleCount }, (_, i) => BigInt(i));
  }, [templateCount]);

  const { data: templateReads, refetch: refetchTemplates } = useReadContracts({
    contracts: templateIds.map((id) => ({
      ...questConfig,
      functionName: "getTemplate" as const,
      args: [id],
    })),
    query: {
      enabled: templateIds.length > 0,
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });

  const templates = useMemo(() => {
    const map = new Map<string, QuestTemplate>();
    templateReads?.forEach((read, index) => {
      if (read.status === "success") {
        map.set(String(index), toTemplate(read.result));
      }
    });
    return map;
  }, [templateReads]);

  const visibleActiveQuests = activeQuests;

  function resolveTemplate(templateId: bigint): QuestTemplate | undefined {
    return (
      boardTemplateMap.get(templateId.toString()) ??
      templates.get(templateId.toString()) ??
      templateFromCatalog(templateId)
    );
  }

  const needsQuestBurnApproval = visibleActiveQuests.some(({ data }) => {
    const template = resolveTemplate(data.templateId);
    return template && isBurnKind(template.kind) && !data.claimed;
  });

  const { data: isQuestApproved, refetch: refetchQuestApproval } =
    useReadContract({
      ...itemsConfig,
      functionName: "isApprovedForAll",
      args: address ? [address, contractAddresses.QuestController] : undefined,
      query: {
        enabled: Boolean(address) && needsQuestBurnApproval,
        staleTime: 20_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    });

  async function refreshQuestData() {
    await Promise.all([
      refetchTemplateCount(),
      refetchTemplates(),
      refetchQuestBoard(),
      refetchQuestApproval(),
    ]);
    bumpUserDataNonce();
    bumpBalanceNonce();
    bumpInventoryNonce();
  }

  async function waitForTx(hash: `0x${string}`) {
    if (!publicClient) return;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error("Transaction reverted");
    }
  }

  async function sendQuestTx(label: string, action: () => Promise<`0x${string}`>) {
    try {
      const hash = await action();
      toast.info(`${label}: tx enviada`);
      await waitForTx(hash);
      toast.success(`${label}: confirmado`);
      await refreshQuestData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label}: error`);
    }
  }

  const expToNext = userStats.nextLevelExp > BigInt(0)
    ? userStats.nextLevelExp
    : userStats.exp;
  const expProgress = expToNext > BigInt(0)
    ? Math.min(100, Number((userStats.exp * BigInt(100)) / expToNext))
    : 0;
  const maxActiveReached = visibleActiveQuests.length >= maxActiveCount;
  const activeTemplateIds = useMemo(() => {
    return new Set(visibleActiveQuests.map(({ data }) => data.templateId.toString()));
  }, [visibleActiveQuests]);

  const claimableQuests = useMemo(() => {
    return visibleActiveQuests.filter(({ data }) => {
      const template = resolveTemplate(data.templateId);
      return Boolean(template && !data.claimed && (data.completed || isBurnKind(template.kind)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleActiveQuests, templates, boardTemplateMap]);

  const inProgressQuests = useMemo(() => {
    return visibleActiveQuests.filter(({ data }) => !data.claimed);
  }, [visibleActiveQuests]);

  const suggestedTemplates = useMemo(() => {
    const candidates = templateIds
      .map((id) => {
        const template = templates.get(id.toString()) ?? templateFromCatalog(id);
        if (!template) return null;
        const catalog = questCatalog[Number(id)];
        const reason = availabilityReason(
          template,
          userStats.level,
          activeTemplateIds,
          id,
          maxActiveReached,
          balanceMap,
        );

        let score = 0;
        if (!reason) score += 1000;
        if (isOpenKind(template.kind)) score += 60;
        if (template.kind === 4) score += 45;
        if (template.kind === 6) score += 35;
        score += Math.min(200, Number(template.rewardAmount / BigInt("10000000000000000")));
        score += Math.min(120, Number(template.expReward));
        score -= template.minLevelToAccept * 5;
        score += dailyRank(address, id) % 50;

        if (reason === "Already active") score -= 10_000;
        if (reason === "Inactive" || reason === "Window closed") score -= 5_000;
        if (reason?.startsWith("Requires level")) score -= 2_000;
        if (reason?.startsWith("Missing NFT")) score -= 900;
        if (maxActiveReached) score -= 1_500;

        return { id, template, catalog, reason, score };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => item.reason !== "Already active")
      .sort((a, b) => b.score - a.score || dailyRank(address, a.id) - dailyRank(address, b.id));

    return candidates.slice(0, 3);
  }, [
    activeTemplateIds,
    address,
    balanceMap,
    maxActiveReached,
    templateIds,
    templates,
    userStats.level,
  ]);

  const activeAcceptedToday = visibleActiveQuests.filter(({ data }) => {
    if (data.acceptedAt === BigInt(0)) return false;
    return Math.floor(Number(data.acceptedAt) / 86_400) === currentDay();
  }).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 text-white">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide drop-shadow-[0_0_18px_rgba(255,255,255,0.25)]">
            Quests
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/45">
            Mission control
          </p>
        </div>
        {isConnected && (
          <Button
            size="sm"
            variant="outline"
            className="border-cyan-300/30 bg-black/40 text-cyan-100 hover:bg-cyan-400/10"
            onClick={refreshQuestData}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        )}
      </div>

      {!isConnected && (
        <Alert className="border-cyan-300/25 bg-black/50 text-white">
          <AlertTitle>Wallet desconectada</AlertTitle>
          <AlertDescription>
            Conecta tu wallet para ver y operar quests.
          </AlertDescription>
        </Alert>
      )}

      {isConnected && (
        <div className="grid gap-3">
          <section className="overflow-hidden rounded-xl border border-fuchsia-300/35 bg-black/55 shadow-[0_0_35px_rgba(236,72,153,0.18)] backdrop-blur-md">
            <div className="border-b border-white/10 bg-gradient-to-r from-fuchsia-500/18 via-cyan-400/8 to-transparent px-4 py-2">
              <h2 className="text-sm font-black uppercase tracking-wider">
                Progreso de usuario
              </h2>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-cyan-300/60 bg-gradient-to-br from-cyan-300/30 via-fuchsia-400/30 to-black shadow-[0_0_25px_rgba(34,211,238,0.25)]">
                <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.65),rgba(56,189,248,0.28)_35%,rgba(15,23,42,0.95)_70%)]" />
                <User className="absolute inset-x-0 bottom-2 mx-auto h-12 w-12 text-amber-100/90" />
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/45">
                      Nivel {userStats.level}
                    </p>
                    <p className="text-sm uppercase tracking-wide text-white">
                      Player title:{" "}
                      <span className="font-black text-amber-200">
                        {playerTitle(userStats.level)}
                      </span>
                    </p>
                  </div>
                  <p className="text-right text-lg font-black text-amber-100">
                    {userStats.exp.toString()} EXP
                  </p>
                </div>
                <div className="h-4 overflow-hidden rounded-full border border-cyan-200/25 bg-black/55 p-0.5">
                  <div
                    className="h-full rounded-full bg-[repeating-linear-gradient(90deg,#35ffe1_0_18px,#0ea5e9_18px_20px)] shadow-[0_0_16px_rgba(45,212,191,0.75)]"
                    style={{ width: `${Math.max(6, expProgress)}%` }}
                  />
                </div>
              </div>
              <div className="grid gap-2 border-white/10 md:border-l md:pl-5">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarCheck className="h-4 w-4 text-amber-200" />
                  <span className="text-white/75">Racha diaria:</span>
                  <span className="font-black text-amber-100">{userStats.currentStreak}d</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-cyan-200" />
                  <span className="text-white/75">Nivel actual:</span>
                  <span className="font-black text-amber-100">{userStats.level}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-amber-200" />
                  <span className="text-white/75">Mejor racha:</span>
                  <span className="font-black text-amber-100">{userStats.bestStreak}d</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                  <span className="text-white/75">Claimables:</span>
                  <span className="font-black text-emerald-100">{claimableQuests.length}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4 text-fuchsia-200" />
                  <span className="text-white/75">Activas:</span>
                  <span className="font-black text-fuchsia-100">{visibleActiveQuests.length}/{maxActiveCount}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarCheck className="h-4 w-4 text-cyan-200" />
                  <span className="text-white/75">Aceptadas hoy:</span>
                  <span className="font-black text-cyan-100">{activeAcceptedToday}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-fuchsia-300/35 bg-black/55 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md">
            <div className="border-b border-white/10 px-4 py-2">
              <h2 className="text-sm font-black uppercase tracking-wider">
                Recompensas pendientes
              </h2>
            </div>
            <div className="grid gap-3 p-3 md:grid-cols-[1fr_auto]">
              <div className="flex items-center gap-4 rounded-lg border border-white/12 bg-black/45 px-4 py-3">
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-amber-300/25 bg-[radial-gradient(circle,rgba(250,204,21,0.18),rgba(0,0,0,0.75)_70%)]">
                  <KeyRound className="h-11 w-11 text-amber-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                    Recompensas acumuladas
                  </p>
                  <p className="text-4xl font-black tracking-wide text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]">
                    {formatKeys(pendingReward, 2)} KEY
                  </p>
                </div>
                <Gift className="ml-auto hidden h-14 w-14 text-cyan-200/80 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)] sm:block" />
              </div>
              <div className="flex min-w-72 flex-col justify-center gap-2">
                <Button
                  className="h-10 border border-rose-300/60 bg-rose-500/20 font-black uppercase tracking-wide text-white shadow-[0_0_18px_rgba(244,63,94,0.25)] hover:bg-rose-500/30"
                  disabled={pendingReward === BigInt(0)}
                  onClick={() =>
                    sendQuestTx("Claim streak", () =>
                      writeContractAsync({
                        ...questConfig,
                        functionName: "claimStreakReward",
                      }),
                    )
                  }
                >
                  Reclamar recompensa de racha
                  <KeyRound className="h-4 w-4" />
                </Button>
                <div className="rounded-md border border-rose-300/35 bg-black/45 px-3 py-1 text-center text-xs text-rose-200/70">
                  Reclamar: {pendingReward > BigInt(0) ? "Disponible" : "[Deshabilitado]"}
                </div>
                <p className="text-xs uppercase tracking-wide text-white/60">
                  Siguiente reclamo diario: <span className="text-white">al completar milestone</span>
                </p>
              </div>
            </div>
          </section>

          {needsQuestBurnApproval && !isQuestApproved && (
            <Alert className="border-amber-300/35 bg-black/60 text-white">
              <AlertTitle>Approval requerido para burn quests</AlertTitle>
              <AlertDescription>
                Las quests de burn necesitan permiso ERC1155 para que QuestController queme el NFT al reclamar.
              </AlertDescription>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    sendQuestTx("Approve QuestController", () =>
                      writeContractAsync({
                        ...itemsConfig,
                        functionName: "setApprovalForAll",
                        args: [contractAddresses.QuestController, true],
                      }),
                    )
                  }
                >
                  Approve QuestController
                </Button>
              </div>
            </Alert>
          )}

          {claimableQuests.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-emerald-300/40 bg-black/60 shadow-[0_0_35px_rgba(16,185,129,0.16)] backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-400/18 to-transparent px-4 py-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Listas para reclamar
                </h2>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-200">
                  {claimableQuests.length} ready
                </span>
              </div>
              <div className="grid gap-2 p-3 md:grid-cols-2">
                {claimableQuests.map(({ id, data }) => {
                  const template = resolveTemplate(data.templateId);
                  const catalog = questCatalog[Number(data.templateId)];
                  const Icon = questIcon(template?.kind ?? 0);
                  return (
                    <div
                      key={id.toString()}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-2"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-300/35 bg-black/35">
                        <Icon className="h-7 w-7 text-emerald-200" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-wide">
                          {questTitle(data.templateId)}
                        </p>
                        <p className="truncate text-xs text-white/55">
                          {template ? questRequirement(template, catalog) : "Quest ready"} · Reward {formatKeys(data.rewardAmount)} KEY + {data.expReward.toString()} EXP
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-emerald-300 font-black uppercase text-black hover:bg-emerald-200"
                        onClick={() =>
                          sendQuestTx("Claim quest", () =>
                            writeContractAsync({
                              ...questConfig,
                              functionName: "claimQuest",
                              args: [id],
                            }),
                          )
                        }
                      >
                        Claim
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
            <section className="overflow-hidden rounded-xl border border-fuchsia-300/35 bg-black/55 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Misiones en progreso
                </h2>
                <Button
                  size="xs"
                  className="bg-emerald-400 px-3 font-black uppercase text-black hover:bg-emerald-300"
                  onClick={refreshQuestData}
                >
                  Refrescar
                </Button>
              </div>
              <div className="space-y-2 p-3">
                {inProgressQuests.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-black/35 px-3 py-5 text-center text-sm text-white/45">
                    No tienes quests activas.
                  </p>
                ) : (
                  inProgressQuests.map(({ id, data }) => {
                    const template = resolveTemplate(data.templateId);
                    const catalog = questCatalog[Number(data.templateId)];
                    const target = template?.target ?? 0;
                    const pct = progressPct(data.progress, target);
                    const Icon = questIcon(template?.kind ?? 0);
                    const canClaim = Boolean(
                      template &&
                        !data.claimed &&
                        (data.completed || isBurnKind(template.kind)),
                    );

                    return (
                      <div
                        key={id.toString()}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/12 bg-black/45 px-3 py-2"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/10">
                          <Icon className="h-7 w-7 text-amber-200" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black uppercase tracking-wide">
                            {questTitle(data.templateId)}
                          </p>
                          {template && (
                            <p className="truncate text-[10px] uppercase tracking-wide text-white/40">
                              {questRequirement(template, catalog)}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-white/55">Progress:</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full border border-white/15 bg-black/70">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-300 to-emerald-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-white/75">
                              {target > 0 ? `${data.progress}/${target}` : data.progress}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-white/35">
                            Active #{id.toString()} · Reward {formatKeys(data.rewardAmount)} KEY + {data.expReward.toString()} EXP · {formatDate(data.deadline)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-black uppercase",
                            data.claimed
                              ? "border-white/15 text-white/35"
                              : data.completed
                                ? "border-emerald-300/40 text-emerald-200"
                                : "border-cyan-300/35 text-cyan-200",
                          )}>
                            <CheckCircle2 className="h-3 w-3" />
                            {data.claimed ? "Claimed" : data.completed ? "Ready" : "Activo"}
                          </span>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={!canClaim}
                            className="border-white/15 bg-black/35 text-white hover:bg-white/10"
                            onClick={() =>
                              sendQuestTx("Claim quest", () =>
                                writeContractAsync({
                                  ...questConfig,
                                  functionName: "claimQuest",
                                  args: [id],
                                }),
                              )
                            }
                          >
                            Claim
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-fuchsia-300/35 bg-black/55 backdrop-blur-md">
              <div className="border-b border-white/10 px-4 py-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Elige una nueva misión
                </h2>
                <p className="mt-1 text-xs text-white/40">
                  3 opciones recomendadas para hoy.
                </p>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {suggestedTemplates.length === 0 ? (
                  <p className="col-span-full rounded-lg border border-white/10 bg-black/35 px-3 py-5 text-center text-sm text-white/45">
                    No hay misiones nuevas para ofrecer ahora.
                  </p>
                ) : (
                  suggestedTemplates.map(({ id, template, catalog, reason }) => {
                    const Icon = questIcon(template.kind);
                    const disabled = Boolean(reason);
                    return (
                      <div
                        key={id.toString()}
                        className={cn(
                          "flex min-h-36 flex-col rounded-lg border bg-gradient-to-br p-3",
                          templateAccent(template.kind),
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-black uppercase leading-tight">
                            {catalog?.name ?? questKinds[template.kind] ?? `Kind ${template.kind}`}
                          </p>
                          <Icon className="h-5 w-5 shrink-0 text-white/80" />
                        </div>
                        <div className="my-3 flex flex-1 items-center justify-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/35 shadow-[0_0_20px_rgba(255,255,255,0.12)]">
                            <Icon className="h-8 w-8 text-white" />
                          </div>
                        </div>
                        <div className="space-y-1 text-[10px] text-white/70">
                          <p className="font-semibold text-white/85">
                            {questRequirement(template, catalog)}
                          </p>
                          <p>Target: {template.target || "N/A"}</p>
                          <p>Min level: {template.minLevelToAccept}</p>
                          <p>Reward: {formatKeys(template.rewardAmount)} KEY + {template.expReward.toString()} EXP</p>
                          {template.fixedConfigId > 0 && <p>Config: {template.fixedConfigId}</p>}
                          {template.fixedTokenId > BigInt(0) && <p>Token: {template.fixedTokenId.toString()}</p>}
                          {reason && (
                            <p className="rounded border border-amber-300/25 bg-black/30 px-2 py-1 text-amber-200">
                              {reason}
                            </p>
                          )}
                        </div>
                        <Button
                          size="xs"
                          disabled={disabled}
                          className="mt-3 bg-white/85 font-black uppercase text-black hover:bg-white"
                          onClick={() =>
                            sendQuestTx("Accept quest", () =>
                              writeContractAsync({
                                ...questConfig,
                                functionName: "acceptQuest",
                                args: [id],
                              }),
                            )
                          }
                        >
                          Aceptar
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
