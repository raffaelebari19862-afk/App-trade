import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  Bot,
  Briefcase,
  CheckCircle2,
  Clock,
  Cloud,
  Globe,
  Image as ImageIcon,
  Link2,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingDown,
  TrendingUp,
  Trophy,
  VolumeX,
  X,
  XCircle,
} from "lucide-react";
import type { User } from "firebase/auth";
import {
  BACKDROP_PRESETS,
  DEFAULT_BACKDROP,
  DEFAULT_CONFIG,
  DEFAULT_MARKETS,
  formatDuration,
  formatEur,
  formatPrice,
  formatSignedEur,
  getAssetBadgeMeta,
  getCostSpecs,
} from "./data/markets";
import { analyzeMarket } from "./engine/indicators";
import type {
  AccountStats,
  AiValidationResult,
  AuditLogEntry,
  BackdropConfig,
  BotEngineState,
  BotPositionItem,
  CandleBar,
  ClosedTrade,
  CryptoOpportunityRow,
  GlobalCryptoSentiment,
  LiveQuote,
  MarketAsset,
  OkxCopySettings,
  OkxCopyStatus,
  OpenPosition,
  PreBreakoutSignal,
  PriceAlert,
  SoundSettings,
  StrategyConfig,
  TechnicalAnalysis,
  ToastNotice,
} from "./types/trading";
import { LiveChart } from "./components/LiveChart";
import { LeaderboardPanel } from "./components/LeaderboardPanel";
import { CryptoOpportunityPanel } from "./components/CryptoOpportunityPanel";
import { VolatilityScreener } from "./components/VolatilityScreener";
import { PreBreakoutBanner } from "./components/PreBreakoutBanner";
import { EmailAlertBannerModal } from "./components/EmailAlertBannerModal";
import { ThreeBotsPanel } from "./components/ThreeBotsPanel";
import { OkxExplorerModal } from "./components/OkxExplorerModal";
import { OkxCopyTradingModal } from "./components/OkxCopyTradingModal";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { BackdropModal } from "./components/BackdropModal";
import { PriceAlertModal } from "./components/PriceAlertModal";
import { QuickActionButton } from "./components/QuickActionButton";
import {
  PositionFocusModal,
  type FocusedPositionTarget,
} from "./components/PositionFocusModal";
import { SectionInfoBar } from "./components/SectionInfoBar";
import { playAlarmSound, unlockAudioContext } from "./utils/soundAlarm";
import {
  subscribeFirebaseAuth,
  signInWithGoogleForCloudAndGmail,
  signOutGoogle,
} from "./firebase";
import {
  loadCloudTerminalSummary,
  syncAllToCloud,
} from "./services/cloudSync";
import {
  beaconSaveToServer,
  loadFromIndexedDb,
  loadFromLocalStorage,
  loadFromServer,
  type PersistedAppState,
  saveToIndexedDb,
  saveToLocalStorage,
  saveToServer,
  STORAGE_KEY,
} from "./utils/storage";

interface MarketRuntime {
  closes: number[];
  closes5m: number[];
  bars: CandleBar[];
  barStartTs: number;
  cooldownUntil: number;
  lastAiCheckTs: number;
  aiInFlight: boolean;
  lastAiResult?: AiValidationResult;
}

type CategoryFilter = "all" | "c" | "im";
type PositionTab = "open" | "closed" | "audit";
type ScannerTab = "leaderboard" | "crypto" | "volatility";
type WorkspaceView = "bots" | "terminale" | "scanner" | "portafoglio";

export default function App() {
  const [markets, setMarkets] = useState<MarketAsset[]>(DEFAULT_MARKETS);
  const [selectedPair, setSelectedPair] = useState<string>("BTC/USD");
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_CONFIG);
  const [stats, setStats] = useState<AccountStats>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    totalFees: 0,
  });
  const [positions, setPositions] = useState<Record<string, OpenPosition>>({});
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [autoTrading, setAutoTrading] = useState<boolean>(true);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("scalper_theme");
    if (saved) return saved === "dark";
    return true;
  });
  const [backdrop, setBackdrop] = useState<BackdropConfig>(DEFAULT_BACKDROP);

  // OKX Copy Trading state
  const [okxCopyStatus, setOkxCopyStatus] = useState<OkxCopyStatus>({ connected: false });
  const [copySettings, setCopySettings] = useState<OkxCopySettings>({
    enabled: true,
    orderSizeContracts: "1",
    marginMode: "cross",
  });

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [marketSearch, setMarketSearch] = useState<string>("");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("bots");
  const [positionTab, setPositionTab] = useState<PositionTab>("open");
  const [scannerTab, setScannerTab] = useState<ScannerTab>("crypto");
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [explorerOpen, setExplorerOpen] = useState<boolean>(false);
  const [copyModalOpen, setCopyModalOpen] = useState<boolean>(false);
  const [backdropOpen, setBackdropOpen] = useState<boolean>(false);
  const [alertsModalOpen, setAlertsModalOpen] = useState<boolean>(false);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [ringingAlertIds, setRingingAlertIds] = useState<string[]>([]);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    muted: false,
    volume: 0.85,
    defaultPreset: "bell",
  });
  const [bgImageFailed, setBgImageFailed] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [cryptoGlobalContext, setCryptoGlobalContext] = useState<GlobalCryptoSentiment | null>(null);
  const [cryptoOpportunities, setCryptoOpportunities] = useState<CryptoOpportunityRow[]>([]);
  const [cryptoScanLoading, setCryptoScanLoading] = useState<boolean>(false);
  const [cryptoScanError, setCryptoScanError] = useState<string | null>(null);

  // Pre-breakout Radar + Gmail Banner + 3 Autonomous H24 Bots + Cloud Sync state
  const [preBreakoutSignals, setPreBreakoutSignals] = useState<PreBreakoutSignal[]>([]);
  const [preBreakoutLoading, setPreBreakoutLoading] = useState<boolean>(false);
  const [emailModalOpen, setEmailModalOpen] = useState<boolean>(false);
  const [botState, setBotState] = useState<BotEngineState | null>(null);
  const [botsLoading, setBotsLoading] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [hasGmailToken, setHasGmailToken] = useState<boolean>(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState<boolean>(false);
  const [quickActionBusy, setQuickActionBusy] = useState<"sell_all" | "rebalance" | null>(null);
  const [quickActionNote, setQuickActionNote] = useState<string | null>(null);
  const [focusedPosition, setFocusedPosition] = useState<FocusedPositionTarget | null>(null);
  const syncedCyclesRef = useRef<Set<string>>(new Set());
  const cloudSyncInFlightRef = useRef<boolean>(false);
  const cloudSyncMetaRef = useRef<{
    fingerprint: string;
    lastWriteAt: number;
    lastEquity: number;
  }>({ fingerprint: "", lastWriteAt: 0, lastEquity: 0 });

  // Live reactive snapshot updated every 1s
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [analyses, setAnalyses] = useState<Record<string, TechnicalAnalysis>>({});
  const [aiSnapshots, setAiSnapshots] = useState<Record<string, AiValidationResult>>({});
  const [aiBusyPair, setAiBusyPair] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState<number>(() => Date.now());
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Refs for deterministic 1s loop
  const marketsRef = useRef<MarketAsset[]>(markets);
  const selectedPairRef = useRef<string>(selectedPair);
  const configRef = useRef<StrategyConfig>(config);
  const statsRef = useRef<AccountStats>(stats);
  const positionsRef = useRef<Record<string, OpenPosition>>(positions);
  const tradesRef = useRef<ClosedTrade[]>(trades);
  const auditLogsRef = useRef<AuditLogEntry[]>(auditLogs);
  const autoRef = useRef<boolean>(autoTrading);
  const pushRef = useRef<boolean>(pushEnabled);
  const darkModeRef = useRef<boolean>(darkMode);
  const backdropRef = useRef<BackdropConfig>(backdrop);
  const priceAlertsRef = useRef<PriceAlert[]>(priceAlerts);
  const soundSettingsRef = useRef<SoundSettings>(soundSettings);
  const ringingAlertIdsRef = useRef<string[]>(ringingAlertIds);
  const okxCopyStatusRef = useRef<OkxCopyStatus>(okxCopyStatus);
  const copySettingsRef = useRef<OkxCopySettings>(copySettings);
  const quotesRef = useRef<Record<string, LiveQuote>>({});
  const runtimeRef = useRef<Record<string, MarketRuntime>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const loadedRef = useRef<boolean>(false);
  const serverSaveTimerRef = useRef<number | null>(null);

  const scannerDockRef = useRef<HTMLElement | null>(null);
  const chartSectionRef = useRef<HTMLElement | null>(null);
  const marketSectionRef = useRef<HTMLElement | null>(null);
  const positionsSectionRef = useRef<HTMLElement | null>(null);

  marketsRef.current = markets;
  selectedPairRef.current = selectedPair;
  configRef.current = config;
  statsRef.current = stats;
  positionsRef.current = positions;
  tradesRef.current = trades;
  auditLogsRef.current = auditLogs;
  autoRef.current = autoTrading;
  pushRef.current = pushEnabled;
  darkModeRef.current = darkMode;
  backdropRef.current = backdrop;
  priceAlertsRef.current = priceAlerts;
  soundSettingsRef.current = soundSettings;
  ringingAlertIdsRef.current = ringingAlertIds;
  okxCopyStatusRef.current = okxCopyStatus;
  copySettingsRef.current = copySettings;

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("scalper_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const pushToast = useCallback(
    (title: string, body: string, tone: "up" | "dn" | "neutral" = "neutral") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [{ id, title, body, tone }, ...prev].slice(0, 4));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const notifyEvent = useCallback(
    (title: string, body: string, tone: "up" | "dn" | "neutral" = "neutral") => {
      pushToast(title, body, tone);
      if (
        pushRef.current &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(title, { body });
        } catch {
          // ignore
        }
      }

      const tk = configRef.current.tgToken.trim();
      const ch = configRef.current.tgChatId.trim();
      if (tk && ch) {
        fetch("/api/telegram/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tk, chatId: ch, text: `${title}\n${body}` }),
        }).catch(() => {});
      }
    },
    [pushToast]
  );

  const buildPersistedSnapshot = useCallback((): PersistedAppState => {
    return {
      version: 4,
      updatedAt: Date.now(),
      selectedPair: selectedPairRef.current,
      stats: statsRef.current,
      positions: positionsRef.current,
      trades: tradesRef.current.slice(0, 400),
      auditLogs: auditLogsRef.current.slice(0, 200),
      config: configRef.current,
      autoTrading: autoRef.current,
      pushEnabled: pushRef.current,
      copySettings: copySettingsRef.current,
      customMarkets: marketsRef.current.filter((m) => m.custom),
      backdrop: backdropRef.current,
      darkMode: darkModeRef.current,
      priceAlerts: priceAlertsRef.current,
      soundSettings: soundSettingsRef.current,
    };
  }, []);

  const saveState = useCallback(
    (useBeacon = false) => {
      if (!loadedRef.current) return;
      const snapshot = buildPersistedSnapshot();
      saveToLocalStorage(snapshot);
      saveToIndexedDb(snapshot);
      setLastSavedAt(snapshot.updatedAt);

      if (useBeacon) {
        beaconSaveToServer(snapshot);
        return;
      }

      if (serverSaveTimerRef.current) {
        window.clearTimeout(serverSaveTimerRef.current);
      }
      serverSaveTimerRef.current = window.setTimeout(() => {
        saveToServer(snapshot);
      }, 2000);
    },
    [buildPersistedSnapshot]
  );

  const applyRestoredSnapshot = useCallback((parsed: Record<string, unknown>) => {
    if (parsed.config && typeof parsed.config === "object") {
      setConfig({ ...DEFAULT_CONFIG, ...(parsed.config as Partial<StrategyConfig>) });
    } else if (parsed.cfg && typeof parsed.cfg === "object") {
      const c = parsed.cfg as Record<string, unknown>;
      setConfig({
        ...DEFAULT_CONFIG,
        capital: Number(c.cap) || DEFAULT_CONFIG.capital,
        sizeEur: Number(c.sz) || DEFAULT_CONFIG.sizeEur,
        feeEur: Number(c.fee) || DEFAULT_CONFIG.feeEur,
        cryptoLeverage: Number(c.clev) || DEFAULT_CONFIG.cryptoLeverage,
        tradfiLeverage: Number(c.lev) || DEFAULT_CONFIG.tradfiLeverage,
        maxOpen: Number(c.mo) || DEFAULT_CONFIG.maxOpen,
        minRR: Number(c.rr) || DEFAULT_CONFIG.minRR,
        minConfirmations: Math.max(3, Number(c.cf) || 3),
        minScore: Number(c.ms) || DEFAULT_CONFIG.minScore,
        maxHoldSec: Number(c.mx) || DEFAULT_CONFIG.maxHoldSec,
        tgToken: String(c.tgT || ""),
        tgChatId: String(c.tgC || ""),
      });
    }

    if (parsed.stats && typeof parsed.stats === "object") {
      const st = parsed.stats as Record<string, unknown>;
      setStats({
        totalTrades: Number(st.totalTrades ?? st.n ?? 0),
        wins: Number(st.wins ?? st.w ?? 0),
        losses: Number(st.losses ?? st.l ?? 0),
        realizedPnl: Number(st.realizedPnl ?? st.pnl ?? 0),
        totalFees: Number(st.totalFees ?? st.fees ?? 0),
      });
    }

    if (parsed.positions && typeof parsed.positions === "object") {
      setPositions(parsed.positions as Record<string, OpenPosition>);
    }

    if (Array.isArray(parsed.trades)) {
      setTrades(parsed.trades as ClosedTrade[]);
    }

    if (Array.isArray(parsed.auditLogs)) {
      setAuditLogs(parsed.auditLogs as AuditLogEntry[]);
    }

    if (parsed.copySettings && typeof parsed.copySettings === "object") {
      setCopySettings(parsed.copySettings as OkxCopySettings);
    }

    if (typeof parsed.selectedPair === "string" && parsed.selectedPair) {
      setSelectedPair(parsed.selectedPair);
    }

    if (typeof parsed.autoTrading === "boolean") setAutoTrading(parsed.autoTrading);
    if (
      (parsed.pushEnabled || parsed.push) &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      setPushEnabled(true);
    }

    if (Array.isArray(parsed.customMarkets) && parsed.customMarkets.length > 0) {
      setMarkets((prev) => {
        const existingIds = new Set(prev.map((m) => m.okxId || m.pair));
        const extra = (parsed.customMarkets as MarketAsset[]).filter(
          (m) => !existingIds.has(m.okxId || m.pair)
        );
        return extra.length > 0 ? [...prev, ...extra] : prev;
      });
    }

    if (typeof parsed.updatedAt === "number") {
      setLastSavedAt(parsed.updatedAt);
    }

    if (parsed.backdrop && typeof parsed.backdrop === "object") {
      setBackdrop({ ...DEFAULT_BACKDROP, ...(parsed.backdrop as Partial<BackdropConfig>) });
      setBgImageFailed(false);
    }

    if (typeof parsed.darkMode === "boolean") {
      setDarkMode(parsed.darkMode);
    }

    if (Array.isArray(parsed.priceAlerts)) {
      setPriceAlerts(parsed.priceAlerts as PriceAlert[]);
    }

    if (parsed.soundSettings && typeof parsed.soundSettings === "object") {
      setSoundSettings((prev) => ({
        ...prev,
        ...(parsed.soundSettings as Partial<SoundSettings>),
      }));
    }
  }, []);

  // Reconcile state on startup across localStorage, IndexedDB, and Server file snapshot
  useEffect(() => {
    let active = true;
    const localSnapshot = loadFromLocalStorage();
    if (localSnapshot) {
      applyRestoredSnapshot(localSnapshot);
    }

    Promise.allSettled([loadFromIndexedDb(), loadFromServer()]).then(
      ([idbRes, srvRes]) => {
        if (!active) return;
        const candidates: Record<string, unknown>[] = [];
        if (localSnapshot) candidates.push(localSnapshot);
        if (idbRes.status === "fulfilled" && idbRes.value) {
          candidates.push(idbRes.value as unknown as Record<string, unknown>);
        }
        if (srvRes.status === "fulfilled" && srvRes.value) {
          candidates.push(srvRes.value as unknown as Record<string, unknown>);
        }

        if (candidates.length > 0) {
          candidates.sort(
            (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
          );
          const newest = candidates[0];
          if (newest !== localSnapshot) {
            applyRestoredSnapshot(newest);
          }
        }

        loadedRef.current = true;
        // Immediately sync newest merged snapshot to all 3 layers
        const synced = buildPersistedSnapshot();
        saveToLocalStorage(synced);
        saveToIndexedDb(synced);
        saveToServer(synced);
        setLastSavedAt(synced.updatedAt);
      }
    );

    const handleLifecycleFlush = () => {
      if (document.visibilityState === "hidden") {
        saveState(true);
      }
    };
    const handleUnloadFlush = () => saveState(true);

    document.addEventListener("visibilitychange", handleLifecycleFlush);
    window.addEventListener("pagehide", handleUnloadFlush);
    window.addEventListener("beforeunload", handleUnloadFlush);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleLifecycleFlush);
      window.removeEventListener("pagehide", handleUnloadFlush);
      window.removeEventListener("beforeunload", handleUnloadFlush);
    };
  }, [applyRestoredSnapshot, buildPersistedSnapshot, saveState]);

  useEffect(() => {
    saveState(false);
  }, [
    config,
    stats,
    positions,
    trades,
    auditLogs,
    autoTrading,
    pushEnabled,
    markets,
    copySettings,
    selectedPair,
    backdrop,
    darkMode,
    priceAlerts,
    soundSettings,
    saveState,
  ]);

  const refreshOkxCopyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/okx/copytrading/status", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setOkxCopyStatus(json);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshOkxCopyStatus();
  }, [refreshOkxCopyStatus]);

  const ensureRuntime = (pair: string): MarketRuntime => {
    if (!runtimeRef.current[pair]) {
      runtimeRef.current[pair] = {
        closes: [],
        closes5m: [],
        bars: [],
        barStartTs: 0,
        cooldownUntil: 0,
        lastAiCheckTs: 0,
        aiInFlight: false,
      };
    }
    return runtimeRef.current[pair];
  };

  const pushQuote = useCallback(
    (
      pair: string,
      bid: number,
      ask: number,
      source: LiveQuote["source"],
      extra?: Partial<LiveQuote>
    ) => {
      if (!(bid > 0 && ask > 0)) return;
      const mid = (bid + ask) / 2;
      const prev = quotesRef.current[pair];
      quotesRef.current[pair] = {
        bid,
        ask,
        mid,
        open24h: extra?.open24h ?? prev?.open24h,
        high24h: extra?.high24h ?? prev?.high24h,
        low24h: extra?.low24h ?? prev?.low24h,
        vol24h: extra?.vol24h ?? prev?.vol24h,
        ts: Date.now(),
        marketState: extra?.marketState || prev?.marketState || "REGULAR",
        source,
      };
    },
    []
  );

  // Seed 1m and 5m historical candles from OKX
  const seedOkxAsset = useCallback(async (asset: MarketAsset) => {
    if (!asset.okxId) return;
    try {
      const [res1m, res5m] = await Promise.allSettled([
        fetch(
          `/api/okx/candles?instId=${encodeURIComponent(asset.okxId)}&bar=1m&limit=200`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/okx/candles?instId=${encodeURIComponent(asset.okxId)}&bar=5m&limit=60`,
          { cache: "no-store" }
        ),
      ]);

      const rt = ensureRuntime(asset.pair);
      if (res1m.status === "fulfilled" && res1m.value.ok) {
        const json = await res1m.value.json();
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          const ordered = json.data.slice().reverse();
          const bars: CandleBar[] = ordered.map((c: string[]) => ({
            ts: Number(c[0]),
            open: Number(c[1]),
            high: Number(c[2]),
            low: Number(c[3]),
            close: Number(c[4]),
          }));
          rt.bars = bars;
          rt.closes = bars.map((b) => b.close);
          rt.barStartTs = bars[bars.length - 1]?.ts || Date.now();
        }
      }

      if (res5m.status === "fulfilled" && res5m.value.ok) {
        const json5 = await res5m.value.json();
        if (json5 && Array.isArray(json5.data) && json5.data.length > 0) {
          rt.closes5m = json5.data
            .slice()
            .reverse()
            .map((c: string[]) => Number(c[4]));
        }
      }
    } catch {
      // handled by live updates
    }
  }, []);

  const pollOkxRest = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const hasSwap = marketsRef.current.some((m) => m.okxId?.endsWith("-SWAP"));
      const hasSpot = marketsRef.current.some(
        (m) => m.okxId && !m.okxId.endsWith("-SWAP")
      );
      const requests: Promise<Response>[] = [];
      if (hasSwap) requests.push(fetch("/api/okx/tickers?instType=SWAP", { cache: "no-store" }));
      if (hasSpot) requests.push(fetch("/api/okx/tickers?instType=SPOT", { cache: "no-store" }));

      const responses = await Promise.allSettled(requests);
      for (const result of responses) {
        if (result.status !== "fulfilled" || !result.value.ok) continue;
        const json = await result.value.json();
        if (!json || !Array.isArray(json.data)) continue;

        const mapByInst = new Map<string, Record<string, string>>();
        for (const item of json.data) {
          if (item.instId) mapByInst.set(item.instId, item);
        }

        for (const asset of marketsRef.current) {
          if (!asset.okxId) continue;
          const d = mapByInst.get(asset.okxId);
          if (!d) continue;
          const bid = Number(d.bidPx);
          const ask = Number(d.askPx);
          if (bid > 0 && ask > 0) {
            const existing = quotesRef.current[asset.pair];
            const wsFresh =
              existing && existing.source === "OKX WS" && Date.now() - existing.ts < 3000;
            pushQuote(
              asset.pair,
              wsFresh ? existing.bid : bid,
              wsFresh ? existing.ask : ask,
              wsFresh ? "OKX WS" : "OKX REST",
              {
                open24h: Number(d.open24h) || undefined,
                high24h: Number(d.high24h) || undefined,
                low24h: Number(d.low24h) || undefined,
                vol24h: Number(d.volCcy24h || d.vol24h) || undefined,
              }
            );
          }
        }
      }
    } catch {
      // transient network error
    }
  }, [pushQuote]);

  const pollYahoo = useCallback(
    async (seedCandles: boolean) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const yahooAssets = marketsRef.current.filter((m) => m.yahooSymbol);
      await Promise.allSettled(
        yahooAssets.map(async (asset) => {
          try {
            const res = await fetch(
              `/api/yahoo/chart?symbol=${encodeURIComponent(asset.yahooSymbol!)}&interval=1m&range=1d`,
              { cache: "no-store" }
            );
            if (!res.ok) return;
            const json = await res.json();
            const result = json?.chart?.result?.[0];
            if (!result?.meta) return;

            const timestamps: number[] = result.timestamp || [];
            const q0 = result.indicators?.quote?.[0] || {};
            const closesRaw: (number | null)[] = q0.close || [];
            const opensRaw: (number | null)[] = q0.open || [];
            const highsRaw: (number | null)[] = q0.high || [];
            const lowsRaw: (number | null)[] = q0.low || [];

            const bars: CandleBar[] = [];
            for (let i = 0; i < closesRaw.length; i++) {
              const c = closesRaw[i];
              if (typeof c === "number" && c > 0) {
                bars.push({
                  ts: (timestamps[i] || Math.floor(Date.now() / 1000)) * 1000,
                  open: typeof opensRaw[i] === "number" && opensRaw[i]! > 0 ? opensRaw[i]! : c,
                  high: typeof highsRaw[i] === "number" && highsRaw[i]! > 0 ? highsRaw[i]! : c,
                  low: typeof lowsRaw[i] === "number" && lowsRaw[i]! > 0 ? lowsRaw[i]! : c,
                  close: c,
                });
              }
            }

            if (seedCandles && bars.length >= 20) {
              const sliced = bars.slice(-200);
              const rt = ensureRuntime(asset.pair);
              rt.bars = sliced;
              rt.closes = sliced.map((b) => b.close);
              rt.barStartTs = sliced[sliced.length - 1].ts;
            }

            const lastClose = bars[bars.length - 1]?.close;
            const px = Number(result.meta.regularMarketPrice) || lastClose;
            if (px > 0) {
              const barHigh =
                bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : 0;
              const barLow =
                bars.length > 0 ? Math.min(...bars.map((b) => b.low)) : 0;
              const high24h =
                Number(result.meta.regularMarketDayHigh) ||
                (barHigh > 0 ? barHigh : undefined);
              const low24h =
                Number(result.meta.regularMarketDayLow) ||
                (barLow > 0 ? barLow : undefined);
              const halfSpread = px * (asset.group === "m" ? 0.00012 : 0.00008);
              pushQuote(asset.pair, px - halfSpread, px + halfSpread, "Yahoo", {
                open24h: Number(result.meta.chartPreviousClose) || undefined,
                high24h,
                low24h,
                marketState: result.meta.marketState || "REGULAR",
              });
            }
          } catch {
            // skip
          }
        })
      );
    },
    [pushQuote]
  );

  // OKX Public WebSocket
  const okxIdsSignature = useMemo(
    () =>
      markets
        .map((m) => m.okxId)
        .filter(Boolean)
        .sort()
        .join(","),
    [markets]
  );

  useEffect(() => {
    let closedByCleanup = false;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closedByCleanup) return;
      const okxAssets = marketsRef.current.filter((m) => m.okxId);
      if (okxAssets.length === 0) return;

      let ws: WebSocket;
      try {
        ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      } catch {
        setWsConnected(false);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            op: "subscribe",
            args: okxAssets.map((a) => ({
              channel: "tickers",
              instId: a.okxId,
            })),
          })
        );
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send("ping");
            } catch {
              // ignore
            }
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const json = JSON.parse(event.data);
          if (!json?.data || !Array.isArray(json.data)) return;
          setWsConnected(true);

          for (const d of json.data) {
            const bid = Number(d.bidPx);
            const ask = Number(d.askPx);
            if (!(bid > 0 && ask > 0)) continue;
            for (const asset of marketsRef.current) {
              if (asset.okxId === d.instId) {
                pushQuote(asset.pair, bid, ask, "OKX WS", {
                  open24h: Number(d.open24h) || undefined,
                  high24h: Number(d.high24h) || undefined,
                  low24h: Number(d.low24h) || undefined,
                  vol24h: Number(d.volCcy24h || d.vol24h) || undefined,
                });
              }
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer) window.clearInterval(pingTimer);
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    };

    connect();
    return () => {
      closedByCleanup = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [okxIdsSignature, pushQuote]);

  useEffect(() => {
    const okxAssets = marketsRef.current.filter((m) => m.okxId);
    Promise.allSettled([
      ...okxAssets.map((a) => seedOkxAsset(a)),
      pollOkxRest(),
      pollYahoo(true),
    ]);

    const restTimer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      pollOkxRest();
      pollYahoo(false);
    }, 10000);

    const onVisibilityResume = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void pollOkxRest();
        void pollYahoo(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityResume);

    return () => {
      window.clearInterval(restTimer);
      document.removeEventListener("visibilitychange", onVisibilityResume);
    };
  }, [seedOkxAsset, pollOkxRest, pollYahoo]);

  const appendAuditLog = useCallback((entry: AuditLogEntry) => {
    setAuditLogs((prev) => [entry, ...prev].slice(0, 120));
  }, []);

  // Open Position + optional live OKX Copy Trading Mirror
  const openPosition = useCallback(
    async (
      asset: MarketAsset,
      quote: LiveQuote,
      side: "L" | "S",
      an: TechnicalAnalysis | undefined,
      reason: string,
      manual: boolean,
      aiResult?: AiValidationResult
    ) => {
      const cfg = configRef.current;
      const currPos = positionsRef.current;
      if (currPos[asset.pair]) {
        if (manual) pushToast("Posizione già attiva", `${asset.name} ha già una posizione aperta.`, "neutral");
        return;
      }

      const posList = Object.values(currPos);
      if (posList.length >= cfg.maxOpen) {
        if (manual) pushToast("Limite posizioni raggiunto", `Massimo ${cfg.maxOpen} posizioni contemporanee.`, "dn");
        return;
      }

      const usedMargin = posList.reduce((s, p) => s + p.sizeEur, 0);
      const openFees = posList.reduce((s, p) => s + p.feePerSide, 0);
      const freeMargin = cfg.capital + statsRef.current.realizedPnl - openFees - usedMargin;

      if (freeMargin < cfg.sizeEur + cfg.feeEur) {
        if (manual) pushToast("Margine insufficiente", `Disponibile ${formatEur(freeMargin)}.`, "dn");
        return;
      }

      const { leverage, notional, costPct } = getCostSpecs(asset, cfg);
      const entryPrice = side === "L" ? quote.ask : quote.bid;
      const minTargetRoi = Math.max(10, cfg.minTargetRoiPct || 10);
      const minTpPricePct = minTargetRoi / Math.max(1, leverage) + costPct;
      const tpPct = Math.max(an?.tpPct || minTpPricePct, minTpPricePct);
      const slPct = an?.slPct ? Math.max(an.slPct, 0.6 * costPct) : Math.max(minTpPricePct / 1.5, 0.6 * costPct);

      // Mirror live order to OKX Copy Trading if connected & enabled
      let okxOrderId: string | undefined;
      if (
        asset.okxId &&
        okxCopyStatusRef.current.connected &&
        copySettingsRef.current.enabled
      ) {
        try {
          const tpTriggerPx =
            side === "L"
              ? (entryPrice * (1 + tpPct / 100)).toFixed(6)
              : (entryPrice * (1 - tpPct / 100)).toFixed(6);
          const slTriggerPx =
            side === "L"
              ? (entryPrice * (1 - slPct / 100)).toFixed(6)
              : (entryPrice * (1 + slPct / 100)).toFixed(6);

          const okxRes = await fetch("/api/okx/copytrading/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instId: asset.okxId,
              side: side === "L" ? "buy" : "sell",
              tdMode: copySettingsRef.current.marginMode,
              sz: copySettingsRef.current.orderSizeContracts || "1",
              lever: leverage,
              tpTriggerPx,
              slTriggerPx,
            }),
          });
          const okxJson = await okxRes.json();
          if (okxRes.ok && okxJson.ordId) {
            okxOrderId = okxJson.ordId;
            refreshOkxCopyStatus();
          } else {
            pushToast(
              "Avviso Copy Trading OKX",
              okxJson?.error || "Ordine locale aperto, replica OKX non eseguita.",
              "dn"
            );
          }
        } catch {
          pushToast("Errore rete OKX", "Ordine locale aperto, copia OKX non riuscita.", "dn");
        }
      }

      const gatesPassed = an ? an.gates.filter((g) => g.passed).length : 0;

      const newPos: OpenPosition = {
        pair: asset.pair,
        side,
        entryPrice,
        sizeEur: cfg.sizeEur,
        notionalEur: notional,
        leverage,
        feePerSide: cfg.feeEur,
        openedAt: Date.now(),
        tpPct,
        slPct: -slPct,
        breakEvenProtected: false,
        trailingActive: false,
        peakRoiPct: 0,
        costPct,
        reason,
        gatesPassed,
        aiConfidence: aiResult?.confidence,
        aiReasoning: aiResult?.reasoning,
        okxOrderId,
      };

      const nextPositions = { ...positionsRef.current, [asset.pair]: newPos };
      const nextStats = {
        ...statsRef.current,
        totalFees: statsRef.current.totalFees + cfg.feeEur,
      };
      positionsRef.current = nextPositions;
      statsRef.current = nextStats;
      setPositions(nextPositions);
      setStats(nextStats);

      const estRoi = Math.max(minTargetRoi, (tpPct - costPct) * leverage);
      notifyEvent(
        `${side === "L" ? "LONG" : "SHORT"} ${asset.name}${okxOrderId ? " [OKX LIVE]" : ""}`,
        `Ingresso ${formatPrice(entryPrice)} · Target min +${estRoi.toFixed(1)}% ROI · ${
          aiResult ? `IA ${aiResult.confidence}%` : "Manuale"
        }`,
        side === "L" ? "up" : "dn"
      );

      appendAuditLog({
        id: `${Date.now()}-${asset.pair}`,
        ts: Date.now(),
        pair: asset.pair,
        name: asset.name,
        direction: side,
        score: an?.score || 0,
        tpRoiPct: estRoi,
        gatesPassed,
        aiApproved: Boolean(aiResult?.approved),
        aiConfidence: aiResult?.confidence || 0,
        aiReasoning: aiResult?.reasoning || reason,
        action: okxOrderId ? "COPIATA SU OKX" : "APERTA",
        okxOrderId,
      });
    },
    [appendAuditLog, notifyEvent, pushToast, refreshOkxCopyStatus]
  );

  const closePosition = useCallback(
    async (asset: MarketAsset, quote: LiveQuote, reason: string) => {
      const currPos = positionsRef.current;
      const pos = currPos[asset.pair];
      if (!pos) return;

      const exitPrice = pos.side === "L" ? quote.bid : quote.ask;
      const gainPct =
        pos.side === "L"
          ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;
      const netEur = (pos.notionalEur * gainPct) / 100 - 2 * pos.feePerSide;

      const nextPositions = { ...currPos };
      delete nextPositions[asset.pair];

      const nextStats: AccountStats = {
        totalTrades: statsRef.current.totalTrades + 1,
        wins: statsRef.current.wins + (netEur > 0 ? 1 : 0),
        losses: statsRef.current.losses + (netEur <= 0 ? 1 : 0),
        realizedPnl: statsRef.current.realizedPnl + netEur,
        totalFees: statsRef.current.totalFees + pos.feePerSide,
      };

      const closedItem: ClosedTrade = {
        id: `${Date.now()}-${asset.pair}`,
        pair: asset.pair,
        name: asset.name,
        side: pos.side,
        sizeEur: pos.sizeEur,
        leverage: pos.leverage,
        entryPrice: pos.entryPrice,
        exitPrice,
        netEur,
        peakRoiPct: pos.peakRoiPct,
        reason,
        openedAt: pos.openedAt,
        closedAt: Date.now(),
        aiConfidence: pos.aiConfidence,
        okxOrderId: pos.okxOrderId,
      };

      const nextTrades = [closedItem, ...tradesRef.current].slice(0, 300);

      positionsRef.current = nextPositions;
      statsRef.current = nextStats;
      tradesRef.current = nextTrades;
      setPositions(nextPositions);
      setStats(nextStats);
      setTrades(nextTrades);

      const rt = ensureRuntime(asset.pair);
      rt.cooldownUntil = Date.now() + (netEur < 0 ? 240000 : 90000);

      // Close live on OKX if mirrored
      if (pos.okxOrderId && asset.okxId && okxCopyStatusRef.current.connected) {
        fetch("/api/okx/copytrading/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instId: asset.okxId,
            mgnMode: copySettingsRef.current.marginMode,
          }),
        })
          .then(() => refreshOkxCopyStatus())
          .catch(() => {});
      }

      notifyEvent(
        `CHIUSA ${formatSignedEur(netEur)} ${asset.name}`,
        `${reason} · ${formatPrice(pos.entryPrice)} → ${formatPrice(exitPrice)}`,
        netEur >= 0 ? "up" : "dn"
      );
    },
    [notifyEvent, refreshOkxCopyStatus]
  );

  // Server-side Gemini AI Trade Gate Request
  const validateCandidateWithAi = useCallback(
    async (
      asset: MarketAsset,
      quote: LiveQuote,
      an: TechnicalAnalysis,
      manualRequest: boolean,
      forcedSide?: "L" | "S"
    ) => {
      const rt = ensureRuntime(asset.pair);
      if (rt.aiInFlight) return;
      rt.aiInFlight = true;
      rt.lastAiCheckTs = Date.now();
      setAiBusyPair(asset.pair);

      const direction = forcedSide || an.direction;

      try {
        const res = await fetch("/api/ai/validate-trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pair: asset.pair,
            name: asset.name,
            direction,
            currentPrice: quote.mid,
            spreadPct: an.spreadPct,
            score: an.score,
            fibDepth: an.fibDepth,
            tpPct: an.tpPct,
            slPct: an.slPct,
            tpRoiPct: an.tpRoiPct,
            rrNet: an.rrNet,
            confirmations: an.confirmations,
            rsi14: an.rsi14,
            e20: an.e20,
            e60: an.e60,
            macdHist: an.macdHist,
            supertrendDir: an.supertrendDir,
            trend5m: an.trend5m,
            atrPct: an.atrPct,
            recentCloses: rt.closes.slice(-20),
            gates: an.gates,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        const aiResult: AiValidationResult = {
          approved: Boolean(json.approved),
          confidence: Number(json.confidence || 0),
          recommendedSide: json.recommendedSide || "HOLD",
          reasoning: String(json.reasoning || ""),
          keyFactors: Array.isArray(json.keyFactors) ? json.keyFactors : [],
          checkedAt: Date.now(),
        };

        rt.lastAiResult = aiResult;
        setAiSnapshots((prev) => ({ ...prev, [asset.pair]: aiResult }));

        const sideMatches =
          aiResult.approved &&
          aiResult.confidence >= 60 &&
          (aiResult.recommendedSide === direction || aiResult.recommendedSide === "HOLD"
            ? aiResult.recommendedSide === direction
            : false);

        if (sideMatches) {
          await openPosition(
            asset,
            quote,
            direction,
            an,
            `3/3 Controlli + IA Gemini (${aiResult.confidence}%)`,
            manualRequest,
            aiResult
          );
        } else {
          rt.cooldownUntil = Date.now() + 60000;
          if (manualRequest) {
            pushToast(
              `IA ha rifiutato ${asset.name}`,
              aiResult.reasoning || "Condizioni non ottimali per target +10%.",
              "dn"
            );
          }
          appendAuditLog({
            id: `${Date.now()}-${asset.pair}`,
            ts: Date.now(),
            pair: asset.pair,
            name: asset.name,
            direction,
            score: an.score,
            tpRoiPct: an.tpRoiPct,
            gatesPassed: an.gates.filter((g) => g.passed).length,
            aiApproved: false,
            aiConfidence: aiResult.confidence,
            aiReasoning: aiResult.reasoning,
            action: "RIFIUTATA IA",
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Errore chiamata IA";
        const errResult: AiValidationResult = {
          approved: false,
          confidence: 0,
          recommendedSide: "HOLD",
          reasoning: errMsg,
          keyFactors: [],
          checkedAt: Date.now(),
          error: errMsg,
        };
        rt.lastAiResult = errResult;
        setAiSnapshots((prev) => ({ ...prev, [asset.pair]: errResult }));
        if (manualRequest) {
          pushToast("Verifica IA non riuscita", errMsg, "dn");
        }
        appendAuditLog({
          id: `${Date.now()}-${asset.pair}`,
          ts: Date.now(),
          pair: asset.pair,
          name: asset.name,
          direction,
          score: an.score,
          tpRoiPct: an.tpRoiPct,
          gatesPassed: an.gates.filter((g) => g.passed).length,
          aiApproved: false,
          aiConfidence: 0,
          aiReasoning: errMsg,
          action: "ERRORE IA",
        });
      } finally {
        rt.aiInFlight = false;
        setAiBusyPair((curr) => (curr === asset.pair ? null : curr));
      }
    },
    [appendAuditLog, openPosition, pushToast]
  );

  // Core 1-Second Live Engine + 3-Stage Profit Maximization Trailing Loop
  useEffect(() => {
    const runTick = () => {
      const now = Date.now();
      const cfg = configRef.current;
      const currPositions = { ...positionsRef.current };
      let positionsChanged = false;

      const openFees = Object.values(currPositions).reduce((s, p) => s + p.feePerSide, 0);
      const halt = cfg.capital + statsRef.current.realizedPnl - openFees <= cfg.capital * 0.95;

      const nextAnalyses: Record<string, TechnicalAnalysis> = {};
      const candidates: { asset: MarketAsset; quote: LiveQuote; analysis: TechnicalAnalysis }[] = [];

      for (const asset of marketsRef.current) {
        const quote = quotesRef.current[asset.pair];
        if (!quote || now - quote.ts > 180000) continue;

        const closed =
          asset.group !== "c" &&
          quote.marketState !== "REGULAR" &&
          quote.marketState !== "OPEN";

        const rt = ensureRuntime(asset.pair);
        if (rt.closes.length === 0) {
          rt.closes.push(quote.mid);
          rt.bars.push({
            ts: now,
            open: quote.mid,
            high: quote.mid,
            low: quote.mid,
            close: quote.mid,
          });
          rt.barStartTs = now;
        } else if (now - rt.barStartTs >= 60000) {
          rt.closes.push(quote.mid);
          rt.bars.push({
            ts: now,
            open: quote.mid,
            high: quote.mid,
            low: quote.mid,
            close: quote.mid,
          });
          if (rt.closes.length > 400) rt.closes.shift();
          if (rt.bars.length > 400) rt.bars.shift();
          rt.barStartTs = now;
        } else {
          rt.closes[rt.closes.length - 1] = quote.mid;
          const lastBar = rt.bars[rt.bars.length - 1];
          if (lastBar) {
            lastBar.close = quote.mid;
            if (quote.mid > lastBar.high) lastBar.high = quote.mid;
            if (quote.mid < lastBar.low) lastBar.low = quote.mid;
          }
        }

        const analysis = analyzeMarket(
          asset,
          rt.closes,
          cfg,
          quote,
          rt.bars,
          rt.closes5m
        );
        nextAnalyses[asset.pair] = analysis;

        const openPos = currPositions[asset.pair];
        if (openPos) {
          const exitPx = openPos.side === "L" ? quote.bid : quote.ask;
          const gainPct =
            openPos.side === "L"
              ? ((exitPx - openPos.entryPrice) / openPos.entryPrice) * 100
              : ((openPos.entryPrice - exitPx) / openPos.entryPrice) * 100;

          const netEur = (openPos.notionalEur * gainPct) / 100 - 2 * openPos.feePerSide;
          const netRoiPct = (netEur / openPos.sizeEur) * 100;
          const minProfitFloorRoi = Math.max(10, cfg.minTargetRoiPct || 10);

          let updatedPos = { ...openPos };
          if (netRoiPct > updatedPos.peakRoiPct) {
            updatedPos.peakRoiPct = netRoiPct;
            positionsChanged = true;
          }

          // Stage 1: Break-Even protection at +5% net ROI
          if (!updatedPos.breakEvenProtected && netRoiPct >= 5) {
            updatedPos.breakEvenProtected = true;
            updatedPos.slPct = Math.max(updatedPos.slPct, updatedPos.costPct);
            positionsChanged = true;
          }

          // Stage 2 & 3: Lock +10% minimum ROI & Trail Peak Profit to maximize upside
          if (cfg.enableTrailingProfit && netRoiPct >= minProfitFloorRoi) {
            updatedPos.trailingActive = true;
            const lockedRoi = Math.max(minProfitFloorRoi, updatedPos.peakRoiPct * 0.78);
            const lockedPriceMovePct = lockedRoi / Math.max(1, updatedPos.leverage) + updatedPos.costPct;
            if (lockedPriceMovePct > updatedPos.slPct) {
              updatedPos.slPct = lockedPriceMovePct;
              positionsChanged = true;
            }
          }

          currPositions[asset.pair] = updatedPos;

          let closeReason: string | null = null;
          // If trailing profit is enabled, let profit run past tpPct via trailing stop unless max time hit
          if (!cfg.enableTrailingProfit && gainPct >= updatedPos.tpPct) {
            closeReason = "Obiettivo raggiunto";
          } else if (gainPct <= updatedPos.slPct) {
            closeReason = updatedPos.trailingActive
              ? `Trailing Max Profit (+${updatedPos.peakRoiPct.toFixed(1)}% picco)`
              : updatedPos.breakEvenProtected
              ? "Profitto protetto (Break-even)"
              : "Stop loss";
          } else if ((now - updatedPos.openedAt) / 1000 >= cfg.maxHoldSec) {
            closeReason = "Tempo massimo";
          }

          if (closeReason) {
            closePosition(asset, quote, closeReason);
          }
        } else if (
          autoRef.current &&
          loadedRef.current &&
          !halt &&
          !closed &&
          analysis.allGatesPassed &&
          now > rt.cooldownUntil
        ) {
          candidates.push({ asset, quote, analysis });
        }
      }

      if (positionsChanged) {
        const merged = { ...positionsRef.current };
        for (const [k, v] of Object.entries(currPositions)) {
          if (merged[k]) merged[k] = v;
        }
        positionsRef.current = merged;
        setPositions(merged);
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.analysis.score - a.analysis.score);
        const openCount = Object.keys(positionsRef.current).length;
        if (openCount < cfg.maxOpen) {
          const top = candidates[0];
          const rt = ensureRuntime(top.asset.pair);
          if (cfg.requireAiApproval) {
            // Throttle AI calls to max 1 per 45s per symbol
            if (!rt.aiInFlight && now - rt.lastAiCheckTs > 45000) {
              validateCandidateWithAi(top.asset, top.quote, top.analysis, false);
            }
          } else {
            openPosition(
              top.asset,
              top.quote,
              top.analysis.direction,
              top.analysis,
              `3/3 Controlli · Score ${top.analysis.score}`,
              false
            );
          }
        }
      }

      // Evaluate live configurable price alerts
      if (priceAlertsRef.current.length > 0) {
        const triggeredNow: PriceAlert[] = [];
        const nextAlerts = priceAlertsRef.current.map((al) => {
          if (!al.enabled || al.triggeredAt) return al;
          const q = quotesRef.current[al.pair];
          if (!q || now - q.ts > 180000) return al;
          const hit =
            al.condition === "above"
              ? q.mid >= al.targetPrice
              : q.mid <= al.targetPrice;
          if (!hit) return al;
          const updated: PriceAlert = {
            ...al,
            enabled: false,
            triggeredAt: now,
            triggeredPrice: q.mid,
          };
          triggeredNow.push(updated);
          return updated;
        });

        if (triggeredNow.length > 0) {
          priceAlertsRef.current = nextAlerts;
          setPriceAlerts(nextAlerts);

          const repeatIds = triggeredNow
            .filter((t) => t.repeatUntilDismissed)
            .map((t) => t.id);
          if (repeatIds.length > 0) {
            setRingingAlertIds((prev) => Array.from(new Set([...prev, ...repeatIds])));
          }

          const first = triggeredNow[0];
          if (!soundSettingsRef.current.muted) {
            void playAlarmSound(first.soundPreset, soundSettingsRef.current.volume);
          }

          for (const item of triggeredNow) {
            notifyEvent(
              `Allarme ${item.assetName} ${item.condition === "above" ? "≥" : "≤"} ${formatPrice(item.targetPrice)}`,
              `Prezzo attuale ${formatPrice(item.triggeredPrice || item.targetPrice)}${
                item.note ? ` · ${item.note}` : ""
              }`,
              item.condition === "above" ? "up" : "dn"
            );
          }
        }
      }

      setQuotes({ ...quotesRef.current });
      setAnalyses(nextAnalyses);
      setTickNow(now);
    };

    const intervalId = window.setInterval(runTick, 1000);
    return () => window.clearInterval(intervalId);
  }, [closePosition, notifyEvent, openPosition, validateCandidateWithAi]);

  // Repeat sound alarm loop every 6s until silenced when repeatUntilDismissed is enabled
  useEffect(() => {
    if (ringingAlertIds.length === 0 || soundSettings.muted) return;
    const timer = window.setInterval(() => {
      const latestId = ringingAlertIdsRef.current[ringingAlertIdsRef.current.length - 1];
      const al = priceAlertsRef.current.find((a) => a.id === latestId);
      if (al) {
        void playAlarmSound(al.soundPreset, soundSettingsRef.current.volume);
      }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [ringingAlertIds.length, soundSettings.muted]);

  const accountSummary = useMemo(() => {
    const posValues = Object.values(positions);
    const usedMargin = posValues.reduce((s, p) => s + p.sizeEur, 0);
    const openFees = posValues.reduce((s, p) => s + p.feePerSide, 0);
    let unrealizedNet = 0;

    for (const p of posValues) {
      const q = quotes[p.pair];
      if (!q) continue;
      const exitPx = p.side === "L" ? q.bid : q.ask;
      const g =
        p.side === "L"
          ? ((exitPx - p.entryPrice) / p.entryPrice) * 100
          : ((p.entryPrice - exitPx) / p.entryPrice) * 100;
      unrealizedNet += (p.notionalEur * g) / 100 - p.feePerSide;
    }

    const equity = config.capital + stats.realizedPnl + unrealizedNet;
    const totalPnl = equity - config.capital;
    const totalPnlPct = config.capital > 0 ? (totalPnl / config.capital) * 100 : 0;
    const freeMargin = config.capital + stats.realizedPnl - openFees - usedMargin;
    const winRate =
      stats.totalTrades > 0 ? Math.round((stats.wins / stats.totalTrades) * 100) : null;
    const halted = config.capital + stats.realizedPnl - openFees <= config.capital * 0.95;

    const liveCount = markets.filter((m) => {
      const q = quotes[m.pair];
      return q && tickNow - q.ts <= 180000;
    }).length;

    return {
      equity,
      totalPnl,
      totalPnlPct,
      freeMargin,
      usedMargin,
      openCount: posValues.length,
      winRate,
      halted,
      liveCount,
    };
  }, [positions, quotes, config.capital, stats, markets, tickNow]);

  const selectedAsset = useMemo(
    () => markets.find((m) => m.pair === selectedPair) || markets[0],
    [markets, selectedPair]
  );
  const selectedQuote = quotes[selectedAsset.pair];
  const selectedAnalysis = analyses[selectedAsset.pair];
  const selectedPosition = positions[selectedAsset.pair] || null;
  const selectedRuntime = runtimeRef.current[selectedAsset.pair];
  const selectedAi = aiSnapshots[selectedAsset.pair] || selectedRuntime?.lastAiResult;
  const selectedCostSpecs = getCostSpecs(selectedAsset, config);

  const selectedClosed =
    selectedAsset.group !== "c" &&
    selectedQuote &&
    selectedQuote.marketState !== "REGULAR" &&
    selectedQuote.marketState !== "OPEN";

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    return markets.filter((m) => {
      if (categoryFilter === "c" && m.group !== "c") return false;
      if (categoryFilter === "im" && m.group === "c") return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.pair.toLowerCase().includes(q) ||
        (m.okxId && m.okxId.toLowerCase().includes(q))
      );
    });
  }, [markets, categoryFilter, marketSearch]);

  const handleToggleOkxAsset = useCallback(
    (asset: MarketAsset) => {
      setMarkets((prev) => {
        const exists = prev.some((m) => m.okxId && m.okxId === asset.okxId);
        if (exists) {
          if (positionsRef.current[asset.pair]) {
            pushToast("Impossibile rimuovere", `Chiudi prima la posizione aperta su ${asset.name}.`, "dn");
            return prev;
          }
          const next = prev.filter((m) => m.okxId !== asset.okxId);
          if (selectedPair === asset.pair && next[0]) setSelectedPair(next[0].pair);
          return next;
        } else {
          const next = [asset, ...prev];
          seedOkxAsset(asset);
          setSelectedPair(asset.pair);
          pushToast("Valuta OKX aggiunta", `${asset.okxId} collegata al feed live.`, "up");
          return next;
        }
      });
    },
    [pushToast, seedOkxAsset, selectedPair]
  );

  const handleManualAction = (side: "L" | "S") => {
    if (!selectedQuote || !selectedAnalysis) return;
    if (config.requireAiApproval) {
      validateCandidateWithAi(selectedAsset, selectedQuote, selectedAnalysis, true, side);
    } else {
      openPosition(
        selectedAsset,
        selectedQuote,
        side,
        selectedAnalysis,
        `Apertura manuale ${side === "L" ? "LONG" : "SHORT"}`,
        true
      );
    }
  };

  const handleTogglePush = async () => {
    if (!("Notification" in window)) {
      pushToast("Non supportato", "Notifiche browser non disponibili.", "dn");
      return;
    }
    if (pushEnabled) {
      setPushEnabled(false);
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setPushEnabled(true);
        notifyEvent("Notifiche attive", "Riceverai un avviso a ogni apertura e chiusura.", "up");
      } else {
        pushToast("Permesso negato", "Abilita le notifiche nelle impostazioni del browser.", "dn");
      }
    } catch {
      pushToast("Errore permessi", "Impossibile attivare le notifiche browser.", "dn");
    }
  };

  const handleExportBackup = () => {
    saveState();
    const content = localStorage.getItem(STORAGE_KEY) || "{}";
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scalper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = String(ev.target?.result || "");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const stamped = { ...parsed, updatedAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
        await Promise.allSettled([
          saveToIndexedDb(stamped as unknown as PersistedAppState),
          saveToServer(stamped as unknown as PersistedAppState),
        ]);
        window.location.reload();
      } catch {
        pushToast("Backup non valido", "Il file JSON selezionato non è leggibile.", "dn");
      }
    };
    reader.readAsText(file);
  };

  const handleResetAccount = () => {
    const freshStats: AccountStats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      realizedPnl: 0,
      totalFees: 0,
    };
    positionsRef.current = {};
    statsRef.current = freshStats;
    tradesRef.current = [];
    auditLogsRef.current = [];
    setPositions({});
    setStats(freshStats);
    setTrades([]);
    setAuditLogs([]);
    for (const rt of Object.values(runtimeRef.current)) {
      rt.cooldownUntil = 0;
    }
    const emptySnapshot = buildPersistedSnapshot();
    saveToLocalStorage(emptySnapshot);
    saveToIndexedDb(emptySnapshot);
    saveToServer(emptySnapshot);
    setLastSavedAt(emptySnapshot.updatedAt);
    pushToast("Conto azzerato", "Storico e posizioni ripristinati al capitale iniziale.", "neutral");
  };

  const openPositionsList = useMemo(() => Object.values(positions), [positions]);

  const computeTerminalWinProb = useCallback(
    (pos: OpenPosition, exitPx: number) => {
      const baseProb = analyses[pos.pair]?.winProbabilityPct ?? 62;
      const g =
        pos.entryPrice > 0
          ? pos.side === "L"
            ? ((exitPx - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - exitPx) / pos.entryPrice) * 100
          : 0;
      const tpDist = Math.max(0.25, Math.abs(pos.tpPct));
      const slDist = Math.max(0.25, Math.abs(pos.slPct));
      const progressShift =
        g >= 0
          ? Math.min(1, g / tpDist) * 24
          : -Math.min(1, Math.abs(g) / slDist) * 30;
      const protectionBonus = pos.trailingActive ? 10 : pos.breakEvenProtected ? 6 : 0;
      return Math.round(Math.max(14, Math.min(96, baseProb + progressShift + protectionBonus)));
    },
    [analyses]
  );

  const portfolioLedger = useMemo(() => {
    let probSum = 0;
    let floatingGainEur = 0;
    let floatingLossEur = 0;

    for (const pos of openPositionsList) {
      const q = quotes[pos.pair];
      const exitPx = q ? (pos.side === "L" ? q.bid : q.ask) : pos.entryPrice;
      const g =
        pos.entryPrice > 0
          ? pos.side === "L"
            ? ((exitPx - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - exitPx) / pos.entryPrice) * 100
          : 0;
      const netEur = (pos.notionalEur * g) / 100 - 2 * pos.feePerSide;
      if (netEur >= 0) floatingGainEur += netEur;
      else floatingLossEur += Math.abs(netEur);
      probSum += computeTerminalWinProb(pos, exitPx);
    }

    let grossProfitEur = 0;
    let grossLossEur = 0;
    for (const t of trades) {
      if (t.netEur >= 0) grossProfitEur += t.netEur;
      else grossLossEur += Math.abs(t.netEur);
    }
    if (trades.length === 0) {
      if (stats.realizedPnl > 0) grossProfitEur = stats.realizedPnl;
      if (stats.realizedPnl < 0) grossLossEur = Math.abs(stats.realizedPnl);
    }

    const totalClosed = stats.wins + stats.losses;
    const winRatePct = totalClosed > 0 ? Math.round((stats.wins / totalClosed) * 100) : null;
    const lossRatePct = totalClosed > 0 ? Math.round((stats.losses / totalClosed) * 100) : null;
    const avgWinProbPct =
      openPositionsList.length > 0 ? Math.round(probSum / openPositionsList.length) : null;

    return {
      openCount: openPositionsList.length,
      avgWinProbPct,
      wins: stats.wins,
      losses: stats.losses,
      winRatePct,
      lossRatePct,
      grossProfitEur,
      grossLossEur,
      floatingGainEur,
      floatingLossEur,
    };
  }, [openPositionsList, quotes, trades, stats, computeTerminalWinProb]);

  const activePreset = useMemo(
    () => BACKDROP_PRESETS.find((p) => p.id === backdrop.preset),
    [backdrop.preset]
  );

  const activeBackdropImageUrl = useMemo(() => {
    if (backdrop.preset === "custom") {
      return backdrop.customUrl.trim() || null;
    }
    return activePreset?.imagePath || null;
  }, [backdrop.preset, backdrop.customUrl, activePreset]);

  const selectedAssetAlerts = useMemo(
    () => priceAlerts.filter((a) => a.pair === selectedAsset.pair),
    [priceAlerts, selectedAsset.pair]
  );

  const activeAlertsCount = useMemo(
    () => priceAlerts.filter((a) => a.enabled && !a.triggeredAt).length,
    [priceAlerts]
  );

  const ringingAlerts = useMemo(
    () => priceAlerts.filter((a) => ringingAlertIds.includes(a.id)),
    [priceAlerts, ringingAlertIds]
  );

  const handleAddPriceAlert = useCallback(
    (draft: Omit<PriceAlert, "id" | "createdAt">) => {
      const next: PriceAlert = {
        ...draft,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
      };
      setPriceAlerts((prev) => [next, ...prev]);
      pushToast(
        `Allarme attivo su ${draft.assetName}`,
        `Suonerà quando il prezzo ${draft.condition === "above" ? "≥" : "≤"} ${formatPrice(draft.targetPrice)}`,
        "up"
      );
    },
    [pushToast]
  );

  const handleTogglePriceAlert = useCallback((id: string) => {
    void unlockAudioContext();
    setRingingAlertIds((prev) => prev.filter((r) => r !== id));
    setPriceAlerts((prev) =>
      prev.map((al) =>
        al.id === id
          ? {
              ...al,
              enabled: !al.enabled,
              triggeredAt: !al.enabled ? undefined : al.triggeredAt,
              triggeredPrice: !al.enabled ? undefined : al.triggeredPrice,
            }
          : al
      )
    );
  }, []);

  const handleRearmPriceAlert = useCallback((id: string) => {
    void unlockAudioContext();
    setRingingAlertIds((prev) => prev.filter((r) => r !== id));
    setPriceAlerts((prev) =>
      prev.map((al) =>
        al.id === id
          ? {
              ...al,
              enabled: true,
              triggeredAt: undefined,
              triggeredPrice: undefined,
            }
          : al
      )
    );
  }, []);

  const handleDeletePriceAlert = useCallback((id: string) => {
    setRingingAlertIds((prev) => prev.filter((r) => r !== id));
    setPriceAlerts((prev) => prev.filter((al) => al.id !== id));
  }, []);

  const handleSilenceAllAlerts = useCallback(() => {
    setRingingAlertIds([]);
  }, []);

  const fetchCryptoOpportunities = useCallback(async (force = false) => {
    if (!force && typeof document !== "undefined" && document.hidden) return;
    setCryptoScanLoading(true);
    setCryptoScanError(null);
    try {
      const res = await fetch(
        `/api/crypto/opportunities${force ? "?refresh=1" : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      if (json?.globalContext) {
        setCryptoGlobalContext(json.globalContext as GlobalCryptoSentiment);
      }
      if (Array.isArray(json?.opportunities)) {
        setCryptoOpportunities(json.opportunities as CryptoOpportunityRow[]);
      }
    } catch (err) {
      setCryptoScanError(
        err instanceof Error ? err.message : "Errore scansione crypto"
      );
    } finally {
      setCryptoScanLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCryptoOpportunities(false);
    const id = window.setInterval(() => {
      void fetchCryptoOpportunities(false);
    }, 45000);
    return () => window.clearInterval(id);
  }, [fetchCryptoOpportunities]);

  // Firebase Auth listener for Cloud Firestore + Gmail OAuth
  useEffect(() => {
    const unsub = subscribeFirebaseAuth((user, gmailOk) => {
      setFirebaseUser(user);
      setHasGmailToken(gmailOk);
    });
    return () => unsub();
  }, []);

  // Pre-Breakout Memecoin & Crypto Signals Polling (visibility-aware, 45s)
  const fetchPreBreakoutSignals = useCallback(async (force = false) => {
    if (!force && typeof document !== "undefined" && document.hidden) return;
    setPreBreakoutLoading(true);
    try {
      const res = await fetch(
        `/api/crypto/prebreakout${force ? "?refresh=1" : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (res.ok && Array.isArray(json?.signals)) {
        setPreBreakoutSignals(json.signals as PreBreakoutSignal[]);
      }
    } catch {
      // keep previous signals if transient error
    } finally {
      setPreBreakoutLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPreBreakoutSignals(false);
    const id = window.setInterval(() => {
      void fetchPreBreakoutSignals(false);
    }, 45000);
    return () => window.clearInterval(id);
  }, [fetchPreBreakoutSignals]);

  // 3 Autonomous H24 Bots State Polling (adaptive: 3s when active on Bots tab, 10s otherwise, pauses when hidden)
  const fetchBotState = useCallback(async (force = false) => {
    if (!force && typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/bots/state", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json?.state) {
        setBotState(json.state as BotEngineState);
      }
    } catch {
      // ignore transient poll hiccup
    } finally {
      setBotsLoading(false);
    }
  }, []);

  useEffect(() => {
    setBotsLoading(true);
    void fetchBotState(true);
    const intervalMs = workspaceView === "bots" ? 2000 : 10000;
    const id = window.setInterval(() => {
      void fetchBotState(false);
    }, intervalMs);

    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void fetchBotState(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchBotState, workspaceView]);

  // Hydrate Cloud Firestore metadata once on sign-in (single read per session)
  useEffect(() => {
    if (!firebaseUser) {
      cloudSyncMetaRef.current = { fingerprint: "", lastWriteAt: 0, lastEquity: 0 };
      return;
    }
    let cancelled = false;
    void loadCloudTerminalSummary(firebaseUser.uid)
      .then((cloudSummary) => {
        if (!cancelled && cloudSummary) {
          setLastCloudSyncAt(Date.now());
        }
      })
      .catch(() => {
        // non-blocking initial read
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  // Optimized Cloud Firestore Sync: parallel batch + diff fingerprint + 30s cooldown
  const runCloudSync = useCallback(
    async (force = false) => {
      if (!firebaseUser || !firebaseUser.emailVerified || !botState) return;
      if (cloudSyncInFlightRef.current && !force) return;
      if (!force && typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!force && typeof document !== "undefined" && document.hidden) return;

      const cur = botState.currentCycle;
      const cyclePosSig = cur
        ? cur.positions.map((p) => `${p.botIndex}:${p.instId}:${p.direction}:${p.reversalsCount || 0}:${p.status}`).join("|")
        : "";
      const fingerprint = [
        firebaseUser.uid,
        selectedAsset.pair,
        botState.active ? "1" : "0",
        botState.vaultEur.toFixed(2),
        botState.history.length,
        stats.realizedPnl.toFixed(2),
        cur?.cycleId || "",
        cur?.status || "",
        cur?.recentSlotEvents?.length || 0,
        cyclePosSig,
      ].join("::");

      const now = Date.now();
      const meta = cloudSyncMetaRef.current;
      const elapsed = now - meta.lastWriteAt;
      const equityDelta = Math.abs(accountSummary.equity - meta.lastEquity);
      const structuralChanged = fingerprint !== meta.fingerprint;
      const periodicEquityChanged = elapsed >= 30000 && equityDelta >= 2.0;

      if (!force && !structuralChanged && !periodicEquityChanged) {
        return;
      }

      const cyclesToSync = [];
      const seenIds = new Set<string>();
      if (cur && !syncedCyclesRef.current.has(cur.cycleId)) {
        cyclesToSync.push(cur);
        seenIds.add(cur.cycleId);
      }
      for (const h of botState.history.slice(0, 3)) {
        if (!syncedCyclesRef.current.has(h.cycleId) && !seenIds.has(h.cycleId)) {
          cyclesToSync.push(h);
          seenIds.add(h.cycleId);
        }
      }

      cloudSyncInFlightRef.current = true;
      if (force) setCloudSyncing(true);
      try {
        await syncAllToCloud(
          firebaseUser.uid,
          {
            selectedPair: selectedAsset.pair,
            equityEur: accountSummary.equity,
            realizedPnlEur: stats.realizedPnl,
            botState,
          },
          cyclesToSync
        );
        for (const h of cyclesToSync) {
          if (h.status === "completed") {
            syncedCyclesRef.current.add(h.cycleId);
          }
        }
        cloudSyncMetaRef.current = {
          fingerprint,
          lastWriteAt: Date.now(),
          lastEquity: accountSummary.equity,
        };
        setLastCloudSyncAt(Date.now());
        if (force) {
          pushToast("Cloud Sincronizzato", "Stato terminale e cicli Bot salvati su Firestore.", "up");
        }
      } catch (err) {
        if (force) {
          pushToast(
            "Errore Sync Cloud",
            err instanceof Error ? err.message : "Impossibile sincronizzare su Firestore.",
            "dn"
          );
        }
      } finally {
        cloudSyncInFlightRef.current = false;
        if (force) setCloudSyncing(false);
      }
    },
    [firebaseUser, botState, selectedAsset.pair, accountSummary.equity, stats.realizedPnl, pushToast]
  );

  useEffect(() => {
    if (!firebaseUser || !botState) return;
    const timer = window.setTimeout(() => {
      void runCloudSync(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [firebaseUser, botState, selectedAsset.pair, accountSummary.equity, stats.realizedPnl, runCloudSync]);

  const handleConnectCloudOrSync = useCallback(async () => {
    if (firebaseUser) {
      await runCloudSync(true);
      return;
    }
    try {
      setCloudSyncing(true);
      const { user, accessToken } = await signInWithGoogleForCloudAndGmail();
      setFirebaseUser(user);
      setHasGmailToken(Boolean(accessToken));
      pushToast(
        "Cloud & Gmail Attivi",
        `Connesso come ${user.email || "Google"}. Sync ottimizzata attiva.`,
        "up"
      );
    } catch (err) {
      pushToast(
        "Accesso Google annullato",
        err instanceof Error ? err.message : "Impossibile connettere l'account Google.",
        "dn"
      );
    } finally {
      setCloudSyncing(false);
    }
  }, [firebaseUser, runCloudSync, pushToast]);

  const handleUpdateBotConfig = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/bots/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (res.ok && json?.state) {
          setBotState(json.state as BotEngineState);
        }
      } catch (err) {
        pushToast(
          "Errore configurazione Bot",
          err instanceof Error ? err.message : "Impossibile aggiornare i Bot.",
          "dn"
        );
      }
    },
    [pushToast]
  );

  const handleForceNewBotCycle = useCallback(async () => {
    try {
      const res = await fetch("/api/bots/run-cycle", { method: "POST" });
      const json = await res.json();
      if (json?.state) {
        setBotState(json.state as BotEngineState);
      }
      if (!res.ok || !json?.ok) {
        pushToast(
          "Ciclo 3 Bot in attesa",
          json?.state?.lastError || "Verifica chiave Gemini / connessione OKX.",
          "dn"
        );
      } else {
        pushToast(
          "Nuovo Ciclo 3 Bot Avviato",
          "3 posizioni selezionate dall'IA (durata max 2 minuti).",
          "up"
        );
      }
    } catch (err) {
      pushToast(
        "Errore avvio Bot",
        err instanceof Error ? err.message : "Impossibile avviare ciclo.",
        "dn"
      );
    }
  }, [pushToast]);

  const handleResetBots = useCallback(async () => {
    try {
      const res = await fetch("/api/bots/reset", { method: "POST" });
      const json = await res.json();
      if (res.ok && json?.state) {
        setBotState(json.state as BotEngineState);
        syncedCyclesRef.current.clear();
        pushToast("Bot H24 ripristinati", "Cassaforte e storico bot azzerati.", "neutral");
      }
    } catch {
      // ignore
    }
  }, [pushToast]);

  const handleCloseBotSlot = useCallback(
    async (botIndex: 1 | 2 | 3) => {
      try {
        const res = await fetch("/api/bots/close-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botIndex }),
        });
        const json = await res.json();
        if (json?.state) {
          setBotState(json.state as BotEngineState);
        }
        if (res.ok && json?.closedPosition) {
          const cp = json.closedPosition as BotPositionItem;
          pushToast(
            `BOT #${botIndex} chiuso (${cp.symbol})`,
            `Risultato netto: ${formatSignedEur(cp.livePnlEur)} · Apprendimento aggiornato.`,
            cp.livePnlEur >= 0 ? "up" : "dn"
          );
        } else {
          pushToast(
            "Chiusura non eseguita",
            json?.error || "Posizione già chiusa.",
            "neutral"
          );
        }
      } catch (err) {
        pushToast(
          "Errore chiusura posizione",
          err instanceof Error ? err.message : "Impossibile chiudere lo slot.",
          "dn"
        );
      }
    },
    [pushToast]
  );

  const liveFocusedTarget = useMemo<FocusedPositionTarget | null>(() => {
    if (!focusedPosition) return null;
    if (focusedPosition.kind === "bot") {
      const livePos = botState?.currentCycle?.positions.find(
        (p) => p.botIndex === focusedPosition.botIndex
      );
      if (livePos) {
        return { kind: "bot", botIndex: focusedPosition.botIndex, position: livePos };
      }
      return focusedPosition;
    }
    const latestPos = positions[focusedPosition.position.pair];
    if (!latestPos) return null;
    const asset = markets.find((m) => m.pair === latestPos.pair);
    const q = quotes[latestPos.pair];
    return {
      kind: "terminal",
      position: latestPos,
      assetName: asset?.name || latestPos.pair,
      instId: asset?.okxId,
      livePrice: q?.mid,
      bid: q?.bid,
      ask: q?.ask,
    };
  }, [focusedPosition, botState?.currentCycle?.positions, positions, markets, quotes]);

  const handleEmergencySellAll = useCallback(async () => {
    setQuickActionBusy("sell_all");
    try {
      setAutoTrading(false);

      // 1. Liquidate every open terminal position immediately
      const openList = Object.values(positionsRef.current);
      let closedTerminal = 0;
      for (const pos of openList) {
        const asset: MarketAsset =
          marketsRef.current.find((m) => m.pair === pos.pair) || {
            pair: pos.pair,
            name: pos.pair,
            group: "c",
          };
        const liveQ = quotesRef.current[pos.pair];
        const fallbackQuote: LiveQuote = liveQ || {
          bid: pos.entryPrice,
          ask: pos.entryPrice,
          mid: pos.entryPrice,
          ts: Date.now(),
          marketState: "REGULAR",
          source: "OKX REST",
        };
        await closePosition(asset, fallbackQuote, "Vendita d'Emergenza");
        closedTerminal += 1;
      }

      // 2. Liquidate all open 3-Bot AI positions and pause H24 auto-restart
      let closedBots = 0;
      try {
        const res = await fetch("/api/bots/emergency-close", { method: "POST" });
        const json = await res.json();
        if (json?.state) {
          setBotState(json.state as BotEngineState);
        }
        closedBots = Number(json?.closedCount || 0);
      } catch {
        // continue reporting terminal liquidation even if bot endpoint errored
      }

      const timeStr = new Date().toLocaleTimeString("it-IT");
      const summary = `Emergency Sell All (${closedTerminal} term · ${closedBots} bot) alle ${timeStr}`;
      setQuickActionNote(summary);
      notifyEvent(
        "Vendita d'Emergenza completata",
        `Chiuse ${closedTerminal} posizioni terminale e ${closedBots} bot. Auto-trading in pausa.`,
        "dn"
      );
    } finally {
      setQuickActionBusy(null);
    }
  }, [closePosition, notifyEvent]);

  const handleRebalancePortfolio = useCallback(async () => {
    setQuickActionBusy("rebalance");
    try {
      const targetSizeEur = Math.max(
        25,
        Math.min(500, Math.round((accountSummary.equity * 0.1) / 5) * 5)
      );

      // 1. Close losing or oversized terminal positions to restore balanced exposure
      const openList = Object.values(positionsRef.current);
      let trimmedTerminal = 0;
      for (const pos of openList) {
        const asset = marketsRef.current.find((m) => m.pair === pos.pair);
        const liveQ = quotesRef.current[pos.pair];
        if (!asset || !liveQ) continue;
        const exitPx = pos.side === "L" ? liveQ.bid : liveQ.ask;
        const gainPct =
          pos.side === "L"
            ? ((exitPx - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - exitPx) / pos.entryPrice) * 100;
        const liveNet = (pos.notionalEur * gainPct) / 100 - 2 * pos.feePerSide;
        const sizeDrift = Math.abs(pos.sizeEur - targetSizeEur) / Math.max(1, targetSizeEur);
        if (liveNet < 0 || sizeDrift > 0.2) {
          await closePosition(asset, liveQ, "Ribilanciamento Portafoglio");
          trimmedTerminal += 1;
        }
      }

      // 2. Recalibrate terminal trade size to 10% of equity
      setConfig((prev) => ({
        ...prev,
        sizeEur: targetSizeEur,
      }));

      // 3. Re-balance the 3 Autonomous AI Bots to equal-weight compounding on fresh picks
      let botRebalanced = false;
      let botErr: string | null = null;
      try {
        const res = await fetch("/api/bots/rebalance", { method: "POST" });
        const json = await res.json();
        if (json?.state) {
          setBotState(json.state as BotEngineState);
        }
        botRebalanced = Boolean(res.ok && json?.ok);
        if (!botRebalanced) {
          botErr = json?.state?.lastError || null;
        }
      } catch (err) {
        botErr = err instanceof Error ? err.message : "Errore ribilanciamento bot";
      }

      const timeStr = new Date().toLocaleTimeString("it-IT");
      setQuickActionNote(`Re-Balance (Size €${targetSizeEur}) alle ${timeStr}`);
      notifyEvent(
        "Portafoglio Ribilanciato",
        `Size terminale €${targetSizeEur}${
          trimmedTerminal > 0 ? ` · ${trimmedTerminal} posizioni riequilibrate` : ""
        } · ${
          botRebalanced
            ? "3 Bot riallineati in peso equo"
            : botErr || "Bot aggiornati in modalità Auto Composto"
        }.`,
        botRebalanced ? "up" : "neutral"
      );
    } finally {
      setQuickActionBusy(null);
    }
  }, [accountSummary.equity, closePosition, notifyEvent]);

  const focusTerminalPair = useCallback((pair: string) => {
    setSelectedPair(pair);
    setWorkspaceView("terminale");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleSelectPreBreakoutSignal = useCallback(
    (sig: PreBreakoutSignal) => {
      const existing = marketsRef.current.find((m) => m.okxId === sig.instId);
      if (existing) {
        focusTerminalPair(existing.pair);
        return;
      }
      const candidatePair = `${sig.baseSymbol}/USD`;
      const uniquePair = marketsRef.current.some((m) => m.pair === candidatePair)
        ? `${sig.baseSymbol}/USDT`
        : candidatePair;
      const newAsset: MarketAsset = {
        pair: uniquePair,
        name: sig.name,
        group: "c",
        okxId: sig.instId,
        custom: true,
      };
      setMarkets((prev) => [newAsset, ...prev]);
      pushQuote(uniquePair, sig.lastPrice * 0.9997, sig.lastPrice * 1.0003, "OKX REST");
      void seedOkxAsset(newAsset);
      focusTerminalPair(uniquePair);
    },
    [focusTerminalPair, pushQuote, seedOkxAsset]
  );

  const handleSelectBotAsset = useCallback(
    (pos: BotPositionItem) => {
      const existing = marketsRef.current.find((m) => m.okxId === pos.instId);
      if (existing) {
        focusTerminalPair(existing.pair);
        return;
      }
      const candidatePair = `${pos.symbol}/USD`;
      const uniquePair = marketsRef.current.some((m) => m.pair === candidatePair)
        ? `${pos.symbol}/USDT`
        : candidatePair;
      const group: MarketAsset["group"] =
        pos.sector === "metallo"
          ? "m"
          : pos.sector === "azione"
          ? "s"
          : pos.sector === "altro_mercato"
          ? "i"
          : "c";
      const newAsset: MarketAsset = {
        pair: uniquePair,
        name: pos.name,
        group,
        okxId: pos.instId,
        custom: true,
      };
      setMarkets((prev) => [newAsset, ...prev]);
      pushQuote(uniquePair, pos.currentPrice * 0.9997, pos.currentPrice * 1.0003, "OKX REST");
      void seedOkxAsset(newAsset);
      focusTerminalPair(uniquePair);
    },
    [focusTerminalPair, pushQuote, seedOkxAsset]
  );

  const handleSelectCryptoOpportunity = useCallback(
    (row: CryptoOpportunityRow) => {
      const existing = marketsRef.current.find((m) => m.okxId === row.instId);
      if (existing) {
        focusTerminalPair(existing.pair);
        return;
      }

      const candidatePair = `${row.baseSymbol}/USD`;
      const uniquePair = marketsRef.current.some((m) => m.pair === candidatePair)
        ? `${row.baseSymbol}/USDT`
        : candidatePair;

      const newAsset: MarketAsset = {
        pair: uniquePair,
        name: row.name,
        group: "c",
        okxId: row.instId,
        custom: true,
      };

      setMarkets((prev) => [newAsset, ...prev]);
      pushQuote(uniquePair, row.bidPx, row.askPx, "OKX REST", {
        open24h: row.open24h,
        high24h: row.high24h,
        low24h: row.low24h,
        vol24h: row.volUsd24h,
      });
      void seedOkxAsset(newAsset);
      focusTerminalPair(uniquePair);
      pushToast(
        `${row.name} collegata al terminale`,
        `${row.instId} (${row.trendLabel} · ${row.probabilityPct}%) aperta nel grafico live.`,
        row.direction === "L" ? "up" : "dn"
      );
    },
    [focusTerminalPair, pushQuote, pushToast, seedOkxAsset]
  );

  const selectedBadge = getAssetBadgeMeta(selectedAsset);
  const selectedChange24h =
    selectedQuote && selectedQuote.open24h && selectedQuote.open24h > 0
      ? ((selectedQuote.mid - selectedQuote.open24h) / selectedQuote.open24h) * 100
      : null;

  return (
    <div className="relative min-h-screen text-slate-900 dark:text-slate-100 overflow-x-hidden">
      {/* Fixed Customizable Backdrop (z-0 so it always paints above html/body canvas) */}
      <div
        className={`fixed inset-0 z-0 pointer-events-none select-none ${
          backdrop.preset === "etoro_clean"
            ? "bg-gradient-to-br from-[#DCE4EE] via-[#E4EBF3] to-[#D6E4E1] dark:from-[#09111B] dark:via-[#0D1724] dark:to-[#0A1E1B]"
            : backdrop.preset === "obsidian_slate"
            ? "bg-gradient-to-br from-[#1C2431] via-[#131B27] to-[#0B141A] dark:from-[#06090F] dark:via-[#0A111B] dark:to-[#081615]"
            : "bg-[#111926] dark:bg-[#070B12]"
        }`}
      >
        {activeBackdropImageUrl && !bgImageFailed && (
          <img
            src={activeBackdropImageUrl}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setBgImageFailed(true)}
            style={{
              opacity: Math.max(0.18, Math.min(0.9, backdrop.intensity / 100)),
              filter: backdrop.blurPx > 0 ? `blur(${backdrop.blurPx}px)` : undefined,
            }}
            className="w-full h-full object-cover object-center scale-[1.03] transition-opacity duration-300"
          />
        )}

        {/* Measured readability scrim: rich slate in light mode, deep obsidian in dark mode (never flat white) */}
        <div
          className={`absolute inset-0 ${
            activeBackdropImageUrl && !bgImageFailed
              ? darkMode
                ? "bg-gradient-to-b from-[#070B12]/72 via-[#09101B]/68 to-[#070B12]/88"
                : "bg-gradient-to-b from-slate-900/45 via-slate-800/38 to-slate-900/58"
              : ""
          }`}
        />
        <div className="absolute inset-0 bg-terminal-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_45%_at_50%_-10%,rgba(16,185,129,0.12),transparent)]" />
      </div>

      {/* App Shell (relative z-10 sits cleanly over the fixed z-0 backdrop) */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Toasts */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#141B29]/95 backdrop-blur-md px-4 py-3 shadow-lg"
            >
              <div className="min-w-0">
                <div
                  className={`text-xs font-bold ${
                    toast.tone === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : toast.tone === "dn"
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {toast.title}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 break-words">
                  {toast.body}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                aria-label="Chiudi avviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Sleek Liquid Top Command Bar — 4 Primary Views, Zero Duplicate Clutter */}
        <header className="sticky top-0 z-30 border-b border-slate-200/70 dark:border-white/[0.07] liquid-bar">
          <div className="max-w-[1480px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setWorkspaceView("bots")}
                className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                Scalper Pro
              </button>
              <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    accountSummary.halted
                      ? "bg-red-500"
                      : wsConnected
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                />
                <span>{wsConnected ? "LIVE" : "REST"}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {accountSummary.liveCount}/{markets.length}
                </span>
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setWorkspaceView("bots")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  workspaceView === "bots"
                    ? "bg-white dark:bg-white/[0.1] text-emerald-700 dark:text-emerald-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-emerald-500" />
                <span>3 Bot AI (2m)</span>
              </button>

              <button
                type="button"
                onClick={() => setWorkspaceView("terminale")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  workspaceView === "terminale"
                    ? "bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                <span>Terminale</span>
              </button>

              <button
                type="button"
                onClick={() => setWorkspaceView("scanner")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  workspaceView === "scanner"
                    ? "bg-white dark:bg-white/[0.1] text-amber-700 dark:text-amber-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-amber-500" />
                <span>Scanner</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPositionTab("open");
                  setWorkspaceView("portafoglio");
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  workspaceView === "portafoglio"
                    ? "bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Briefcase className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Portafoglio ({accountSummary.openCount})</span>
              </button>
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEmailModalOpen(true)}
                title="Invia Banner Pre-Breakout via Gmail"
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-amber-500/45 bg-amber-500/12 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span className="hidden lg:inline">Banner Mail</span>
              </button>

              {firebaseUser ? (
                <div className="hidden sm:inline-flex items-center rounded-xl border border-emerald-500/35 bg-emerald-500/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => void handleConnectCloudOrSync()}
                    disabled={cloudSyncing}
                    title={`Cloud Firestore attivo (${firebaseUser.email || "Google"}). Clicca per sincronizzare ora.`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 text-[11px] font-mono font-bold transition-colors cursor-pointer"
                  >
                    {cloudSyncing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {lastCloudSyncAt
                        ? new Date(lastCloudSyncAt).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Cloud"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void signOutGoogle();
                      pushToast("Disconnesso da Google", "Sessione Cloud e Gmail chiusa.", "neutral");
                    }}
                    title="Esci da Google Cloud"
                    className="px-2 py-2 border-l border-emerald-500/25 text-emerald-700/80 dark:text-emerald-300/80 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnectCloudOrSync()}
                  disabled={cloudSyncing}
                  title="Connetti Google per Sync Cloud Firestore e Invio Gmail"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200/80 dark:border-white/[0.1] bg-white/60 dark:bg-white/[0.04] hover:border-emerald-500/50 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Connetti Cloud</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  void unlockAudioContext();
                  setAlertsModalOpen(true);
                }}
                title="Allarmi Sonori"
                className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
                  ringingAlerts.length > 0
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-500"
                    : "border-slate-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:border-amber-500/50"
                }`}
              >
                {soundSettings.muted ? (
                  <VolumeX className="w-4 h-4 text-red-500" />
                ) : (
                  <BellRing className="w-4 h-4" />
                )}
                {activeAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold flex items-center justify-center">
                    {activeAlertsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="Parametri & Strumenti"
                className="p-2 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:border-emerald-500/50 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                title={darkMode ? "Tema Chiaro" : "Tema Scuro"}
                className="p-2 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:border-emerald-500/50 transition-colors cursor-pointer"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setAutoTrading((v) => !v)}
                className={`px-3 sm:px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  autoTrading
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20"
                    : "bg-slate-200 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200"
                }`}
              >
                {autoTrading ? "Auto ON" : "Auto OFF"}
              </button>
            </div>
          </div>

          {/* Mobile Quick Navigation Strip */}
          <div className="md:hidden border-t border-slate-200/60 dark:border-white/[0.05] px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setWorkspaceView("bots")}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                workspaceView === "bots"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              3 Bot AI (2m)
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView("terminale")}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                workspaceView === "terminale"
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                  : "bg-slate-100/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200"
              }`}
            >
              Terminale
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView("scanner")}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                workspaceView === "scanner"
                  ? "bg-amber-500 text-slate-950"
                  : "bg-slate-100/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300"
              }`}
            >
              Scanner
            </button>
            <button
              type="button"
              onClick={() => {
                setPositionTab("open");
                setWorkspaceView("portafoglio");
              }}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                workspaceView === "portafoglio"
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                  : "bg-slate-100/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300"
              }`}
            >
              Portafoglio ({accountSummary.openCount})
            </button>
            <button
              type="button"
              onClick={() => void handleConnectCloudOrSync()}
              className="px-2.5 py-1 rounded-lg bg-slate-100/80 dark:bg-white/[0.06] text-emerald-600 dark:text-emerald-300 whitespace-nowrap"
            >
              {firebaseUser ? "Sync Cloud" : "Cloud"}
            </button>
          </div>
        </header>

        {/* Full-Width Single-Hub Workspace */}
        <div id="top" className="max-w-[1480px] w-full mx-auto px-4 sm:px-6 py-4 flex-1">
          <main className="w-full space-y-4">
            {/* Active Triggered Alarm Banner */}
            {ringingAlerts.length > 0 && (
              <section
                role="alert"
                className="rounded-2xl border border-amber-500/60 bg-amber-50/95 dark:bg-amber-950/75 backdrop-blur-xl px-5 py-3 shadow-md flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                    <BellRing className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-amber-200">
                      Allarme Prezzo Raggiunto ({ringingAlerts.length})
                    </div>
                    <div className="text-xs text-slate-700 dark:text-amber-100/90 font-mono tabular-nums truncate">
                      {ringingAlerts
                        .map(
                          (al) =>
                            `${al.assetName} ${al.condition === "above" ? "≥" : "≤"} ${formatPrice(al.targetPrice)}`
                        )
                        .join(" · ")}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => focusTerminalPair(ringingAlerts[0].pair)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-amber-500/40 bg-white/80 dark:bg-[#0B0F17]/70 text-slate-900 dark:text-amber-100 hover:border-amber-500 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Apri {ringingAlerts[0].assetName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlertsModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-amber-500/40 bg-white/80 dark:bg-[#0B0F17]/70 text-slate-900 dark:text-amber-100 hover:border-amber-500 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Gestisci
                  </button>
                  <button
                    type="button"
                    onClick={handleSilenceAllAlerts}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <BellOff className="w-3.5 h-3.5" />
                    Silenzia
                  </button>
                </div>
              </section>
            )}

            {/* Slim Account KPI & Quick-Tools Bar (shown on Terminal & Portfolio to keep Bot Auto streamlined) */}
            {workspaceView !== "bots" && (
            <section className="rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface overflow-hidden">
              <div className="px-5 py-2 border-b border-slate-200/60 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      accountSummary.halted
                        ? "bg-red-500"
                        : wsConnected
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`}
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {accountSummary.halted
                      ? "Protezione Drawdown (-5%)"
                      : wsConnected
                      ? "OKX WebSocket Live"
                      : "Feed REST Live"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {accountSummary.liveCount}/{markets.length} mercati
                  </span>
                  {lastSavedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        Locale {new Date(lastSavedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </>
                  )}
                  {firebaseUser && lastCloudSyncAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                        Cloud {new Date(lastCloudSyncAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono">
                  <button
                    type="button"
                    onClick={() => setCopyModalOpen(true)}
                    className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                      okxCopyStatus.connected && copySettings.enabled
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Link2 className="w-3 h-3" />
                    <span>Copy OKX: {okxCopyStatus.connected && copySettings.enabled ? "ON" : "CONFIG"}</span>
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setBackdropOpen(true)}
                    className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>Sfondo</span>
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Parametri
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/60 dark:divide-white/[0.06]">
                <div className="px-5 py-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Patrimonio totale
                  </div>
                  <div className="mt-0.5 font-mono text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                    {formatEur(accountSummary.equity)}
                  </div>
                  <div
                    className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${
                      accountSummary.totalPnl > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : accountSummary.totalPnl < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {formatSignedEur(accountSummary.totalPnl)} (
                    {accountSummary.totalPnlPct >= 0 ? "+" : ""}
                    {accountSummary.totalPnlPct.toFixed(2)}%)
                  </div>
                </div>

                <div className="px-5 py-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Disponibile
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatEur(accountSummary.freeMargin)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Ordine €{config.sizeEur}
                  </div>
                </div>

                <div className="px-5 py-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Investito
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatEur(accountSummary.usedMargin)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {accountSummary.openCount} / {config.maxOpen} aperte
                  </div>
                </div>

                <div className="px-5 py-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Commissioni
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatEur(stats.totalFees)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    €{config.feeEur.toFixed(2)} lato
                  </div>
                </div>

                <div className="px-5 py-3.5 col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Win rate
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {accountSummary.winRate !== null ? `${accountSummary.winRate}%` : "–"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {stats.wins}V · {stats.losses}P
                  </div>
                </div>
              </div>

              <SectionInfoBar
                compact
                title="Conto Terminale & Stato Feed"
                summary="Patrimonio netto, margine libero/impegnato, commissioni e win rate delle operazioni del terminale."
                details={[
                  {
                    heading: "Patrimonio & Margine",
                    body: "Il Patrimonio somma saldo iniziale, P&L realizzato e P&L flottante delle posizioni aperte. Disponibile è il capitale libero; Investito mostra il margine impegnato.",
                  },
                  {
                    heading: "Feed Live & Protezione",
                    body: "OKX WebSocket aggiorna i prezzi al tick. Se il drawdown raggiunge -5%, la protezione blocca automaticamente nuove aperture finché il rischio non rientra.",
                  },
                  {
                    heading: "Commissioni & Sincronizzazione",
                    body: "Le commissioni per lato vengono già sottratte dal P&L netto di ogni posizione. I dati si salvano in locale e su Cloud Firestore se collegato.",
                  },
                ]}
              />
            </section>
            )}

            {/* View 1: 3 Bot AI H24 (2m) + Radar Pre-Breakout */}
            {workspaceView === "bots" && (
              <div className="space-y-4">
                <PreBreakoutBanner
                  signals={preBreakoutSignals}
                  globalContext={cryptoGlobalContext}
                  loading={preBreakoutLoading}
                  onRefresh={() => void fetchPreBreakoutSignals(true)}
                  onSelectSignal={handleSelectPreBreakoutSignal}
                  onOpenEmailModal={() => setEmailModalOpen(true)}
                />

                <section className="rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface overflow-hidden">
                  <ThreeBotsPanel
                    embedded
                    botState={botState}
                    tickNow={tickNow}
                    loading={botsLoading}
                    okxCopyConnected={okxCopyStatus.connected}
                    firebaseUser={firebaseUser}
                    lastCloudSyncAt={lastCloudSyncAt}
                    onAuthUpdated={(user, hasToken) => {
                      setFirebaseUser(user);
                      setHasGmailToken(hasToken);
                    }}
                    onUpdateConfig={handleUpdateBotConfig}
                    onForceNewCycle={handleForceNewBotCycle}
                    onResetBots={handleResetBots}
                    onInspectPosition={(pos) =>
                      setFocusedPosition({ kind: "bot", botIndex: pos.botIndex, position: pos })
                    }
                    onSelectBotAsset={handleSelectBotAsset}
                    onNotify={pushToast}
                  />
                </section>
              </div>
            )}

            {/* View 2: Terminale & Watchlist Live Side-by-Side Above the Fold */}
            {workspaceView === "terminale" && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Left Column: Selected Asset Hero + Chart + 4-Gate Execution */}
                <div className="xl:col-span-8 space-y-4">
                <section
                  ref={chartSectionRef}
                  className="rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center font-mono text-xs font-extrabold shrink-0 ${selectedBadge.bgClass}`}
                      >
                        {selectedBadge.code}
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2.5">
                          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                            {selectedAsset.name}
                          </h1>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {selectedAsset.okxId || selectedAsset.yahooSymbol}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>Leva ×{selectedCostSpecs.leverage}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Costo round-trip {selectedCostSpecs.costPct.toFixed(3)}%
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {selectedQuote ? selectedQuote.source : "In attesa dati"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 ml-auto">
                      <div className="text-right font-mono tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-2xl font-bold text-slate-900 dark:text-white">
                            {selectedQuote ? formatPrice(selectedQuote.mid) : "–"}
                          </span>
                          {selectedChange24h !== null && (
                            <span
                              className={`text-xs font-bold ${
                                selectedChange24h >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {selectedChange24h >= 0 ? "+" : ""}
                              {selectedChange24h.toFixed(2)}%
                            </span>
                          )}
                        </div>
                        {selectedQuote && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Bid {formatPrice(selectedQuote.bid)} · Ask{" "}
                            {formatPrice(selectedQuote.ask)}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void unlockAudioContext();
                          setAlertsModalOpen(true);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedAssetAlerts.some((a) => a.enabled && !a.triggeredAt)
                            ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:border-amber-500"
                        }`}
                      >
                        <Bell className="w-3.5 h-3.5 text-amber-500" />
                        <span>
                          Allarme
                          {selectedAssetAlerts.filter((a) => a.enabled && !a.triggeredAt).length > 0
                            ? ` (${selectedAssetAlerts.filter((a) => a.enabled && !a.triggeredAt).length})`
                            : ""}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <LiveChart
                      asset={selectedAsset}
                      bars={selectedRuntime?.bars || []}
                      closes={selectedRuntime?.closes || []}
                      quote={selectedQuote}
                      analysis={selectedAnalysis}
                      position={selectedPosition}
                      alerts={selectedAssetAlerts}
                    />
                  </div>

              {/* Transparent 3 Technical Controls + 4th AI Gate */}
              <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/[0.06] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Verifica Pre-Apertura (3 Controlli + Approvazione IA)
                  </div>
                  {selectedAnalysis && !selectedAnalysis.warmingUp && (
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Target stimato +{selectedAnalysis.tpRoiPct.toFixed(1)}% ROI · R:R{" "}
                      {selectedAnalysis.rrNet.toFixed(2)}x
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(selectedAnalysis?.gates || []).map((gate) => (
                    <div
                      key={gate.id}
                      className={`p-2.5 rounded-xl border text-xs transition-colors ${
                        gate.passed
                          ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                          : "border-slate-200/70 dark:border-white/[0.06] bg-slate-900/[0.02] dark:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {gate.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-mono font-bold text-[11px] ${
                            gate.passed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {gate.passed ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5" /> ATTESA
                            </>
                          )}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                        {gate.detail}
                      </div>
                    </div>
                  ))}

                  {/* 4th Gate: Gemini AI Consensus */}
                  <div
                    className={`p-2.5 rounded-xl border text-xs transition-colors ${
                      selectedAi?.approved
                        ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                        : selectedAi && !selectedAi.approved
                        ? "border-red-500/30 bg-red-500/[0.06]"
                        : "border-slate-200/70 dark:border-white/[0.06] bg-slate-900/[0.02] dark:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                        <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        4. Controllo IA Gemini
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-mono font-bold text-[11px] ${
                          aiBusyPair === selectedAsset.pair
                            ? "text-blue-600 dark:text-blue-400"
                            : selectedAi?.approved
                            ? "text-emerald-600 dark:text-emerald-400"
                            : selectedAi
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {aiBusyPair === selectedAsset.pair ? (
                          "ANALISI…"
                        ) : selectedAi?.approved ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> OK {selectedAi.confidence}%
                          </>
                        ) : selectedAi ? (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> BLOCCO {selectedAi.confidence}%
                          </>
                        ) : config.requireAiApproval ? (
                          "PRONTO"
                        ) : (
                          "OPZIONALE"
                        )}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                      {selectedAi
                        ? selectedAi.reasoning
                        : "L'IA esamina candele, Fibonacci e momentum prima di autorizzare l'ordine."}
                    </div>
                  </div>
                </div>

                {/* Action Execution Bar */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {selectedAnalysis && !selectedAnalysis.warmingUp
                      ? `RSI ${selectedAnalysis.rsi14.toFixed(1)} · ATR ${selectedAnalysis.atrPct.toFixed(3)}% · Score ${selectedAnalysis.score}/100`
                      : "Raccolta dati storici live in corso…"}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedPosition ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedQuote) {
                            closePosition(selectedAsset, selectedQuote, "Chiusura manuale");
                          }
                        }}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Chiudi {selectedPosition.side === "L" ? "LONG" : "SHORT"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={
                            !selectedQuote ||
                            Boolean(selectedClosed) ||
                            aiBusyPair === selectedAsset.pair
                          }
                          onClick={() => handleManualAction("L")}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          {config.requireAiApproval ? "Verifica IA & LONG" : "Compra LONG"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            !selectedQuote ||
                            Boolean(selectedClosed) ||
                            aiBusyPair === selectedAsset.pair
                          }
                          onClick={() => handleManualAction("S")}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <TrendingDown className="w-3.5 h-3.5" />
                          {config.requireAiApproval ? "Verifica IA & SHORT" : "Vendi SHORT"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <SectionInfoBar
                compact
                title="Grafico Live & Esecuzione 4-Gate"
                summary="Analisi tecnica in diretta, candele multi-timeframe, verifica dei 3 controlli tecnici + approvazione IA."
                details={[
                  {
                    heading: "Lettura Candele & Prezzo",
                    body: "Il grafico mostra andamento reale bid/ask, EMA veloci/lente e livelli operativi. Puoi cambiare timeframe o cliccare su una posizione aperta per il Focus live.",
                  },
                  {
                    heading: "4-Gate di Qualità",
                    body: "Prima di aprire in automatico o con Verifica IA, lo strumento controlla trend, momentum, volatilità e conferma finale di Gemini sul target ROI.",
                  },
                  {
                    heading: "Controlli Manuali & Allarmi",
                    body: "Puoi aprire LONG/SHORT manualmente in qualsiasi momento o impostare un allarme sonoro al raggiungimento di una soglia di prezzo precisa.",
                  },
                ]}
              />
              </section>
                </div>

                {/* Right Column: Compact Watchlist Live */}
                <section
                  ref={marketSectionRef}
                  className="xl:col-span-4 rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface overflow-hidden"
                >
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Watchlist Live (Crypto, Azioni & Indici)
                </h2>
                <button
                  type="button"
                  onClick={() => setExplorerOpen(true)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  + Aggiungi da OKX
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="Filtra mercato…"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                  />
                </div>

                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("all")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      categoryFilter === "all"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Tutti
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("c")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      categoryFilter === "c"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    OKX Crypto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("im")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      categoryFilter === "im"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Azioni/Indici
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[660px] overflow-y-auto custom-scrollbar">
              {filteredMarkets.map((asset) => {
                const q = quotes[asset.pair];
                const an = analyses[asset.pair];
                const pos = positions[asset.pair];
                const isSelected = asset.pair === selectedAsset.pair;
                const isClosed =
                  asset.group !== "c" &&
                  q &&
                  q.marketState !== "REGULAR" &&
                  q.marketState !== "OPEN";

                const change24h =
                  q && q.open24h && q.open24h > 0
                    ? ((q.mid - q.open24h) / q.open24h) * 100
                    : null;

                const gatesCount = an ? an.gates.filter((g) => g.passed).length : 0;

                let signalLabel = `${gatesCount}/3`;
                let signalStyle =
                  "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400";

                if (pos) {
                  signalLabel = pos.side === "L" ? "LONG" : "SHORT";
                  signalStyle =
                    pos.side === "L"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-red-600 bg-red-600 text-white";
                } else if (isClosed) {
                  signalLabel = "CHIUSO";
                } else if (an?.warmingUp) {
                  signalLabel = "STUDIO";
                } else if (an?.allGatesPassed) {
                  signalLabel = an.direction === "L" ? "3/3 LONG" : "3/3 SHORT";
                  signalStyle =
                    an.direction === "L"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300";
                }

                const badge = getAssetBadgeMeta(asset);
                const hasActiveAlert = priceAlerts.some(
                  (al) => al.pair === asset.pair && al.enabled && !al.triggeredAt
                );

                return (
                  <button
                    key={asset.pair}
                    type="button"
                    onClick={() => setSelectedPair(asset.pair)}
                    className={`w-full text-left px-4 py-2.5 grid grid-cols-[auto_1fr_auto_82px] items-center gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50/70 dark:bg-emerald-950/25"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold shrink-0 ${badge.bgClass}`}
                    >
                      {badge.code}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {asset.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                          {asset.group === "c" ? (asset.okxId ? asset.okxId.replace("-USDT-SWAP", "") : "OKX") : asset.pair}
                        </span>
                        {hasActiveAlert && (
                          <Bell
                            className="w-3 h-3 text-amber-500 shrink-0"
                            aria-label="Allarme prezzo attivo"
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {!q
                          ? "In attesa feed…"
                          : isClosed
                          ? "Mercato chiuso"
                          : an?.warmingUp
                          ? `Studio dati ${an.score}/100`
                          : an
                          ? `Prob. ${an.winProbabilityPct}% · Score ${an.score}% · +${an.tpRoiPct.toFixed(0)}% ROI`
                          : "Analisi in corso…"}
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {q ? formatPrice(q.mid) : "–"}
                      </div>
                      {change24h !== null && (
                        <div
                          className={`text-[11px] inline-flex items-center justify-end gap-0.5 ${
                            change24h >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {change24h >= 0 ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {change24h >= 0 ? "+" : ""}
                          {change24h.toFixed(2)}%
                        </div>
                      )}
                    </div>

                    <div
                      className={`text-center py-1.5 rounded-md border text-[11px] font-bold tracking-tight whitespace-nowrap ${signalStyle}`}
                    >
                      {signalLabel}
                    </div>
                  </button>
                );
              })}
            </div>

            <SectionInfoBar
              compact
              title="Watchlist Live Multi-Mercato"
              summary="Monitoraggio continuo di Crypto, Azioni e Indici con stato 3/3 controlli tecnici e posizioni attive."
              details={[
                {
                  heading: "Stato Segnali",
                  body: "Ogni riga indica quanti controlli tecnici su 3 sono superati (0/3 → 3/3). Quando appare 3/3 LONG o 3/3 SHORT il setup tecnico è pronto.",
                },
                {
                  heading: "Filtri & Aggiunta OKX",
                  body: "Filtra rapidamente per categoria (Tutti, Crypto, Azioni/Indici) oppure usa '+ Aggiungi da OKX' per inserire qualsiasi coppia spot/perp.",
                },
                {
                  heading: "Selezione Istantanea",
                  body: "Cliccando su un mercato apri subito il relativo grafico e pannello ordini sulla sinistra senza perdere il feed live degli altri strumenti.",
                },
              ]}
            />
          </section>
              </div>
            )}

            {/* View 3: Unified Scanner Mercati */}
            {workspaceView === "scanner" && (
              <div className="space-y-4">
                <PreBreakoutBanner
                  signals={preBreakoutSignals}
                  globalContext={cryptoGlobalContext}
                  loading={preBreakoutLoading}
                  onRefresh={() => void fetchPreBreakoutSignals(true)}
                  onSelectSignal={handleSelectPreBreakoutSignal}
                  onOpenEmailModal={() => setEmailModalOpen(true)}
                />

                <section
                  ref={scannerDockRef}
                  className="rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface overflow-hidden"
                >
                  <div className="px-4 sm:px-5 py-3 border-b border-slate-200/60 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3 bg-slate-900/[0.02] dark:bg-white/[0.02]">
                    <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100/85 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setScannerTab("crypto")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                          scannerTab === "crypto"
                            ? "bg-white dark:bg-white/[0.1] text-emerald-700 dark:text-emerald-300 shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5 text-emerald-500" />
                        Crypto &amp; Memecoin ({cryptoOpportunities.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => setScannerTab("volatility")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                          scannerTab === "volatility"
                            ? "bg-white dark:bg-white/[0.1] text-amber-700 dark:text-amber-300 shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5 text-amber-500" />
                        Volatilità 24h
                      </button>

                      <button
                        type="button"
                        onClick={() => setScannerTab("leaderboard")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                          scannerTab === "leaderboard"
                            ? "bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        Classifica Top
                      </button>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Clicca un asset per aprire il grafico live
                    </div>
                  </div>

                  {scannerTab === "leaderboard" ? (
                    <LeaderboardPanel
                      embedded
                      markets={markets}
                      quotes={quotes}
                      analyses={analyses}
                      positions={positions}
                      aiSnapshots={aiSnapshots}
                      selectedPair={selectedAsset.pair}
                      tickNow={tickNow}
                      requireAiApproval={config.requireAiApproval}
                      aiBusyPair={aiBusyPair}
                      onSelectPair={(pair) => focusTerminalPair(pair)}
                      onQuickOpen={(asset, quote, analysis, side) => {
                        if (config.requireAiApproval) {
                          validateCandidateWithAi(asset, quote, analysis, true, side);
                        } else {
                          openPosition(
                            asset,
                            quote,
                            side,
                            analysis,
                            `Apertura da classifica ${side === "L" ? "LONG" : "SHORT"}`,
                            true
                          );
                        }
                      }}
                      onQuickClose={(asset, quote) => {
                        closePosition(asset, quote, "Chiusura manuale");
                      }}
                    />
                  ) : scannerTab === "crypto" ? (
                    <CryptoOpportunityPanel
                      embedded
                      globalContext={cryptoGlobalContext}
                      opportunities={cryptoOpportunities}
                      loading={cryptoScanLoading}
                      error={cryptoScanError}
                      cryptoLeverage={config.cryptoLeverage}
                      selectedOkxId={selectedAsset.okxId}
                      onRefresh={() => void fetchCryptoOpportunities(true)}
                      onSelectCrypto={handleSelectCryptoOpportunity}
                    />
                  ) : (
                    <VolatilityScreener
                      embedded
                      markets={markets}
                      quotes={quotes}
                      analyses={analyses}
                      cryptoOpportunities={cryptoOpportunities}
                      selectedPair={selectedAsset.pair}
                      selectedOkxId={selectedAsset.okxId}
                      tickNow={tickNow}
                      requireAiApproval={config.requireAiApproval}
                      aiBusyPair={aiBusyPair}
                      onSelectMarketAsset={(pair) => focusTerminalPair(pair)}
                      onSelectCryptoOpportunity={handleSelectCryptoOpportunity}
                      onQuickOpen={(asset, quote, analysis, side) => {
                        if (config.requireAiApproval) {
                          validateCandidateWithAi(asset, quote, analysis, true, side);
                        } else {
                          openPosition(
                            asset,
                            quote,
                            side,
                            analysis,
                            `Apertura da Screener Volatilità ${side === "L" ? "LONG" : "SHORT"}`,
                            true
                          );
                        }
                      }}
                    />
                  )}

                  <SectionInfoBar
                    compact
                    title="Scanner Mercati (Crypto, Volatilità & Classifica)"
                    summary="Individua le opportunità con maggior spinta direzionale, espansione di volatilità 24h e punteggio tecnico."
                    details={[
                      {
                        heading: "Crypto & Memecoin",
                        body: "Analizza liquidità, variazione 24h e breakout su coppie OKX ad alto volume per isolare i movimenti più reattivi.",
                      },
                      {
                        heading: "Volatilità 24h",
                        body: "Ordina gli strumenti per ampiezza del range giornaliero: utile per scegliere mercati con escursione sufficiente a superare spread e commissioni.",
                      },
                      {
                        heading: "Classifica Top",
                        body: "Riassume i mercati con score composito più alto e consente apertura rapida o passaggio diretto al grafico live.",
                      },
                    ]}
                  />
                </section>
              </div>
            )}

            {/* View 4: Portafoglio, Storico & Audit IA */}
            {workspaceView === "portafoglio" && (
              <section
                ref={positionsSectionRef}
                className="rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Portafoglio, Storico &amp; Audit IA
                  </h2>

                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPositionTab("open")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        positionTab === "open"
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Aperte ({openPositionsList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPositionTab("closed")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        positionTab === "closed"
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Chiuse ({trades.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPositionTab("audit")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        positionTab === "audit"
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Audit IA ({auditLogs.length})
                    </button>
                  </div>
                </div>

                {/* Institutional 6-Metric Trading Ledger */}
                <div className="border-b border-slate-200/70 dark:border-white/[0.06] bg-slate-50/40 dark:bg-white/[0.015]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/70 dark:divide-white/[0.06]">
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Posizioni aperte
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                        {portfolioLedger.openCount}
                        <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                          {" "}
                          / {config.maxOpen}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {portfolioLedger.openCount > 0 ? "In gestione live" : "Nessuna esposta"}
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Prob. vittoria aperte
                      </div>
                      <div
                        className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                          portfolioLedger.avgWinProbPct === null
                            ? "text-slate-400 dark:text-slate-500"
                            : portfolioLedger.avgWinProbPct >= 65
                            ? "text-emerald-600 dark:text-emerald-400"
                            : portfolioLedger.avgWinProbPct >= 48
                            ? "text-slate-900 dark:text-white"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {portfolioLedger.avgWinProbPct !== null
                          ? `${portfolioLedger.avgWinProbPct}%`
                          : "—"}
                      </div>
                      <div className="mt-1 h-[2px] w-full bg-slate-200/80 dark:bg-white/[0.08] overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            (portfolioLedger.avgWinProbPct ?? 0) >= 65
                              ? "bg-emerald-500"
                              : (portfolioLedger.avgWinProbPct ?? 0) >= 48
                              ? "bg-slate-500 dark:bg-slate-400"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${portfolioLedger.avgWinProbPct ?? 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Posizioni vinte
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {portfolioLedger.wins}
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {portfolioLedger.winRatePct !== null
                          ? `${portfolioLedger.winRatePct}% win rate`
                          : "0%"}
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Posizioni perse
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                        {portfolioLedger.losses}
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {portfolioLedger.lossRatePct !== null
                          ? `${portfolioLedger.lossRatePct}% loss rate`
                          : "0%"}
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Guadagno
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        +{formatEur(portfolioLedger.grossProfitEur)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {portfolioLedger.floatingGainEur > 0.005
                          ? `Live +${formatEur(portfolioLedger.floatingGainEur)}`
                          : "Chiusi in utile"}
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Perdita
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                        -{formatEur(portfolioLedger.grossLossEur)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {portfolioLedger.floatingLossEur > 0.005
                          ? `Live -${formatEur(portfolioLedger.floatingLossEur)}`
                          : "Chiusi in perdita"}
                      </div>
                    </div>
                  </div>
                </div>

                {positionTab === "open" ? (
                  openPositionsList.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Nessuna posizione aperta nel terminale manuale/auto.
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {autoTrading
                          ? `Lo scanner attende un asset con 3 controlli tecnici + approvazione IA Gemini (+${config.minTargetRoiPct}% ROI).`
                          : "Attiva Auto ON oppure apri una posizione dal Terminale."}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {openPositionsList.map((pos) => {
                        const asset = markets.find((m) => m.pair === pos.pair);
                        const q = quotes[pos.pair];
                        const exitPx = q
                          ? pos.side === "L"
                            ? q.bid
                            : q.ask
                          : pos.entryPrice;
                        const g =
                          pos.side === "L"
                            ? ((exitPx - pos.entryPrice) / pos.entryPrice) * 100
                            : ((pos.entryPrice - exitPx) / pos.entryPrice) * 100;
                        const netEur = (pos.notionalEur * g) / 100 - 2 * pos.feePerSide;
                        const roiPct = (netEur / pos.sizeEur) * 100;

                        return (
                          <div
                            key={pos.pair}
                            className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <div
                              className="min-w-0 cursor-pointer flex-1"
                              onClick={() =>
                                setFocusedPosition({
                                  kind: "terminal",
                                  position: pos,
                                  assetName: asset?.name || pos.pair,
                                  instId: asset?.okxId,
                                  livePrice: q?.mid,
                                  bid: q?.bid,
                                  ask: q?.ask,
                                })
                              }
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                  {asset?.name || pos.pair}
                                </span>
                                <span
                                  className={`text-xs font-bold font-mono ${
                                    pos.side === "L"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {pos.side === "L" ? "LONG" : "SHORT"} ×{pos.leverage}
                                </span>
                                {pos.trailingActive ? (
                                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    · Trailing Profit Attivo (Picco +{pos.peakRoiPct.toFixed(1)}%)
                                  </span>
                                ) : pos.breakEvenProtected ? (
                                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                    · Break-even protetto
                                  </span>
                                ) : null}
                                {pos.okxOrderId && (
                                  <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                                    · OKX #{pos.okxOrderId.slice(-6)}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                                €{pos.sizeEur} · {formatPrice(pos.entryPrice)} →{" "}
                                {formatPrice(exitPx)} · TP +{(pos.tpPct * pos.leverage).toFixed(1)}% ROI / SL{" "}
                                {pos.slPct < 0 ? "-" : "+"}
                                {Math.abs(pos.slPct).toFixed(2)}%
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {pos.aiReasoning || pos.reason}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 ml-auto">
                              <div className="text-right font-mono tabular-nums">
                                <div
                                  className={`text-sm font-bold ${
                                    netEur >= 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {formatSignedEur(netEur)}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {roiPct >= 0 ? "+" : ""}
                                  {roiPct.toFixed(2)}% · {formatDuration(tickNow - pos.openedAt)}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  Prob. vittoria{" "}
                                  <span
                                    className={`font-semibold ${
                                      computeTerminalWinProb(pos, exitPx) >= 65
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : computeTerminalWinProb(pos, exitPx) < 48
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-slate-700 dark:text-slate-300"
                                    }`}
                                  >
                                    {computeTerminalWinProb(pos, exitPx)}%
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (asset && q) {
                                    closePosition(asset, q, "Chiusura manuale");
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors whitespace-nowrap cursor-pointer"
                              >
                                Chiudi
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : positionTab === "closed" ? (
                  trades.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Ancora nessuna operazione chiusa.
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Lo storico delle operazioni chiuse apparirà qui con profitto netto e durata.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[520px] overflow-y-auto custom-scrollbar">
                      {trades.slice(0, 60).map((t) => {
                        const roiPct = (t.netEur / t.sizeEur) * 100;
                        return (
                          <div
                            key={t.id}
                            className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                  {t.name}
                                </span>
                                <span
                                  className={`text-xs font-bold font-mono ${
                                    t.side === "L"
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {t.side === "L" ? "LONG" : "SHORT"} ×{t.leverage}
                                </span>
                                {t.okxOrderId && (
                                  <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                                    · OKX
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                                €{t.sizeEur} · {formatPrice(t.entryPrice)} →{" "}
                                {formatPrice(t.exitPrice)}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                Uscita: {t.reason}
                              </div>
                            </div>

                            <div className="text-right font-mono tabular-nums shrink-0">
                              <div
                                className={`text-sm font-bold ${
                                  t.netEur >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {formatSignedEur(t.netEur)}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {roiPct >= 0 ? "+" : ""}
                                {roiPct.toFixed(2)}% · {formatDuration(t.closedAt - t.openedAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : auditLogs.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nessun audit IA registrato finora.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Le decisioni complete di Gemini vengono salvate qui a ogni analisi.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[520px] overflow-y-auto custom-scrollbar">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="px-5 py-3 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {log.name}
                            </span>
                            <span className="font-mono text-slate-500">
                              {log.direction === "L" ? "LONG" : "SHORT"} · {log.gatesPassed}/3 controlli
                            </span>
                          </div>
                          <span
                            className={`font-mono font-bold ${
                              log.aiApproved
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {log.action} ({log.aiConfidence}%)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {log.aiReasoning}
                        </p>
                        <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {new Date(log.ts).toLocaleTimeString("it-IT")} · Target +{log.tpRoiPct.toFixed(1)}% ROI · Score {log.score}/100
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <SectionInfoBar
                  title="Portafoglio, Bilancio Operativo & Audit IA"
                  summary="Conteggio posizioni aperte, probabilità live di vittoria, vinte/perse, guadagno/perdita cumulati e log decisioni IA."
                  details={[
                    {
                      heading: "Prob. Vittoria & Aperte",
                      body: "La probabilità live combina lo score pre-ingresso con l'avanzamento reale del prezzo tra Stop-Loss e Take-Profit (inclusi break-even e trailing). Clicca una riga per aprire il Focus live.",
                    },
                    {
                      heading: "Vinte, Perse, Guadagno & Perdita",
                      body: "Guadagno somma esclusivamente i profitti netti delle operazioni vincenti; Perdita somma le perdite nette delle operazioni negative, separando chiaramente lordo positivo e passivo.",
                    },
                    {
                      heading: "Storico & Audit IA",
                      body: "In 'Chiuse' trovi prezzo d'ingresso/uscita, motivo e durata; in 'Audit IA' sono archiviate tutte le valutazioni approvate o scartate da Gemini con confidenza e motivazione.",
                    },
                  ]}
                />
              </section>
            )}

        <footer className="pt-2 pb-6 text-xs text-slate-400 dark:text-slate-500 leading-relaxed border-t border-slate-200/30 dark:border-white/[0.06]">
          Scalper Pro Live · 3 Bot AI H24 (cicli da 2 min, multi-mercato Crypto/Metalli/Azioni/ETF, 59% in Cassaforte) · Dati OKX &amp; Yahoo Finance · Cloud Firestore + Gmail OAuth.
        </footer>
      </main>
        </div>
      </div>

      <QuickActionButton
        openTerminalCount={openPositionsList.length}
        openBotCount={
          botState?.currentCycle?.positions.filter((p) => p.status === "open").length ?? 0
        }
        equityEur={accountSummary.equity}
        busyAction={quickActionBusy}
        lastActionNote={quickActionNote}
        onEmergencySellAll={handleEmergencySellAll}
        onRebalance={handleRebalancePortfolio}
      />

      <PositionFocusModal
        target={liveFocusedTarget}
        tickNow={tickNow}
        onClose={() => setFocusedPosition(null)}
        onCloseBotSlot={handleCloseBotSlot}
        onCloseTerminalPosition={(pair) => {
          const asset = markets.find((m) => m.pair === pair);
          const q = quotes[pair];
          if (asset && q) {
            void closePosition(asset, q, "Chiusura Manuale Focus");
          }
        }}
        onOpenFullChart={(tgt) => {
          if (tgt.kind === "bot") {
            handleSelectBotAsset(tgt.position);
          } else {
            focusTerminalPair(tgt.position.pair);
          }
        }}
      />

      <BackdropModal
        open={backdropOpen}
        onClose={() => setBackdropOpen(false)}
        backdrop={backdrop}
        onUpdateBackdrop={(next) => {
          setBgImageFailed(false);
          setBackdrop(next);
        }}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
      />

      <OkxExplorerModal
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        activeAssets={markets}
        onToggleAsset={handleToggleOkxAsset}
      />

      <OkxCopyTradingModal
        open={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        status={okxCopyStatus}
        copySettings={copySettings}
        onUpdateCopySettings={setCopySettings}
        onRefreshStatus={refreshOkxCopyStatus}
        onConnected={(next) => {
          setOkxCopyStatus(next);
          pushToast("Account OKX collegato", `Modalità ${next.simulated ? "Demo" : "Live Reale"} attiva.`, "up");
        }}
        onDisconnected={() => {
          setOkxCopyStatus({ connected: false });
          pushToast("Account OKX disconnesso", "Sessione Copy Trading terminata.", "neutral");
        }}
      />

      <PriceAlertModal
        open={alertsModalOpen}
        onClose={() => setAlertsModalOpen(false)}
        markets={markets}
        quotes={quotes}
        selectedPair={selectedAsset.pair}
        alerts={priceAlerts}
        ringingAlertIds={ringingAlertIds}
        soundSettings={soundSettings}
        onUpdateSoundSettings={setSoundSettings}
        onAddAlert={handleAddPriceAlert}
        onToggleAlert={handleTogglePriceAlert}
        onRearmAlert={handleRearmPriceAlert}
        onDeleteAlert={handleDeletePriceAlert}
        onSilenceAll={handleSilenceAllAlerts}
        onSelectPair={setSelectedPair}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onUpdateConfig={setConfig}
        pushEnabled={pushEnabled}
        onTogglePush={handleTogglePush}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        onOpenBackdrop={() => setBackdropOpen(true)}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onResetAccount={handleResetAccount}
      />

      <EmailAlertBannerModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        signals={preBreakoutSignals}
        globalContext={cryptoGlobalContext}
        firebaseUser={firebaseUser}
        hasGmailToken={hasGmailToken}
        onAuthUpdated={(user, hasToken) => {
          setFirebaseUser(user);
          setHasGmailToken(hasToken);
        }}
        onNotify={pushToast}
      />
    </div>
  );
}
