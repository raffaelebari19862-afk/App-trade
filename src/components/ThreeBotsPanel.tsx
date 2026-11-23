import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Eye,
  Lock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { User } from "firebase/auth";
import type {
  BotEngineState,
  BotHorizonMode,
  BotPositionItem,
} from "../types/trading";
import { formatEur, formatPrice, formatSignedEur } from "../data/markets";
import { signInWithGoogleForCloudAndGmail } from "../firebase";
import { SectionInfoBar } from "./SectionInfoBar";

interface ThreeBotsPanelProps {
  embedded?: boolean;
  botState: BotEngineState | null;
  tickNow: number;
  loading: boolean;
  okxCopyConnected: boolean;
  firebaseUser: User | null;
  lastCloudSyncAt: number | null;
  onAuthUpdated: (user: User, hasToken: boolean) => void;
  onUpdateConfig: (patch: Record<string, unknown>) => Promise<void>;
  onForceNewCycle: () => Promise<void>;
  onResetBots: () => Promise<void>;
  onInspectPosition: (pos: BotPositionItem) => void;
  onSelectBotAsset: (pos: BotPositionItem) => void;
  onNotify: (title: string, body: string, tone?: "up" | "dn" | "neutral") => void;
}

const HORIZON_OPTIONS: {
  id: BotHorizonMode;
  label: string;
  hint: string;
}[] = [
  { id: "scalping", label: "Scalping 2m", hint: "Ore + Giorni" },
  { id: "intraday", label: "Intraday", hint: "Ore + Giorni + Sett." },
  { id: "swing", label: "Swing", hint: "Giorni + Sett. + Mesi" },
  { id: "macro", label: "Macro", hint: "Sett. + Mesi/Anni" },
];

function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.ceil(msRemaining / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatBotSectorLabel(sector: BotPositionItem["sector"]): string {
  if (sector === "metallo") return "Metallo";
  if (sector === "azione") return "Azione";
  if (sector === "altro_mercato") return "Indice / MP";
  if (sector === "memecoin") return "Memecoin";
  if (sector === "major") return "Major";
  return "Altcoin";
}

function formatHorizonShort(h: BotHorizonMode): string {
  if (h === "scalping") return "Ore+Giorni";
  if (h === "intraday") return "Giorni+Sett.";
  if (h === "swing") return "Sett.+Mesi";
  return "Mesi+Anni";
}

/**
 * Computes real-time win probability for an open bot position by blending
 * pre-entry AI probability, multi-horizon candle alignment, and live trajectory
 * position between Stop Loss (0%) and Take Profit (100%).
 */
function computeLiveWinProbability(pos: BotPositionItem): number {
  const isLong = pos.direction === "L";
  const span = isLong
    ? pos.targetPrice - pos.stopPrice
    : pos.stopPrice - pos.targetPrice;
  const progress =
    span > 0
      ? Math.max(
          0,
          Math.min(
            1,
            isLong
              ? (pos.currentPrice - pos.stopPrice) / span
              : (pos.stopPrice - pos.currentPrice) / span
          )
        )
      : 0.5;
  const entryPos =
    span > 0
      ? Math.max(
          0.1,
          Math.min(
            0.9,
            isLong
              ? (pos.entryPrice - pos.stopPrice) / span
              : (pos.stopPrice - pos.entryPrice) / span
          )
        )
      : 0.45;

  const mhAlign = pos.entryMeta?.multiHorizon?.alignmentScore ?? pos.probabilityPct;
  const baseProb = pos.probabilityPct * 0.65 + mhAlign * 0.35;
  const trajectoryShift = (progress - entryPos) * 46;
  const profitBoost = pos.livePnlEur > 0 ? 4 : pos.livePnlEur < -pos.allocatedMarginEur * 0.04 ? -6 : 0;

  return Math.round(Math.max(16, Math.min(97, baseProb + trajectoryShift + profitBoost)));
}

export const ThreeBotsPanel: React.FC<ThreeBotsPanelProps> = ({
  embedded = false,
  botState,
  tickNow,
  loading,
  okxCopyConnected,
  firebaseUser,
  lastCloudSyncAt,
  onAuthUpdated,
  onUpdateConfig,
  onForceNewCycle,
  onResetBots,
  onInspectPosition,
  onSelectBotAsset,
  onNotify,
}) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [labTab, setLabTab] = useState<"techniques" | "lessons">("techniques");
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const metrics = useMemo(() => {
    if (!botState) {
      return {
        totalNetWealth: 1000,
        totalProfitEur: 0,
        monthlyProgressPct: 0,
        goalCompletionPct: 0,
        winRatePct: null as number | null,
        lossRatePct: null as number | null,
        countdownLabel: "02:00",
        openLivePnlEur: 0,
        openPositionsCount: 0,
        avgOpenWinProbPct: null as number | null,
        grossProfitEur: 0,
        grossLossEur: 0,
        floatingGainEur: 0,
        floatingLossEur: 0,
      };
    }

    const cycle = botState.currentCycle;
    const openPositions = cycle
      ? cycle.positions.filter((p) => p.status === "open")
      : [];
    const openPositionsCount = openPositions.length;
    const avgOpenWinProbPct =
      openPositionsCount > 0
        ? Math.round(
            openPositions.reduce(
              (sum, p) => sum + computeLiveWinProbability(p),
              0
            ) / openPositionsCount
          )
        : null;

    const floatingGainEur = Number(
      openPositions
        .reduce((s, p) => s + (p.livePnlEur > 0 ? p.livePnlEur : 0), 0)
        .toFixed(2)
    );
    const floatingLossEur = Number(
      openPositions
        .reduce((s, p) => s + (p.livePnlEur < 0 ? Math.abs(p.livePnlEur) : 0), 0)
        .toFixed(2)
    );

    const openLivePnlEur = cycle ? cycle.netPnlEur : 0;
    const totalNetWealth =
      botState.vaultEur + botState.activeCapitalEur + openLivePnlEur;
    const totalProfitEur = totalNetWealth - botState.startingMonthCapitalEur;
    const monthlyProgressPct =
      botState.startingMonthCapitalEur > 0
        ? (totalProfitEur / botState.startingMonthCapitalEur) * 100
        : 0;
    const goalTarget = Math.max(10, botState.config.monthlyGoalPct || 100);
    const goalCompletionPct = Math.max(
      0,
      Math.min(100, (monthlyProgressPct / goalTarget) * 100)
    );
    const winRatePct =
      botState.totalTrades > 0
        ? Math.round((botState.wins / botState.totalTrades) * 100)
        : null;
    const lossRatePct = winRatePct !== null ? 100 - winRatePct : null;

    const targetTime = cycle ? cycle.endsAt : botState.nextCycleAt;
    const countdownLabel =
      targetTime > 0 ? formatCountdown(targetTime - tickNow) : "00:00";

    const grossProfitEur = Number(
      Math.max(
        0,
        typeof botState.totalGrossProfitEur === "number"
          ? botState.totalGrossProfitEur
          : Math.max(0, botState.totalRealizedPnlEur)
      ).toFixed(2)
    );
    const grossLossEur = Number(
      Math.max(
        0,
        typeof botState.totalGrossLossEur === "number"
          ? botState.totalGrossLossEur
          : Math.max(0, -botState.totalRealizedPnlEur)
      ).toFixed(2)
    );

    return {
      totalNetWealth,
      totalProfitEur,
      monthlyProgressPct,
      goalCompletionPct,
      winRatePct,
      lossRatePct,
      countdownLabel,
      openLivePnlEur,
      openPositionsCount,
      avgOpenWinProbPct,
      grossProfitEur,
      grossLossEur,
      floatingGainEur,
      floatingLossEur,
    };
  }, [botState, tickNow]);

  const learningView = useMemo(() => {
    const learning = botState?.learning;
    if (!learning) return null;

    const quarantinedAssets = Object.values(learning.assetStats || {})
      .filter((a) => a.cooldownUntil > tickNow)
      .sort((a, b) => b.cooldownUntil - a.cooldownUntil);

    const techniques = [...(learning.discoveredTechniques || [])].sort((a, b) => {
      const rank = (s: string) =>
        s === "vincente" ? 0 : s === "in_test" ? 1 : 2;
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.netPnlEur - a.netPnlEur;
    });

    const lessons = (learning.positionLessons || []).slice(0, 8);

    return {
      learning,
      quarantinedAssets,
      techniques,
      lessons,
    };
  }, [botState?.learning, tickNow]);

  const handleToggleActive = async () => {
    if (!botState) return;
    setBusyAction("toggle");
    try {
      await onUpdateConfig({
        active: !botState.active,
        enabled24h: !botState.active,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleForceCycle = async () => {
    setBusyAction("run");
    try {
      await onForceNewCycle();
    } finally {
      setBusyAction(null);
    }
  };

  const handleReset = async () => {
    setBusyAction("reset");
    try {
      await onResetBots();
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloudSignIn = async () => {
    setSigningIn(true);
    try {
      const { user } = await signInWithGoogleForCloudAndGmail();
      onAuthUpdated(user, true);
      onNotify(
        "Cloud Firestore connesso",
        `Sincronizzazione H24 attiva su ${user.email}.`,
        "up"
      );
    } catch (err) {
      onNotify(
        "Errore accesso Google",
        err instanceof Error ? err.message : "Accesso non riuscito.",
        "dn"
      );
    } finally {
      setSigningIn(false);
    }
  };

  if (!botState) {
    return (
      <div className="p-8 text-center text-xs font-mono text-slate-500 dark:text-slate-400">
        {loading
          ? "Connessione al motore 3 Bot AI H24…"
          : "Stato Bot non disponibile."}
      </div>
    );
  }

  const cycle = botState.currentCycle;
  const activeHorizon: BotHorizonMode = botState.config.horizonMode || "scalping";

  return (
    <div
      className={
        embedded
          ? ""
          : "rounded-2xl border border-slate-200 dark:border-white/[0.08] liquid-surface overflow-hidden"
      }
    >
      {/* 1. CLEAN ACTION HEADER */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Trading Automatico · 3 Bot AI H24
              </h2>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                /
              </span>
              <span
                className={`font-mono text-[11px] font-bold ${
                  botState.active
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {botState.active ? "Motore Attivo" : "In Pausa"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Stima candele multi-orizzonte pre-apertura · Clicca su una posizione per il Focus Live
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {firebaseUser ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-[11px] font-mono text-slate-600 dark:text-slate-300">
              <Cloud className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                {lastCloudSyncAt
                  ? new Date(lastCloudSyncAt).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Cloud"}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleCloudSignIn()}
              disabled={signingIn}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <CloudOff className="w-3.5 h-3.5 text-amber-500" />
              <span>{signingIn ? "Accesso…" : "Collega Cloud"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleToggleActive()}
            disabled={busyAction !== null}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              botState.active
                ? "border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {botState.active ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-500" />
                Pausa
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Avvia H24
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleForceCycle()}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${busyAction === "run" ? "animate-spin" : ""}`}
            />
            {busyAction === "run" ? "Analisi…" : "Nuovo Ciclo Ora"}
          </button>

          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={busyAction !== null}
            title="Azzera storico e cassaforte bot"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. INSTITUTIONAL 6-METRIC TRADING LEDGER: POSIZIONI, PROBABILITÀ, VINTE, PERSE, GUADAGNO, PERDITA */}
      <div className="border-b border-slate-200 dark:border-white/[0.07]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/[0.07]">
          {/* 1. Posizioni aperte */}
          <div className="px-4 py-3 sm:px-5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Posizioni aperte
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                {metrics.openPositionsCount}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">/ 3</span>
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {metrics.openPositionsCount > 0
                ? `Ciclo #${cycle?.cycleNumber ?? "–"} · ${metrics.countdownLabel}`
                : "Nessuno slot aperto"}
            </div>
          </div>

          {/* 2. Probabilità vittoria posizioni aperte */}
          <div className="px-4 py-3 sm:px-5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Prob. vittoria aperte
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span
                className={`text-lg font-extrabold ${
                  metrics.avgOpenWinProbPct === null
                    ? "text-slate-400 dark:text-slate-500"
                    : metrics.avgOpenWinProbPct >= 65
                    ? "text-emerald-600 dark:text-emerald-400"
                    : metrics.avgOpenWinProbPct >= 48
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {metrics.avgOpenWinProbPct !== null
                  ? `${metrics.avgOpenWinProbPct}%`
                  : "–"}
              </span>
              {metrics.avgOpenWinProbPct !== null && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  stima live
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  (metrics.avgOpenWinProbPct ?? 0) >= 65
                    ? "bg-emerald-500"
                    : (metrics.avgOpenWinProbPct ?? 0) >= 48
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${metrics.avgOpenWinProbPct ?? 0}%` }}
              />
            </div>
          </div>

          {/* 3. Posizioni vinte */}
          <div className="px-4 py-3 sm:px-5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Posizioni vinte
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {botState.wins}
              </span>
              {metrics.winRatePct !== null && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  ({metrics.winRatePct}%)
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Su {botState.totalTrades} chiuse
            </div>
          </div>

          {/* 4. Posizioni perse */}
          <div className="px-4 py-3 sm:px-5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Posizioni perse
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-lg font-extrabold text-red-600 dark:text-red-400">
                {botState.losses}
              </span>
              {metrics.lossRatePct !== null && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  ({metrics.lossRatePct}%)
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Analizzate dall&apos;IA
            </div>
          </div>

          {/* 5. Guadagno */}
          <div className="px-4 py-3 sm:px-5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Guadagno
            </div>
            <div className="mt-1 font-mono text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              +{formatEur(metrics.grossProfitEur)}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {metrics.floatingGainEur > 0
                ? `In corso +${formatEur(metrics.floatingGainEur)}`
                : "Lordo realizzato"}
            </div>
          </div>

          {/* 6. Perdita */}
          <div className="px-4 py-3 sm:px-5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Perdita
            </div>
            <div className="mt-1 font-mono text-lg font-extrabold text-red-600 dark:text-red-400 tabular-nums">
              -{formatEur(metrics.grossLossEur)}
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {metrics.floatingLossEur > 0
                ? `In corso -${formatEur(metrics.floatingLossEur)}`
                : `Netto ${formatSignedEur(botState.totalRealizedPnlEur)}`}
            </div>
          </div>
        </div>

        <SectionInfoBar
          title="Bilancio Operativo & Probabilità Live"
          summary="Riassume in tempo reale il numero di posizioni aperte, la loro probabilità dinamica di vittoria, il conteggio di operazioni vinte/perse e i flussi separati di Guadagno e Perdita."
          details={[
            {
              heading: "Probabilità vittoria posizioni aperte",
              body: "Combina la confidenza iniziale dell'IA (65%), l'allineamento delle candele multi-orizzonte (35%) e l'avanzamento live del prezzo tra Stop Loss e Take Profit. Sale mentre il prezzo si avvicina al TP e scende se arretra verso lo SL.",
            },
            {
              heading: "Aperte, Vinte e Perse",
              body: "Le posizioni aperte mostrano gli slot attivi nel ciclo corrente (fino a 3 simultanei). Ogni chiusura per Take Profit, Trailing, Break-Even, Inversione o fine ciclo incrementa in modo definitivo Vinte o Perse.",
            },
            {
              heading: "Guadagno e Perdita separati",
              body: "Guadagno somma tutti i profitti netti chiusi in positivo (+€); Perdita somma tutte le chiusure negative (-€), al netto delle commissioni. Sotto ogni voce vedi anche l'eventuale profitto o drawdown in corso sugli slot aperti.",
            },
          ]}
        />
      </div>

      {/* 3. CAPITAL, VAULT 59% & HORIZON PARAMETER BLOCK */}
      <div className="border-b border-slate-200 dark:border-white/[0.07]">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-white/[0.07] border-b border-slate-200 dark:border-white/[0.07]">
          <div className="px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Cassaforte Profitti (59%)
            </div>
            <div className="mt-0.5 font-mono text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {formatEur(botState.vaultEur)}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Patrimonio totale {formatEur(metrics.totalNetWealth)}
            </div>
          </div>

          <div className="px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
              Capitale Attivo (41%)
            </div>
            <div className="mt-0.5 font-mono text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {formatEur(botState.activeCapitalEur)}
            </div>
            <div
              className={`font-mono text-[11px] font-bold tabular-nums ${
                metrics.openLivePnlEur >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              Ciclo live: {formatSignedEur(metrics.openLivePnlEur)}
            </div>
          </div>

          <div className="px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Timer className="w-3.5 h-3.5 text-amber-500" />
              Prossimo Ciclo (Max 2m)
            </div>
            <div className="mt-0.5 font-mono text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {metrics.countdownLabel}
            </div>
            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              Leva ×{botState.config.leverage} ·{" "}
              {botState.config.tradeAmountMode === "auto"
                ? "Taglia auto 28%/3"
                : `Fisso €${botState.config.fixedPerBotEur}`}
            </div>
          </div>

          <div className="px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-emerald-500" />
                Obiettivo +{botState.config.monthlyGoalPct}%
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {metrics.monthlyProgressPct >= 0 ? "+" : ""}
                {metrics.monthlyProgressPct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(3, metrics.goalCompletionPct)}%` }}
              />
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              Saldo netto: {formatSignedEur(metrics.totalProfitEur)}
            </div>
          </div>
        </div>

        {/* Horizon & Compact Parameters Bar */}
        <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-white/[0.015] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Stima Candele:
            </span>
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#080D16] p-0.5">
              {HORIZON_OPTIONS.map((opt) => {
                const selected = activeHorizon === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void onUpdateConfig({ horizonMode: opt.id })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                    title={`Priorità candele: ${opt.hint}`}
                  >
                    {opt.label}{" "}
                    <span
                      className={`hidden xl:inline font-normal ${
                        selected ? "text-emerald-100" : "text-slate-400"
                      }`}
                    >
                      ({opt.hint})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="text-[11px]">Leva</span>
              <select
                value={botState.config.leverage}
                onChange={(e) =>
                  void onUpdateConfig({ leverage: Number(e.target.value) })
                }
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] font-mono text-xs text-slate-900 dark:text-white"
              >
                {[5, 10, 15, 20, 25, 30, 35].map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}x
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="text-[11px]">Taglia</span>
              <select
                value={botState.config.tradeAmountMode}
                onChange={(e) =>
                  void onUpdateConfig({ tradeAmountMode: e.target.value })
                }
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-xs text-slate-900 dark:text-white"
              >
                <option value="auto">Auto (28%/3)</option>
                <option value="fixed">Fisso €</option>
              </select>
            </label>

            {botState.config.tradeAmountMode === "fixed" && (
              <input
                type="number"
                min={10}
                max={5000}
                step={10}
                defaultValue={botState.config.fixedPerBotEur}
                onBlur={(e) =>
                  void onUpdateConfig({
                    fixedPerBotEur: Number(e.target.value) || 250,
                  })
                }
                className="w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] font-mono text-xs text-slate-900 dark:text-white"
              />
            )}

            <label
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                okxCopyConnected
                  ? "text-slate-700 dark:text-slate-200 cursor-pointer"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              <input
                type="checkbox"
                checked={botState.config.autoCopyToOkx}
                disabled={!okxCopyConnected}
                onChange={(e) =>
                  void onUpdateConfig({ autoCopyToOkx: e.target.checked })
                }
                className="rounded border-slate-300 dark:border-slate-700 text-emerald-600"
              />
              <span>OKX Copy</span>
            </label>
          </div>
        </div>

        <SectionInfoBar
          title="Gestione Capitale, Cassaforte 59% & Orizzonte Candele"
          summary="Protegge automaticamente il 59% dei profitti netti di ogni ciclo e calibra la scansione delle candele storiche in base all'orizzonte temporale selezionato."
          details={[
            {
              heading: "Cassaforte 59% vs Capitale Attivo 41%",
              body: "Quando un ciclo chiude in profitto, il 59% viene bloccato nella Cassaforte (intoccabile da eventuali perdite future) mentre il restante 41% alimenta l'interesse composto del Capitale Attivo.",
            },
            {
              heading: "Stima Candele Multi-Orizzonte",
              body: "Prima di aprire ogni posizione, il motore scarica candele reali 1H (24 ore), 1D (30 giorni), 1W (26 settimane) e 1M (fino a 3 anni). L'orizzonte scelto decide quali timeframe pesano di più nel punteggio di ingresso.",
            },
            {
              heading: "Leva, Taglia e Replica OKX",
              body: "In modalità Auto ogni Bot utilizza un terzo del 28% del Capitale Attivo; in modalità Fisso imposti l'importo esatto per singolo Bot. Con API OKX collegata puoi attivare la replica ordini automatica.",
            },
          ]}
        />
      </div>

      {/* Error Notice */}
      {botState.lastError && (
        <div className="mx-5 mt-4 p-3 rounded-xl border border-red-500/35 bg-red-500/10 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Motore IA in attesa:</span>{" "}
            {botState.lastError}
          </div>
        </div>
      )}

      {/* 4. ACTIVE 3 POSITIONS — CLEAN, CLICKABLE LIVE CARDS */}
      <div className="border-b border-slate-200 dark:border-white/[0.07]">
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                {cycle
                  ? `Ciclo #${cycle.cycleNumber} · ${cycle.marketHeadline}`
                  : "Preparazione prossimo ciclo con analisi candele multi-orizzonte…"}
              </span>
            </div>
            {cycle && (
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {cycle.aiModel} ·{" "}
                {new Date(cycle.startedAt).toLocaleTimeString("it-IT")}
              </span>
            )}
          </div>

          {cycle ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {cycle.positions.map((pos) => {
                const isLong = pos.direction === "L";
                const isWin = pos.livePnlEur >= 0;
                const liveWinProb =
                  pos.status === "open"
                    ? computeLiveWinProbability(pos)
                    : isWin
                    ? 100
                    : 0;
                const livePositionValueEur = Number(
                  (pos.allocatedMarginEur + pos.livePnlEur).toFixed(2)
                );
                const priceDeltaPct =
                  pos.entryPrice > 0
                    ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100
                    : 0;

                const span = isLong
                  ? pos.targetPrice - pos.stopPrice
                  : pos.stopPrice - pos.targetPrice;
                const progressPct =
                  span > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          isLong
                            ? ((pos.currentPrice - pos.stopPrice) / span) * 100
                            : ((pos.stopPrice - pos.currentPrice) / span) * 100
                        )
                      )
                    : 50;
                const entryMarkerPct =
                  span > 0
                    ? Math.max(
                        6,
                        Math.min(
                          94,
                          isLong
                            ? ((pos.entryPrice - pos.stopPrice) / span) * 100
                            : ((pos.stopPrice - pos.entryPrice) / span) * 100
                        )
                      )
                    : 40;

                const mh = pos.entryMeta?.multiHorizon;

                return (
                  <div
                    key={`${cycle.cycleId}-${pos.botIndex}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onInspectPosition(pos)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onInspectPosition(pos);
                      }
                    }}
                    className={`group rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors cursor-pointer text-left ${
                      pos.status === "closed"
                        ? "border-slate-200 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.015] opacity-80"
                        : isWin
                        ? "border-emerald-500/30 bg-white dark:bg-[#0D1524] hover:border-emerald-500/60"
                        : "border-red-500/30 bg-white dark:bg-[#0D1524] hover:border-red-500/60"
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              Bot #{pos.botIndex}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatBotSectorLabel(pos.sector)}</span>
                            {(pos.reversalsCount || 0) > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                  Inversione
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-0.5 font-display text-base font-extrabold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {pos.name}{" "}
                            <span className="font-mono text-xs font-semibold text-slate-500">
                              ({pos.symbol})
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono shrink-0 tabular-nums">
                          <div
                            className={`inline-flex items-center gap-0.5 text-xs font-extrabold ${
                              isLong
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {isLong ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {isLong ? "LONG" : "SHORT"} ×{pos.leverage}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Prob. vittoria{" "}
                            <strong
                              className={
                                liveWinProb >= 65
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : liveWinProb >= 48
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400"
                              }
                            >
                              {liveWinProb}%
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* LIVE PROFIT / LOSS STRIP */}
                      <div
                        className={`rounded-lg px-3 py-2 flex items-center justify-between gap-2 border ${
                          isWin
                            ? "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-500/[0.06] border-red-500/20 text-red-700 dark:text-red-300"
                        }`}
                      >
                        <span className="font-mono text-[11px] font-bold">
                          {pos.status === "open"
                            ? isWin
                              ? "In guadagno"
                              : "In perdita"
                            : pos.exitReason || "Chiusa"}
                        </span>
                        <span className="font-mono text-sm font-extrabold tabular-nums">
                          {formatSignedEur(pos.livePnlEur)}{" "}
                          <span className="text-xs font-semibold">
                            ({pos.liveRoiPct >= 0 ? "+" : ""}
                            {pos.liveRoiPct.toFixed(1)}%)
                          </span>
                        </span>
                      </div>

                      {/* LIVE CRYPTO PRICE & LIVE POSITION COST -> VALUE */}
                      <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-white/[0.07] border border-slate-200/80 dark:border-white/[0.07] rounded-lg font-mono tabular-nums">
                        <div className="p-2.5">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Prezzo Asset Live
                          </div>
                          <div className="mt-0.5 text-sm font-extrabold text-slate-900 dark:text-white">
                            {formatPrice(pos.currentPrice)}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            In {formatPrice(pos.entryPrice)}{" "}
                            <span
                              className={
                                priceDeltaPct >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-500"
                              }
                            >
                              ({priceDeltaPct >= 0 ? "+" : ""}
                              {priceDeltaPct.toFixed(2)}%)
                            </span>
                          </div>
                        </div>

                        <div className="p-2.5">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Costo → Valore Live
                          </div>
                          <div
                            className={`mt-0.5 text-sm font-extrabold ${
                              isWin
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {formatEur(livePositionValueEur)}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Costo {formatEur(pos.allocatedMarginEur)}
                          </div>
                        </div>
                      </div>

                      {/* Trajectory Bar SL -> Entry -> TP */}
                      <div className="space-y-1">
                        <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isWin ? "bg-emerald-500" : "bg-red-500"
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white"
                            style={{ left: `${entryMarkerPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          <span>SL {formatPrice(pos.stopPrice)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            TP {formatPrice(pos.targetPrice)}
                          </span>
                        </div>
                      </div>

                      {/* Multi-Horizon Candle Verdict Strip */}
                      {mh && (
                        <div className="grid grid-cols-4 divide-x divide-slate-200 dark:divide-white/[0.06] border border-slate-200/70 dark:border-white/[0.06] rounded-lg font-mono text-[10px] tabular-nums">
                          {[
                            { k: "1H", s: mh.hours },
                            { k: "1D", s: mh.days },
                            { k: "1W", s: mh.weeks },
                            { k: "1M", s: mh.monthsYears },
                          ].map(({ k, s }) => (
                            <div key={k} className="px-1.5 py-1 text-center">
                              <div className="text-[9px] text-slate-400">{k}</div>
                              <div
                                className={`font-bold ${
                                  !s
                                    ? "text-slate-400"
                                    : s.changePct >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-500"
                                }`}
                              >
                                {s
                                  ? `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(0)}%`
                                  : "–"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="pt-2.5 border-t border-slate-200/70 dark:border-white/[0.06] flex items-center justify-between gap-2">
                      <span
                        className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate"
                        title={pos.technique}
                      >
                        {pos.technique}
                      </span>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectBotAsset(pos);
                          }}
                          title="Apri nel Grafico Terminale"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                        </button>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline">
                          <Eye className="w-3.5 h-3.5" />
                          Focus
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] text-center space-y-1.5">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Nessun ciclo attivo in questo momento.
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Premi &ldquo;Nuovo Ciclo Ora&rdquo; o attiva H24 per valutare le candele multi-orizzonte e aprire le 3 posizioni migliori.
              </p>
            </div>
          )}

          {/* Compact Live Reversals Strip */}
          {cycle && cycle.recentSlotEvents && cycle.recentSlotEvents.length > 0 && (
            <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
              <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Ultimi eventi slot:
                </span>
                {cycle.recentSlotEvents.slice(0, 3).map((evt, idx) => (
                  <span key={`${evt.ts}-${evt.botIndex}-${idx}`}>
                    #{evt.botIndex} {evt.symbol} ({evt.reason}){" "}
                    <strong
                      className={
                        evt.pnlEur >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500"
                      }
                    >
                      {formatSignedEur(evt.pnlEur)}
                    </strong>
                  </span>
                ))}
              </div>
              <span className="text-slate-500 dark:text-slate-400">
                Realizzato ciclo: {formatSignedEur(cycle.closedSlotPnlEur || 0)}
              </span>
            </div>
          )}
        </div>

        <SectionInfoBar
          title="Posizioni Aperte dei 3 Bot AI"
          summary="Mostra in tempo reale le 3 operazioni simultanee gestite dal motore automatico con protezione profitti, inversione intelligente e ispezione Focus Live al clic."
          details={[
            {
              heading: "Selezione & Prezzo Live vs Valore",
              body: "Ogni scheda mostra il prezzo live della cripto/asset rispetto all'ingresso e il valore corrente della posizione (Margine + P&L netto). Le 4 celle 1H/1D/1W/1M mostrano il trend storico valutato prima dell'apertura.",
            },
            {
              heading: "Chiusure automatiche e Inversione",
              body: "Le posizioni in profitto vengono protette da Break-Even Shield (+2.8% ROI), Trailing Profit (+5.2% ROI) e Take Profit calibrato su ATR. Se una scelta va contro-trend, il Bot attiva la Tecnica Inversione confermata su 1m o ruota su un altro asset.",
            },
            {
              heading: "Focus Live interattivo",
              body: "Cliccando su qualsiasi scheda apri la finestra Focus Live con aggiornamento ogni 1,2 secondi, curva delle ultime 24 candele 1m e chiusura manuale istantanea del singolo slot.",
            },
          ]}
        />
      </div>

      {/* 5. COMPACT 2-TAB APPRENDIMENTO & LABORATORIO TECNICHE */}
      {learningView && (
        <div className="border-b border-slate-200 dark:border-white/[0.07]">
          <div className="px-5 py-3 border-b border-slate-200/70 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                Apprendimento Continuo &amp; Nuove Tecniche
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                · {learningView.learning.totalEvaluated} posizioni studiate
              </span>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#080D16] p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setLabTab("techniques")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  labTab === "techniques"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Tecniche ({learningView.techniques.length})
              </button>
              <button
                type="button"
                onClick={() => setLabTab("lessons")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  labTab === "lessons"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Lezioni per Posizione ({learningView.lessons.length})
              </button>
            </div>
          </div>

          {labTab === "techniques" ? (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {learningView.techniques.slice(0, 6).map((tech) => {
                const tot = tech.wins + tech.losses;
                const wr = tot > 0 ? Math.round((tech.wins / tot) * 100) : null;
                const statusText =
                  tech.status === "vincente"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : tech.status === "scartata"
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400";
                return (
                  <div
                    key={tech.name}
                    className="rounded-lg border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#0B111C] p-3 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                        {tech.name}
                      </div>
                      <span
                        className={`font-mono text-[10px] font-bold shrink-0 ${statusText}`}
                      >
                        {tech.status === "vincente"
                          ? "Vincente"
                          : tech.status === "scartata"
                          ? "Scartata"
                          : "In test"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {tech.hypothesis}
                    </p>
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
                      <span>Orizzonte: {formatHorizonShort(tech.horizon)}</span>
                      <span>
                        {tot > 0
                          ? `WR ${wr}% (${tech.wins}V/${tech.losses}P) · `
                          : "Pronta al test · "}
                        <strong
                          className={
                            tech.netPnlEur >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500"
                          }
                        >
                          {formatSignedEur(tech.netPnlEur)}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums pb-2 border-b border-slate-200/70 dark:border-white/[0.06]">
                <span>
                  Score Min:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {learningView.learning.adaptiveParams.minParsimonyScore}
                  </strong>
                </span>
                <span>
                  Max Spread:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {learningView.learning.adaptiveParams.maxSpreadPct.toFixed(3)}%
                  </strong>
                </span>
                <span>
                  Vol Surge:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {learningView.learning.adaptiveParams.minVolSurge.toFixed(2)}x
                  </strong>
                </span>
                <span>
                  Bloccati:{" "}
                  <strong className="text-amber-600 dark:text-amber-400">
                    {learningView.learning.blockedByLearningCount}
                  </strong>
                </span>
              </div>

              {learningView.quarantinedAssets.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Quarantena:
                  </span>
                  {learningView.quarantinedAssets.map((a) => (
                    <span
                      key={a.instId}
                      className="text-slate-700 dark:text-slate-300"
                    >
                      {a.symbol} ({formatCountdown(a.cooldownUntil - tickNow)})
                    </span>
                  ))}
                </div>
              )}

              {learningView.lessons.length > 0 ? (
                <div className="divide-y divide-slate-200/70 dark:divide-white/[0.06] border border-slate-200/80 dark:border-white/[0.07] rounded-lg">
                  {learningView.lessons.map((l, idx) => (
                    <div
                      key={`${l.ts}-${l.symbol}-${idx}`}
                      className="px-3 py-2.5 space-y-0.5 text-xs bg-white dark:bg-[#0B111C]"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {l.symbol} ({l.direction === "L" ? "LONG" : "SHORT"}) ·{" "}
                          <span className="text-slate-500 font-normal">
                            {l.technique}
                          </span>
                        </span>
                        <span
                          className={`font-bold shrink-0 ${
                            l.outcome === "win"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500"
                          }`}
                        >
                          {formatSignedEur(l.pnlEur)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        {l.lesson}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Ogni posizione chiusa (in profitto o in perdita) genera qui una lezione operativa concreta che affina i cicli successivi.
                </div>
              )}
            </div>
          )}

          <SectionInfoBar
            title="Apprendimento Continuo & Laboratorio Tecniche"
            summary="Registra l'esito di ogni singola chiusura per promuovere le strategie vincenti, scartare quelle in perdita e proporre nuove varianti operative."
            details={[
              {
                heading: "Stato delle Tecniche",
                body: "Ogni tecnica viene valutata su vincite, perdite e P&L netto: diventa Vincente con Win Rate ≥ 60% e profitto positivo, resta In test durante la raccolta dati, e passa a Scartata se genera perdite ripetute.",
              },
              {
                heading: "Lezioni su ogni chiusura",
                body: "Sia le vincite sia le perdite producono una lezione sintetica (es. spread elevato, volumi deboli, contro-trend 5m o allineamento candele confermato) che viene riletta dall'IA prima del ciclo successivo.",
              },
              {
                heading: "Calibrazione parametri & Quarantena",
                body: "Dopo errori ravvicinati il motore restringe automaticamente spread massimo, alza il volume minimo richiesto e mette in quarantena temporanea (150s–8m) gli asset che hanno causato perdite consecutive.",
              },
            ]}
          />
        </div>
      )}

      {/* 6. COLLAPSIBLE COMPACT CYCLE HISTORY */}
      {botState.history.length > 0 && (
        <div>
          <div className="px-5 py-3">
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              className="flex items-center justify-between w-full text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <span>Storico Cicli Completati ({botState.history.length})</span>
              {showHistory ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showHistory && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/[0.07]">
                <table className="w-full text-left border-collapse font-mono text-[11px] tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                      <th className="py-2 px-3">Ciclo</th>
                      <th className="py-2 px-3">Asset</th>
                      <th className="py-2 px-3 text-right">P&amp;L Netto</th>
                      <th className="py-2 px-3 text-right">Cassaforte 59%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-white/[0.05]">
                    {botState.history.slice(0, 8).map((c) => (
                      <tr key={c.cycleId}>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          #{c.cycleNumber} ·{" "}
                          {new Date(c.endsAt).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          {c.positions.map((p) => p.symbol).join(", ")}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            c.netPnlEur >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500"
                          }`}
                        >
                          {formatSignedEur(c.netPnlEur)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          +{formatEur(c.vaultAddedEur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <SectionInfoBar
            title="Storico Cicli Completati"
            summary="Archivio cronologico dei cicli chiusi con P&L netto aggregato e quota accantonata automaticamente nella Cassaforte al 59%."
            details={[
              {
                heading: "Chiusura del ciclo",
                body: "Ogni ciclo somma i risultati degli slot già chiusi durante il ciclo (Take Profit, Trailing, Inversioni) più la chiusura finale a mercato degli slot ancora aperti allo scadere del timer.",
              },
              {
                heading: "Ripartizione profitti",
                body: "Se il P&L netto del ciclo è positivo, il 59% viene versato in Cassaforte e il 41% reinvestito nel Capitale Attivo. Se è negativo, la Cassaforte rimane intatta.",
              },
              {
                heading: "Persistenza & Cloud",
                body: "Lo storico viene salvato su disco server e, con account Google collegato, sincronizzato automaticamente sul tuo database Cloud Firestore.",
              },
            ]}
          />
        </div>
      )}
    </div>
  );
};
