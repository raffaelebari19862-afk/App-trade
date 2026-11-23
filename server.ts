import crypto from "crypto";
import fs from "fs";
import http from "http";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const DATA_DIR = path.resolve(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "scalper-state.json");
const BOTS_FILE = path.join(DATA_DIR, "scalper-bots.json");

function readPersistedServerState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writePersistedServerState(state: unknown) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state), "utf-8");
  fs.renameSync(tmpFile, STATE_FILE);
}

type BotHorizonModeServer = "scalping" | "intraday" | "swing" | "macro";

interface HorizonTimeframeStatServer {
  label: string;
  bar: string;
  barsAnalyzed: number;
  changePct: number;
  trend: "L" | "S" | "FLAT";
  rangePosPct: number;
}

interface MultiHorizonEstimateServer {
  horizonMode: BotHorizonModeServer;
  hours: HorizonTimeframeStatServer | null;
  days: HorizonTimeframeStatServer | null;
  weeks: HorizonTimeframeStatServer | null;
  monthsYears: HorizonTimeframeStatServer | null;
  alignmentScore: number;
  summary: string;
}

interface BotPositionEntryMetaServer {
  spreadPct?: number;
  rsi14?: number;
  volSurge?: number;
  atr1mPct?: number;
  mtfAligned?: boolean;
  vwapDistPct?: number;
  reversalTriggerPct?: number;
  multiHorizon?: MultiHorizonEstimateServer;
}

interface BotPositionServer {
  botIndex: 1 | 2 | 3;
  instId: string;
  symbol: string;
  name: string;
  sector: "memecoin" | "major" | "altcoin" | "metallo" | "azione" | "altro_mercato";
  direction: "L" | "S";
  probabilityPct: number;
  technique: string;
  reasoning: string;
  entryPrice: number;
  currentPrice: number;
  bidPrice?: number;
  askPrice?: number;
  targetPrice: number;
  stopPrice: number;
  leverage: number;
  allocatedMarginEur: number;
  peakPnlEur: number;
  livePnlEur: number;
  liveRoiPct: number;
  openedAt: number;
  expiresAt: number;
  closedAt?: number;
  exitReason?: string;
  okxOrderId?: string;
  reversalsCount?: number;
  entryMeta?: BotPositionEntryMetaServer;
  status: "open" | "closed";
}

interface BotSlotEventServer {
  ts: number;
  botIndex: 1 | 2 | 3;
  symbol: string;
  direction: "L" | "S";
  pnlEur: number;
  reason: string;
  replacedBy: string;
}

interface BotCycleServer {
  cycleId: string;
  cycleNumber: number;
  startedAt: number;
  endsAt: number;
  status: "running" | "completed";
  startingCapitalEur: number;
  closedSlotPnlEur?: number;
  netPnlEur: number;
  vaultAddedEur: number;
  reinvestedEur: number;
  vaultTotalEur: number;
  aiModel: string;
  marketHeadline: string;
  positions: BotPositionServer[];
  recentSlotEvents?: BotSlotEventServer[];
}

interface BotEngineConfigServer {
  enabled24h: boolean;
  cycleDurationSec: number;
  vaultReservePct: number;
  monthlyGoalPct: number;
  leverage: number;
  tradeAmountMode: "auto" | "fixed";
  fixedPerBotEur: number;
  autoCopyToOkx: boolean;
  horizonMode?: BotHorizonModeServer;
}

interface BotLearningAssetStatServer {
  instId: string;
  symbol: string;
  wins: number;
  losses: number;
  netPnlEur: number;
  consecutiveLosses: number;
  cooldownUntil: number;
  lastOutcomeAt: number;
}

interface BotLearningBucketStatServer {
  key: string;
  wins: number;
  losses: number;
  netPnlEur: number;
}

interface BotLearningMistakeServer {
  ts: number;
  symbol: string;
  instId: string;
  sector: "memecoin" | "major" | "altcoin" | "metallo" | "azione" | "altro_mercato";
  direction: "L" | "S";
  technique: string;
  pnlEur: number;
  diagnosis: string;
  correctiveRule: string;
}

interface BotAdaptiveParamsServer {
  minParsimonyScore: number;
  maxSpreadPct: number;
  requireMtf5m: boolean;
  minVolSurge: number;
  atrTpMultiplier: number;
  atrInversionMultiplier: number;
}

interface BotTechniquePlaybookServer {
  name: string;
  hypothesis: string;
  horizon: BotHorizonModeServer;
  wins: number;
  losses: number;
  netPnlEur: number;
  status: "vincente" | "in_test" | "scartata";
  createdAt: number;
  lastUsedAt: number;
}

interface BotPositionLessonServer {
  ts: number;
  symbol: string;
  direction: "L" | "S";
  technique: string;
  pnlEur: number;
  outcome: "win" | "loss";
  horizonSummary: string;
  lesson: string;
}

interface BotLearningMemoryServer {
  totalEvaluated: number;
  blockedByLearningCount: number;
  recentMistakes: BotLearningMistakeServer[];
  positionLessons: BotPositionLessonServer[];
  discoveredTechniques: BotTechniquePlaybookServer[];
  assetStats: Record<string, BotLearningAssetStatServer>;
  techniqueStats: Record<string, BotLearningBucketStatServer>;
  sectorStats: Record<string, BotLearningBucketStatServer>;
  adaptiveParams: BotAdaptiveParamsServer;
  lastCalibratedAt: number;
}

interface BotEngineStateServer {
  active: boolean;
  startingMonthCapitalEur: number;
  activeCapitalEur: number;
  vaultEur: number;
  totalRealizedPnlEur: number;
  totalGrossProfitEur: number;
  totalGrossLossEur: number;
  totalTrades: number;
  wins: number;
  losses: number;
  currentCycle: BotCycleServer | null;
  history: BotCycleServer[];
  config: BotEngineConfigServer;
  learning: BotLearningMemoryServer;
  lastScanAt: number;
  nextCycleAt: number;
  lastError: string | null;
  updatedAt: number;
}

function createDefaultTechniques(now: number): BotTechniquePlaybookServer[] {
  return [
    {
      name: "Confluenza MTF 1m+5m + VWAP",
      hypothesis: "Ingresso solo quando 1m, 5m e VWAP puntano nella stessa direzione con spread minimo.",
      horizon: "scalping",
      wins: 0,
      losses: 0,
      netPnlEur: 0,
      status: "in_test",
      createdAt: now,
      lastUsedAt: now,
    },
    {
      name: "Breakout Volume Surge & EMA",
      hypothesis: "Cattura accelerazioni direzionali con esplosione volumi >1.3x e candele 1H/1D coerenti.",
      horizon: "intraday",
      wins: 0,
      losses: 0,
      netPnlEur: 0,
      status: "in_test",
      createdAt: now,
      lastUsedAt: now,
    },
    {
      name: "Impulso Multi-Orizzonte (Ore+Giorni+Sett.)",
      hypothesis: "Allinea micro-ingresso 1m/5m al trend dominante di ore, giorni e settimane.",
      horizon: "swing",
      wins: 0,
      losses: 0,
      netPnlEur: 0,
      status: "in_test",
      createdAt: now,
      lastUsedAt: now,
    },
    {
      name: "Struttura Macro (Settimane+Mesi/Anni)",
      hypothesis: "Privilegia asset con trend strutturale plurimensile/pluriennale evitando contro-trend macro.",
      horizon: "macro",
      wins: 0,
      losses: 0,
      netPnlEur: 0,
      status: "in_test",
      createdAt: now,
      lastUsedAt: now,
    },
  ];
}

function createDefaultLearningMemory(): BotLearningMemoryServer {
  const now = Date.now();
  return {
    totalEvaluated: 0,
    blockedByLearningCount: 0,
    recentMistakes: [],
    positionLessons: [],
    discoveredTechniques: createDefaultTechniques(now),
    assetStats: {},
    techniqueStats: {},
    sectorStats: {},
    adaptiveParams: {
      minParsimonyScore: 52,
      maxSpreadPct: 0.09,
      requireMtf5m: true,
      minVolSurge: 0.95,
      atrTpMultiplier: 1.65,
      atrInversionMultiplier: 1.35,
    },
    lastCalibratedAt: now,
  };
}

function createDefaultBotState(): BotEngineStateServer {
  const now = Date.now();
  return {
    active: true,
    startingMonthCapitalEur: 1000,
    activeCapitalEur: 1000,
    vaultEur: 0,
    totalRealizedPnlEur: 0,
    totalGrossProfitEur: 0,
    totalGrossLossEur: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    currentCycle: null,
    history: [],
    config: {
      enabled24h: true,
      cycleDurationSec: 120,
      vaultReservePct: 59,
      monthlyGoalPct: 100,
      leverage: 20,
      tradeAmountMode: "auto",
      fixedPerBotEur: 250,
      autoCopyToOkx: false,
      horizonMode: "scalping",
    },
    learning: createDefaultLearningMemory(),
    lastScanAt: 0,
    nextCycleAt: now + 3000,
    lastError: null,
    updatedAt: now,
  };
}

function readPersistedBotsState(): BotEngineStateServer {
  try {
    if (!fs.existsSync(BOTS_FILE)) return createDefaultBotState();
    const raw = fs.readFileSync(BOTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BotEngineStateServer>;
    const defaults = createDefaultBotState();
    const loadedConfig: BotEngineConfigServer = {
      ...defaults.config,
      ...(parsed.config || {}),
      horizonMode:
        parsed.config?.horizonMode &&
        ["scalping", "intraday", "swing", "macro"].includes(parsed.config.horizonMode)
          ? parsed.config.horizonMode
          : "scalping",
    };
    if (loadedConfig.cycleDurationSec === 180) {
      loadedConfig.cycleDurationSec = 120;
    }
    const defaultLearning = createDefaultLearningMemory();
    const loadedLearning: BotLearningMemoryServer = {
      ...defaultLearning,
      ...(parsed.learning || {}),
      adaptiveParams: {
        ...defaultLearning.adaptiveParams,
        ...(parsed.learning?.adaptiveParams || {}),
      },
      recentMistakes: Array.isArray(parsed.learning?.recentMistakes)
        ? parsed.learning!.recentMistakes.slice(0, 15)
        : [],
      positionLessons: Array.isArray(parsed.learning?.positionLessons)
        ? parsed.learning!.positionLessons.slice(0, 25)
        : [],
      discoveredTechniques:
        Array.isArray(parsed.learning?.discoveredTechniques) &&
        parsed.learning!.discoveredTechniques.length > 0
          ? parsed.learning!.discoveredTechniques.slice(0, 16)
          : defaultLearning.discoveredTechniques,
      assetStats: parsed.learning?.assetStats || {},
      techniqueStats: parsed.learning?.techniqueStats || {},
      sectorStats: parsed.learning?.sectorStats || {},
    };
    const loadedHistory = Array.isArray(parsed.history) ? parsed.history.slice(0, 40) : [];
    let grossProfit = typeof parsed.totalGrossProfitEur === "number" ? parsed.totalGrossProfitEur : -1;
    let grossLoss = typeof parsed.totalGrossLossEur === "number" ? parsed.totalGrossLossEur : -1;
    if (grossProfit < 0 || grossLoss < 0) {
      let calcWin = 0;
      let calcLoss = 0;
      for (const cyc of loadedHistory) {
        for (const p of cyc.positions || []) {
          if (p.livePnlEur >= 0) calcWin += p.livePnlEur;
          else calcLoss += Math.abs(p.livePnlEur);
        }
        for (const ev of cyc.recentSlotEvents || []) {
          if (ev.pnlEur >= 0) calcWin += ev.pnlEur;
          else calcLoss += Math.abs(ev.pnlEur);
        }
      }
      if (calcWin === 0 && calcLoss === 0 && typeof parsed.totalRealizedPnlEur === "number") {
        if (parsed.totalRealizedPnlEur >= 0) calcWin = parsed.totalRealizedPnlEur;
        else calcLoss = Math.abs(parsed.totalRealizedPnlEur);
      }
      grossProfit = Number(calcWin.toFixed(2));
      grossLoss = Number(calcLoss.toFixed(2));
    }
    return {
      ...defaults,
      ...parsed,
      totalGrossProfitEur: Number(Math.max(0, grossProfit).toFixed(2)),
      totalGrossLossEur: Number(Math.max(0, grossLoss).toFixed(2)),
      config: loadedConfig,
      learning: loadedLearning,
      history: loadedHistory,
    };
  } catch {
    return createDefaultBotState();
  }
}

function writePersistedBotsState(state: BotEngineStateServer) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${BOTS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state), "utf-8");
  fs.renameSync(tmpFile, BOTS_FILE);
}

interface OkxApiSession {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  simulated: boolean;
  connectedAt: number;
  maskedKey: string;
}

let okxSession: OkxApiSession | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function fetchJsonWithTimeout(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScalperProLive/1.0)",
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function okxPrivateRequest(
  session: OkxApiSession,
  method: "GET" | "POST",
  requestPath: string,
  bodyObj?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString();
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";
  const preHash = `${timestamp}${method}${requestPath}${bodyStr}`;
  const sign = crypto
    .createHmac("sha256", session.secretKey)
    .update(preHash)
    .digest("base64");

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": session.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": session.passphrase,
    "Content-Type": "application/json",
  };
  if (session.simulated) {
    headers["x-simulated-trading"] = "1";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method,
      headers,
      body: method === "POST" ? bodyStr : undefined,
      signal: controller.signal,
    });
    const json = await response.json();
    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: Date.now(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      okxCopyConnected: Boolean(okxSession),
    });
  });

  // Durable Server-Side State Persistence (atomic file snapshot)
  app.get("/api/state", (_req, res) => {
    const state = readPersistedServerState();
    res.setHeader("Cache-Control", "no-store");
    res.json({ state });
  });

  app.post("/api/state", (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "Invalid state payload" });
        return;
      }
      writePersistedServerState(payload);
      res.json({ ok: true, savedAt: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save state";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/state", (_req, res) => {
    try {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear state";
      res.status(500).json({ error: message });
    }
  });

  // OKX Public Tickers Proxy
  app.get("/api/okx/tickers", async (req, res) => {
    try {
      const instType = String(req.query.instType || "SWAP").toUpperCase();
      if (!["SWAP", "SPOT", "FUTURES"].includes(instType)) {
        res.status(400).json({ error: "Invalid instType" });
        return;
      }
      const data = await fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/tickers?instType=${encodeURIComponent(instType)}`
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch OKX tickers";
      res.status(502).json({ error: message });
    }
  });

  // OKX Single Ticker Proxy
  app.get("/api/okx/ticker", async (req, res) => {
    try {
      const instId = String(req.query.instId || "").trim();
      if (!instId) {
        res.status(400).json({ error: "Missing instId" });
        return;
      }
      const data = await fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch OKX ticker";
      res.status(502).json({ error: message });
    }
  });

  // OKX Historical Candles Proxy (supports 1m, 5m, 15m, etc.)
  app.get("/api/okx/candles", async (req, res) => {
    try {
      const instId = String(req.query.instId || "").trim();
      const bar = String(req.query.bar || "1m").trim();
      const limit = Math.min(300, Math.max(10, Number(req.query.limit || 200)));
      if (!instId) {
        res.status(400).json({ error: "Missing instId" });
        return;
      }
      const data = await fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=${limit}`
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch OKX candles";
      res.status(502).json({ error: message });
    }
  });

  // OKX Public Instruments List
  app.get("/api/okx/instruments", async (req, res) => {
    try {
      const instType = String(req.query.instType || "SWAP").toUpperCase();
      const data = await fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/public/instruments?instType=${encodeURIComponent(instType)}`
      );
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch OKX instruments";
      res.status(502).json({ error: message });
    }
  });

  // Yahoo Finance Public Chart Proxy (Indices & Metals)
  app.get("/api/yahoo/chart", async (req, res) => {
    try {
      const symbol = String(req.query.symbol || "").trim();
      const interval = String(req.query.interval || "1m").trim();
      const range = String(req.query.range || "1d").trim();
      if (!symbol) {
        res.status(400).json({ error: "Missing symbol" });
        return;
      }
      const data = await fetchJsonWithTimeout(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch Yahoo chart";
      res.status(502).json({ error: message });
    }
  });

  // Live Crypto & Memecoin Global Sentiment + Opportunity Scanner
  const MEMECOIN_NAMES: Record<string, string> = {
    DOGE: "Dogecoin",
    SHIB: "Shiba Inu",
    PEPE: "Pepe",
    WIF: "dogwifhat",
    BONK: "Bonk",
    FLOKI: "Floki",
    PENGU: "Pudgy Penguins",
    TRUMP: "Official Trump",
    FARTCOIN: "Fartcoin",
    PNUT: "Peanut the Squirrel",
    POPCAT: "Popcat",
    BOME: "BOOK OF MEME",
    MEME: "Memecoin",
    TURBO: "Turbo",
    NEIRO: "Neiro",
    MEW: "cat in a dogs world",
    BRETT: "Brett",
    MOODENG: "Moo Deng",
    GOAT: "Goatseus Maximus",
    DOGS: "DOGS",
    HMSTR: "Hamster Kombat",
    BABYDOGE: "Baby Doge Coin",
    PEOPLE: "ConstitutionDAO",
    ORDI: "ORDI",
    SATS: "SATS",
    RATS: "RATS",
    ACT: "Act I : The AI Prophecy",
    CHILLGUY: "Just a chill guy",
    SPX: "SPX6900",
    MOG: "Mog Coin",
    MYRO: "Myro",
    SLERF: "Slerf",
    NOT: "Notcoin",
    TOSHI: "Toshi",
    ELON: "Dogelon Mars",
    AIXBT: "aixbt",
    VIRTUAL: "Virtuals Protocol",
    GIGA: "Gigachad",
    WEN: "Wen",
    SUNDOG: "Sundog",
    CATI: "Catizen",
    PIPPIN: "pippin",
    GRIFFAIN: "GRIFFAIN",
    VINE: "Vine Coin",
    MELANIA: "Melania Meme",
    PONKE: "Ponke",
    HIPPO: "sudeng",
    BAN: "Comedian",
    MUBARAK: "Mubarak",
  };

  const TRADFI_OKX_EXCLUDES = new Set([
    "SOXL",
    "NBIS",
    "TQQQ",
    "SQQQ",
    "SPXL",
    "TSLL",
    "TSLQ",
    "TSLA",
    "NVDA",
    "AAPL",
    "MSFT",
    "AMZN",
    "META",
    "GOOGL",
    "GOOG",
    "NFLX",
    "AMD",
    "PLTR",
    "COIN",
    "MSTR",
    "HOOD",
    "ARM",
    "AVGO",
    "INTC",
    "ORCL",
    "CRWD",
    "QQQ",
    "SPY",
    "IWM",
    "SMCI",
    "MU",
    "ASML",
    "TSM",
    "BABA",
    "GLD",
    "SLV",
    "USO",
    "CL",
    "NG",
    "XAU",
    "XAG",
    "EUR",
    "GBP",
    "JPY",
  ]);

  const MAJOR_NAMES: Record<string, string> = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    SOL: "Solana",
    XRP: "XRP",
    BNB: "BNB",
    ADA: "Cardano",
    AVAX: "Avalanche",
    LINK: "Chainlink",
    SUI: "Sui",
    TON: "Toncoin",
    DOT: "Polkadot",
    TRX: "TRON",
    LTC: "Litecoin",
    BCH: "Bitcoin Cash",
    UNI: "Uniswap",
    NEAR: "NEAR Protocol",
    APT: "Aptos",
    ARB: "Arbitrum",
    OP: "Optimism",
    INJ: "Injective",
    AAVE: "Aave",
    RENDER: "Render",
    FET: "Artificial Superintelligence",
    TAO: "Bittensor",
    HBAR: "Hedera",
    XLM: "Stellar",
    ALGO: "Algorand",
    ATOM: "Cosmos",
    FIL: "Filecoin",
    TIA: "Celestia",
    SEI: "Sei",
    STX: "Stacks",
    IMX: "Immutable",
    ICP: "Internet Computer",
    ETC: "Ethereum Classic",
    MKR: "Maker",
    LDO: "Lido DAO",
    ENA: "Ethena",
    ONDO: "Ondo",
    HYPE: "Hyperliquid",
    BERA: "Berachain",
    IP: "Story",
    KAITO: "KAITO",
    BIO: "BIO Protocol",
  };

  const MEMECOIN_KEYS = new Set(Object.keys(MEMECOIN_NAMES));
  const MAJOR_KEYS = new Set(Object.keys(MAJOR_NAMES));

  function translateFngLabel(val: string | undefined, score: number | null): string {
    const raw = (val || "").toLowerCase();
    if (raw.includes("extreme fear")) return "Paura Estrema";
    if (raw.includes("fear")) return "Paura";
    if (raw.includes("extreme greed")) return "Avidità Estrema";
    if (raw.includes("greed")) return "Avidità";
    if (raw.includes("neutral")) return "Neutrale";
    if (score === null) return "N/D";
    if (score <= 24) return "Paura Estrema";
    if (score <= 44) return "Paura";
    if (score <= 55) return "Neutrale";
    if (score <= 75) return "Avidità";
    return "Avidità Estrema";
  }

  let cryptoScanCache: {
    ts: number;
    payload: {
      globalContext: Record<string, unknown>;
      opportunities: {
        instId: string;
        baseSymbol: string;
        name: string;
        sector: "memecoin" | "major" | "altcoin";
        last: number;
        bidPx: number;
        askPx: number;
        open24h: number;
        high24h: number;
        low24h: number;
        spreadPct: number;
        volUsd24h: number;
        changePct24h: number;
        range24hPct: number;
        rangePos: number;
        potentialMovePct: number;
        probabilityPct: number;
        trendLabel:
          | "ALTAMENTE RIALZISTA"
          | "RIALZISTA"
          | "RIMBALZO ATTESO"
          | "RIBASSISTA"
          | "ALTAMENTE RIBASSISTA";
        direction: "L" | "S";
        reasons: string[];
      }[];
    };
  } | null = null;

  async function computeLiveCryptoOpportunities(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cryptoScanCache && now - cryptoScanCache.ts < 15000) {
      return cryptoScanCache.payload;
    }

    const [okxRes, fngRes, cgRes] = await Promise.allSettled([
      fetchJsonWithTimeout("https://www.okx.com/api/v5/market/tickers?instType=SWAP", {}, 9000),
      fetchJsonWithTimeout("https://api.alternative.me/fng/?limit=2", {}, 5000),
      fetchJsonWithTimeout("https://api.coingecko.com/api/v3/global", {}, 5000),
    ]);

    if (okxRes.status !== "fulfilled" || !Array.isArray(okxRes.value?.data)) {
      throw new Error("Impossibile recuperare i ticker live OKX.");
    }

    const rawTickers = okxRes.value.data as Record<string, string>[];

    let fearGreedValue: number | null = null;
    let fearGreedPrevValue: number | null = null;
    let fearGreedRawClass: string | undefined;
    if (fngRes.status === "fulfilled" && Array.isArray(fngRes.value?.data)) {
      const latest = fngRes.value.data[0];
      const prev = fngRes.value.data[1];
      const v0 = Number(latest?.value);
      if (Number.isFinite(v0)) {
        fearGreedValue = v0;
        fearGreedRawClass = latest?.value_classification;
      }
      const v1 = Number(prev?.value);
      if (Number.isFinite(v1)) {
        fearGreedPrevValue = v1;
      }
    }

    let globalMarketCapChange24hPct: number | null = null;
    let btcDominancePct: number | null = null;
    let ethDominancePct: number | null = null;
    if (cgRes.status === "fulfilled" && cgRes.value?.data) {
      const d = cgRes.value.data;
      const mcapChg = Number(d.market_cap_change_percentage_24h_usd);
      if (Number.isFinite(mcapChg)) globalMarketCapChange24hPct = mcapChg;
      const btcDom = Number(d.market_cap_percentage?.btc);
      if (Number.isFinite(btcDom)) btcDominancePct = btcDom;
      const ethDom = Number(d.market_cap_percentage?.eth);
      if (Number.isFinite(ethDom)) ethDominancePct = ethDom;
    }

    const parsedCoins = rawTickers
      .filter((t) => {
        const id = t.instId || "";
        if (!id.endsWith("-USDT-SWAP")) return false;
        const base = id.replace("-USDT-SWAP", "").replace(/^1000/, "");
        if (TRADFI_OKX_EXCLUDES.has(base)) return false;
        const last = Number(t.last);
        const open = Number(t.open24h);
        const bid = Number(t.bidPx);
        const ask = Number(t.askPx);
        return last > 0 && open > 0 && bid > 0 && ask > 0;
      })
      .map((t) => {
        const instId = t.instId;
        const rawBase = instId.replace("-USDT-SWAP", "");
        const normalizedKey = rawBase.replace(/^1000/, "").replace(/^10000/, "");
        const last = Number(t.last);
        const bidPx = Number(t.bidPx);
        const askPx = Number(t.askPx);
        const open24h = Number(t.open24h);
        const high24h = Math.max(Number(t.high24h) || last, last);
        const low24h = Math.min(Number(t.low24h) || last, last);
        const spreadPct = ((askPx - bidPx) / last) * 100;
        const volCcy24h = Number(t.volCcy24h || 0);
        const volUsd24h = volCcy24h > 0 ? volCcy24h * last : Number(t.vol24h || 0);
        const changePct24h = ((last - open24h) / open24h) * 100;
        const range24hPct = low24h > 0 ? ((high24h - low24h) / low24h) * 100 : 0;
        const rangePos =
          high24h > low24h ? Math.max(0, Math.min(1, (last - low24h) / (high24h - low24h))) : 0.5;

        const isMeme =
          MEMECOIN_KEYS.has(normalizedKey) ||
          rawBase.startsWith("1000") ||
          rawBase.includes("DOGE") ||
          rawBase.includes("PEPE") ||
          rawBase.includes("INU");
        const sector = isMeme
          ? ("memecoin" as const)
          : MAJOR_KEYS.has(normalizedKey)
          ? ("major" as const)
          : ("altcoin" as const);

        const friendlyName =
          MEMECOIN_NAMES[normalizedKey] ||
          MAJOR_NAMES[normalizedKey] ||
          rawBase;

        return {
          instId,
          baseSymbol: rawBase,
          name: rawBase !== normalizedKey ? `${friendlyName} (${rawBase})` : friendlyName,
          sector,
          last,
          bidPx,
          askPx,
          open24h,
          high24h,
          low24h,
          spreadPct,
          volUsd24h,
          changePct24h,
          range24hPct,
          rangePos,
        };
      })
      .filter((c) => c.volUsd24h >= 250000 && c.spreadPct <= 0.6);

    const totalPairs = parsedCoins.length;
    const bullishCount = parsedCoins.filter((c) => c.changePct24h > 0).length;
    const okxBullishBreadthPct =
      totalPairs > 0 ? Math.round((bullishCount / totalPairs) * 100) : 50;
    const avg24hChangePct =
      totalPairs > 0
        ? parsedCoins.reduce((s, c) => s + c.changePct24h, 0) / totalPairs
        : 0;
    const memeCoins = parsedCoins.filter((c) => c.sector === "memecoin");
    const memecoinAvg24hChangePct =
      memeCoins.length > 0
        ? memeCoins.reduce((s, c) => s + c.changePct24h, 0) / memeCoins.length
        : 0;

    const btcRow = parsedCoins.find((c) => c.baseSymbol === "BTC");
    const ethRow = parsedCoins.find((c) => c.baseSymbol === "ETH");
    const solRow = parsedCoins.find((c) => c.baseSymbol === "SOL");
    const btcChange24hPct = btcRow ? btcRow.changePct24h : null;
    const ethChange24hPct = ethRow ? ethRow.changePct24h : null;
    const solChange24hPct = solRow ? solRow.changePct24h : null;

    const mcapFactor = globalMarketCapChange24hPct ?? avg24hChangePct;
    let globalRegime:
      | "RIALZISTA FORTE"
      | "RIALZISTA"
      | "MISTO / ROTAZIONE"
      | "RIBASSISTA"
      | "RIBASSISTA FORTE" = "MISTO / ROTAZIONE";
    if (okxBullishBreadthPct >= 70 && mcapFactor >= 2) {
      globalRegime = "RIALZISTA FORTE";
    } else if (okxBullishBreadthPct >= 56 && mcapFactor >= 0.4) {
      globalRegime = "RIALZISTA";
    } else if (okxBullishBreadthPct <= 30 && mcapFactor <= -2) {
      globalRegime = "RIBASSISTA FORTE";
    } else if (okxBullishBreadthPct <= 44 && mcapFactor <= -0.4) {
      globalRegime = "RIBASSISTA";
    }

    const btcBench = btcChange24hPct ?? avg24hChangePct;
    const fngBias = fearGreedValue !== null ? (fearGreedValue - 50) / 50 : 0;

    const opportunities = parsedCoins.map((c) => {
      const relVsBtc = c.changePct24h - btcBench;
      const liqScore = Math.min(9, Math.max(0, (Math.log10(Math.max(1, c.volUsd24h)) - 5.4) * 2.4));
      const spreadScore = c.spreadPct <= 0.03 ? 6 : c.spreadPct <= 0.08 ? 4 : c.spreadPct <= 0.2 ? 2 : 0;

      let trendLabel:
        | "ALTAMENTE RIALZISTA"
        | "RIALZISTA"
        | "RIMBALZO ATTESO"
        | "RIBASSISTA"
        | "ALTAMENTE RIBASSISTA";
      let direction: "L" | "S" = "L";

      const strongBull =
        c.changePct24h >= 4.0 && c.rangePos >= 0.62 && relVsBtc >= 0.5;
      const modBull = c.changePct24h >= 1.2 && c.rangePos >= 0.5;
      const strongBear =
        c.changePct24h <= -4.0 && c.rangePos <= 0.38 && relVsBtc <= -0.5;
      const modBear = c.changePct24h <= -1.2 && c.rangePos <= 0.5;
      const oversoldBounce =
        c.changePct24h <= -4.5 &&
        c.rangePos >= 0.25 &&
        (okxBullishBreadthPct >= 50 || (fearGreedValue !== null && fearGreedValue <= 32));

      if (strongBull) {
        trendLabel = "ALTAMENTE RIALZISTA";
        direction = "L";
      } else if (strongBear && !oversoldBounce) {
        trendLabel = "ALTAMENTE RIBASSISTA";
        direction = "S";
      } else if (oversoldBounce && okxBullishBreadthPct >= 52) {
        trendLabel = "RIMBALZO ATTESO";
        direction = "L";
      } else if (modBull || (c.changePct24h >= 0 && c.rangePos >= 0.55)) {
        trendLabel = "RIALZISTA";
        direction = "L";
      } else if (modBear || (c.changePct24h < 0 && c.rangePos <= 0.45)) {
        trendLabel = "RIBASSISTA";
        direction = "S";
      } else {
        direction = c.rangePos >= 0.5 ? "L" : "S";
        trendLabel = direction === "L" ? "RIALZISTA" : "RIBASSISTA";
      }

      const remainingRoomPct =
        direction === "L"
          ? Math.max(0.8, ((c.high24h - c.last) / c.last) * 100 + c.range24hPct * 0.382)
          : Math.max(0.8, ((c.last - c.low24h) / c.last) * 100 + c.range24hPct * 0.382);
      const potentialMovePct = Number(
        Math.min(35, Math.max(1.5, remainingRoomPct * (c.sector === "memecoin" ? 1.15 : 0.95))).toFixed(1)
      );

      const momMag = Math.tanh(Math.abs(c.changePct24h) / 10) * 16;
      const relMag = Math.tanh((direction === "L" ? relVsBtc : -relVsBtc) / 8) * 9;
      const rangeAlign =
        direction === "L" ? (c.rangePos - 0.5) * 22 : (0.5 - c.rangePos) * 22;
      const breadthAlign =
        direction === "L"
          ? (okxBullishBreadthPct - 50) * 0.22
          : (50 - okxBullishBreadthPct) * 0.22;
      const sentimentAlign = direction === "L" ? fngBias * 6 : -fngBias * 5;
      const memeBonus =
        c.sector === "memecoin" &&
        ((direction === "L" && memecoinAvg24hChangePct > btcBench) ||
          (direction === "S" && memecoinAvg24hChangePct < btcBench))
          ? 4
          : 0;
      const strongBonus =
        trendLabel === "ALTAMENTE RIALZISTA" || trendLabel === "ALTAMENTE RIBASSISTA"
          ? 4
          : 0;

      const rawProb =
        42 +
        momMag +
        relMag +
        rangeAlign +
        breadthAlign +
        sentimentAlign +
        liqScore +
        spreadScore +
        memeBonus +
        strongBonus;

      const probabilityPct = Math.round(Math.max(20, Math.min(91, rawProb)));

      const reasons: string[] = [];
      if (direction === "L") {
        if (c.rangePos >= 0.72) reasons.push("Vicino ai massimi 24h (breakout)");
        else if (trendLabel === "RIMBALZO ATTESO") reasons.push("Ipervenduto su supporto 24h");
        if (relVsBtc >= 2) reasons.push(`Forza relativa +${relVsBtc.toFixed(1)}% vs BTC`);
        if (okxBullishBreadthPct >= 58) reasons.push(`Mercato globale verde (${okxBullishBreadthPct}%)`);
        if (c.sector === "memecoin" && memecoinAvg24hChangePct > 1.5) {
          reasons.push("Rotazione attiva sulle Memecoin");
        }
      } else {
        if (c.rangePos <= 0.28) reasons.push("Pressione sui minimi 24h");
        if (relVsBtc <= -2) reasons.push(`Debolezza ${relVsBtc.toFixed(1)}% vs BTC`);
        if (okxBullishBreadthPct <= 45) reasons.push(`Sentore globale ribassista (${100 - okxBullishBreadthPct}% rossi)`);
      }
      if (c.volUsd24h >= 50_000_000) reasons.push("Liquidità istituzionale elevata");
      else if (reasons.length === 0) reasons.push(`Volatilità 24h ${c.range24hPct.toFixed(1)}%`);

      return {
        ...c,
        potentialMovePct,
        probabilityPct,
        trendLabel,
        direction,
        reasons: reasons.slice(0, 3),
      };
    });

    opportunities.sort((a, b) => {
      if (b.probabilityPct !== a.probabilityPct) return b.probabilityPct - a.probabilityPct;
      if (b.potentialMovePct !== a.potentialMovePct) return b.potentialMovePct - a.potentialMovePct;
      return b.volUsd24h - a.volUsd24h;
    });

    const topGeneral = opportunities.slice(0, 85);
    const includedIds = new Set(topGeneral.map((o) => o.instId));
    const extraMemes = opportunities
      .filter((o) => o.sector === "memecoin" && !includedIds.has(o.instId))
      .slice(0, 35);
    const mergedOpportunities = [...topGeneral, ...extraMemes].sort((a, b) => {
      if (b.probabilityPct !== a.probabilityPct) return b.probabilityPct - a.probabilityPct;
      if (b.potentialMovePct !== a.potentialMovePct) return b.potentialMovePct - a.potentialMovePct;
      return b.volUsd24h - a.volUsd24h;
    });

    const payload = {
      globalContext: {
        fearGreedValue,
        fearGreedLabel: translateFngLabel(fearGreedRawClass, fearGreedValue),
        fearGreedPrevValue,
        globalMarketCapChange24hPct,
        btcDominancePct,
        ethDominancePct,
        okxTotalPairs: totalPairs,
        okxBullishBreadthPct,
        avg24hChangePct,
        memecoinAvg24hChangePct,
        btcChange24hPct,
        ethChange24hPct,
        solChange24hPct,
        globalRegime,
        updatedAt: now,
      },
      opportunities: mergedOpportunities,
    };

    cryptoScanCache = { ts: now, payload };
    return payload;
  }

  function calcEmaValue(values: number[], period: number): number {
    if (values.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  function calcRsi14Value(closes: number[]): number {
    if (closes.length < 15) return 50;
    let gains = 0;
    let losses = 0;
    const start = Math.max(1, closes.length - 14);
    for (let i = start; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    if (losses === 0) return 85;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  function calcBollingerWidthPct(closes: number[], period = 20): number {
    if (closes.length < period) return 1.5;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    if (mean <= 0) return 1.5;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return ((4 * std) / mean) * 100;
  }

  async function fetchCandleSnapshot(instId: string) {
    const [res1m, res5m] = await Promise.allSettled([
      fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1m&limit=60`,
        {},
        6500
      ),
      fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=5m&limit=24`,
        {},
        5500
      ),
    ]);

    const json = res1m.status === "fulfilled" ? res1m.value : null;
    const rows = Array.isArray(json?.data) ? (json.data as string[][]) : [];
    const chronological = [...rows].reverse();
    const opens = chronological.map((r) => Number(r[1])).filter((n) => Number.isFinite(n) && n > 0);
    const highs = chronological.map((r) => Number(r[2])).filter((n) => Number.isFinite(n) && n > 0);
    const lows = chronological.map((r) => Number(r[3])).filter((n) => Number.isFinite(n) && n > 0);
    const closes = chronological.map((r) => Number(r[4])).filter((n) => Number.isFinite(n) && n > 0);
    const vols = chronological.map((r) => Number(r[5] || 0));
    const lastRow = chronological[chronological.length - 1];
    const lastCandleTs = Number(lastRow?.[0] || 0);

    if (closes.length < 20) return null;
    const last = closes[closes.length - 1];
    const prev1 = closes[closes.length - 2] || last;
    const ema9 = calcEmaValue(closes.slice(-30), 9);
    const ema21 = calcEmaValue(closes.slice(-45), 21);
    const ema50 = calcEmaValue(closes, 50);
    const rsi14 = calcRsi14Value(closes);
    const bbWidthPct = calcBollingerWidthPct(closes, 20);
    const recentHigh = Math.max(...highs.slice(-40));
    const recentLow = Math.min(...lows.slice(-40));
    const fibDepth = recentHigh > recentLow ? (recentHigh - last) / (recentHigh - recentLow) : 0.5;
    const avgVol = vols.length > 6 ? vols.slice(0, -3).reduce((a, b) => a + b, 0) / (vols.length - 3) : 1;
    const recentVol = vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const volSurgeRatio = avgVol > 0 ? Number((recentVol / avgVol).toFixed(2)) : 1;
    const prev3Close = closes.length >= 4 ? closes[closes.length - 4] : closes[0];
    const vel3mPct =
      prev3Close > 0 ? Number((((last - prev3Close) / prev3Close) * 100).toFixed(3)) : 0;
    const vel1mPct = prev1 > 0 ? Number((((last - prev1) / prev1) * 100).toFixed(3)) : 0;
    const emaSlopeDir: "L" | "S" = ema9 >= ema21 ? "L" : "S";
    const emaAligned =
      (ema9 > ema21 && ema21 > ema50) || (ema9 < ema21 && ema21 < ema50);

    // 14-period True Range % (ATR 1m%) for dynamic stops/targets
    let trSum = 0;
    const atrStart = Math.max(1, closes.length - 14);
    for (let i = atrStart; i < closes.length; i++) {
      const h = highs[i] ?? closes[i];
      const l = lows[i] ?? closes[i];
      const pc = closes[i - 1] ?? closes[i];
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      trSum += tr;
    }
    const atr1m = trSum / Math.max(1, closes.length - atrStart);
    const atr1mPct = last > 0 ? Number(((atr1m / last) * 100).toFixed(3)) : 0.14;

    // Session/40-bar VWAP & distance
    let pvSum = 0;
    let vSum = 0;
    const vwapStart = Math.max(0, closes.length - 40);
    for (let i = vwapStart; i < closes.length; i++) {
      const typical = ((highs[i] || closes[i]) + (lows[i] || closes[i]) + closes[i]) / 3;
      const w = Math.max(0.0001, vols[i] || 1);
      pvSum += typical * w;
      vSum += w;
    }
    const vwap40 = vSum > 0 ? pvSum / vSum : last;
    const vwapDistPct = vwap40 > 0 ? Number((((last - vwap40) / vwap40) * 100).toFixed(3)) : 0;

    // MACD 12/26/9 histogram slope
    const macdSeries: number[] = [];
    for (let k = Math.max(12, closes.length - 14); k <= closes.length; k++) {
      const slice = closes.slice(0, k);
      macdSeries.push(calcEmaValue(slice, 12) - calcEmaValue(slice, 26));
    }
    const macdHist = macdSeries.length > 0 ? macdSeries[macdSeries.length - 1] - calcEmaValue(macdSeries, 9) : 0;
    const macdPrev = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] - calcEmaValue(macdSeries.slice(0, -1), 9) : macdHist;
    const macdDir: "L" | "S" = macdHist >= macdPrev && macdHist >= 0 ? "L" : macdHist <= macdPrev && macdHist <= 0 ? "S" : emaSlopeDir;

    // Anti-exhaustion candle wick rejection check
    const curOpen = opens[opens.length - 1] ?? prev1;
    const curHigh = highs[highs.length - 1] ?? last;
    const curLow = lows[lows.length - 1] ?? last;
    const bodySize = Math.max(last * 0.0001, Math.abs(last - curOpen));
    const upperWick = Math.max(0, curHigh - Math.max(curOpen, last));
    const lowerWick = Math.max(0, Math.min(curOpen, last) - curLow);
    const upperWickReject = upperWick > bodySize * 1.9 && upperWick / last > 0.0012;
    const lowerWickReject = lowerWick > bodySize * 1.9 && lowerWick / last > 0.0012;

    // 5m multi-timeframe alignment
    let dir5m: "L" | "S" | "FLAT" = "FLAT";
    let vel5mPct = 0;
    if (res5m.status === "fulfilled" && Array.isArray(res5m.value?.data)) {
      const c5 = [...(res5m.value.data as string[][])]
        .reverse()
        .map((r) => Number(r[4]))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (c5.length >= 12) {
        const ema9_5m = calcEmaValue(c5, 9);
        const ema21_5m = calcEmaValue(c5, 21);
        const last5 = c5[c5.length - 1];
        const prev5 = c5[c5.length - 2] || last5;
        vel5mPct = prev5 > 0 ? Number((((last5 - prev5) / prev5) * 100).toFixed(3)) : 0;
        if (ema9_5m > ema21_5m && last5 >= ema9_5m * 0.9992) dir5m = "L";
        else if (ema9_5m < ema21_5m && last5 <= ema9_5m * 1.0008) dir5m = "S";
      }
    }

    const last4High = Math.max(...highs.slice(-4));
    const last4Low = Math.min(...lows.slice(-4));
    const recentRangePct =
      last4Low > 0 ? Number((((last4High - last4Low) / last4Low) * 100).toFixed(3)) : 0;
    const lastCandleAgeMs = lastCandleTs > 0 ? Math.max(0, Date.now() - lastCandleTs) : 0;

    return {
      last,
      ema9,
      ema21,
      ema50,
      rsi14: Number(rsi14.toFixed(1)),
      atr1mPct,
      bbWidthPct: Number(bbWidthPct.toFixed(3)),
      vwapDistPct,
      macdDir,
      upperWickReject,
      lowerWickReject,
      dir5m,
      vel5mPct,
      fibDepth: Number(fibDepth.toFixed(3)),
      volSurgeRatio,
      vel1mPct,
      vel3mPct,
      emaSlopeDir,
      emaAligned,
      recentRangePct,
      lastCandleAgeMs,
      recentCloses: closes.slice(-8),
    };
  }

  interface RawMultiHorizonBundle {
    hours: HorizonTimeframeStatServer | null;
    days: HorizonTimeframeStatServer | null;
    weeks: HorizonTimeframeStatServer | null;
    monthsYears: HorizonTimeframeStatServer | null;
  }

  const multiHorizonCache = new Map<string, { ts: number; bundle: RawMultiHorizonBundle }>();
  const MULTI_HORIZON_TTL_MS = 10 * 60 * 1000;

  function parseHorizonBars(
    rows: unknown,
    label: string,
    bar: string
  ): HorizonTimeframeStatServer | null {
    if (!Array.isArray(rows) || rows.length < 3) return null;
    const chronological = [...(rows as string[][])].reverse();
    const highs = chronological.map((r) => Number(r[2])).filter((n) => Number.isFinite(n) && n > 0);
    const lows = chronological.map((r) => Number(r[3])).filter((n) => Number.isFinite(n) && n > 0);
    const closes = chronological.map((r) => Number(r[4])).filter((n) => Number.isFinite(n) && n > 0);
    if (closes.length < 3) return null;

    const first = closes[0];
    const last = closes[closes.length - 1];
    const changePct = first > 0 ? Number((((last - first) / first) * 100).toFixed(2)) : 0;
    const maxHigh = highs.length > 0 ? Math.max(...highs) : Math.max(...closes);
    const minLow = lows.length > 0 ? Math.min(...lows) : Math.min(...closes);
    const rangePosPct =
      maxHigh > minLow
        ? Math.round(Math.max(0, Math.min(100, ((last - minLow) / (maxHigh - minLow)) * 100)))
        : 50;

    const fastEma = calcEmaValue(closes, Math.min(5, Math.max(2, Math.floor(closes.length / 3))));
    const slowEma = calcEmaValue(closes, Math.min(14, Math.max(4, Math.floor(closes.length * 0.7))));
    let trend: "L" | "S" | "FLAT" = "FLAT";
    if (changePct >= 0.45 && fastEma >= slowEma * 0.998) trend = "L";
    else if (changePct <= -0.45 && fastEma <= slowEma * 1.002) trend = "S";
    else if (Math.abs(changePct) >= 1.2) trend = changePct > 0 ? "L" : "S";

    return {
      label,
      bar,
      barsAnalyzed: closes.length,
      changePct,
      trend,
      rangePosPct,
    };
  }

  async function fetchRawMultiHorizonBundle(instId: string): Promise<RawMultiHorizonBundle> {
    const now = Date.now();
    const cached = multiHorizonCache.get(instId);
    if (cached && now - cached.ts < MULTI_HORIZON_TTL_MS) {
      return cached.bundle;
    }

    const [h1Res, d1Res, w1Res, m1Res] = await Promise.allSettled([
      fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1H&limit=24`,
        {},
        4500
      ),
      fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1Dutc&limit=30`,
        {},
        4500
      ),
      fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1Wutc&limit=26`,
        {},
        4500
      ),
      fetchJsonWithTimeout(
        `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1Mutc&limit=36`,
        {},
        4500
      ),
    ]);

    const bundle: RawMultiHorizonBundle = {
      hours:
        h1Res.status === "fulfilled"
          ? parseHorizonBars(h1Res.value?.data, "Ultime 24 Ore", "1H")
          : null,
      days:
        d1Res.status === "fulfilled"
          ? parseHorizonBars(d1Res.value?.data, "Ultimi 30 Giorni", "1D")
          : null,
      weeks:
        w1Res.status === "fulfilled"
          ? parseHorizonBars(w1Res.value?.data, "Ultime 26 Sett.", "1W")
          : null,
      monthsYears:
        m1Res.status === "fulfilled"
          ? parseHorizonBars(m1Res.value?.data, "Mesi / Anni", "1M")
          : null,
    };

    multiHorizonCache.set(instId, { ts: now, bundle });
    if (multiHorizonCache.size > 120) {
      const oldestKey = multiHorizonCache.keys().next().value;
      if (oldestKey) multiHorizonCache.delete(oldestKey);
    }
    return bundle;
  }

  function buildMultiHorizonEstimate(
    bundle: RawMultiHorizonBundle,
    direction: "L" | "S",
    horizonMode: BotHorizonModeServer
  ): MultiHorizonEstimateServer {
    const weights: Record<BotHorizonModeServer, { h: number; d: number; w: number; m: number }> = {
      scalping: { h: 0.52, d: 0.28, w: 0.12, m: 0.08 },
      intraday: { h: 0.34, d: 0.38, w: 0.18, m: 0.1 },
      swing: { h: 0.12, d: 0.34, w: 0.34, m: 0.2 },
      macro: { h: 0.06, d: 0.14, w: 0.35, m: 0.45 },
    };
    const wCfg = weights[horizonMode] || weights.scalping;

    const scorePart = (stat: HorizonTimeframeStatServer | null, weight: number) => {
      if (!stat) return { pts: 0, usedW: 0 };
      let val = 55;
      if (stat.trend === direction) val = 92;
      else if (stat.trend === "FLAT") val = 60;
      else val = 24;
      return { pts: val * weight, usedW: weight };
    };

    const parts = [
      scorePart(bundle.hours, wCfg.h),
      scorePart(bundle.days, wCfg.d),
      scorePart(bundle.weeks, wCfg.w),
      scorePart(bundle.monthsYears, wCfg.m),
    ];
    const totalW = parts.reduce((s, p) => s + p.usedW, 0);
    const alignmentScore =
      totalW > 0
        ? Math.round(parts.reduce((s, p) => s + p.pts, 0) / totalW)
        : 60;

    const fmt = (tag: string, stat: HorizonTimeframeStatServer | null) =>
      stat
        ? `${tag} ${stat.changePct >= 0 ? "+" : ""}${stat.changePct.toFixed(1)}% (${stat.trend})`
        : null;
    const segments = [
      fmt("Ore", bundle.hours),
      fmt("Giorni", bundle.days),
      fmt("Sett.", bundle.weeks),
      fmt("Mesi/Anni", bundle.monthsYears),
    ].filter(Boolean);

    const summary =
      segments.length > 0
        ? `${segments.join(" · ")} → Allineamento ${alignmentScore}%`
        : "Stima multi-orizzonte live OKX";

    return {
      horizonMode,
      hours: bundle.hours,
      days: bundle.days,
      weeks: bundle.weeks,
      monthsYears: bundle.monthsYears,
      alignmentScore,
      summary,
    };
  }

  async function fetchMultiHorizonEstimate(
    instId: string,
    direction: "L" | "S",
    horizonMode: BotHorizonModeServer
  ): Promise<MultiHorizonEstimateServer> {
    const bundle = await fetchRawMultiHorizonBundle(instId);
    return buildMultiHorizonEstimate(bundle, direction, horizonMode);
  }

  app.get("/api/crypto/opportunities", async (req, res) => {
    try {
      const payload = await computeLiveCryptoOpportunities(req.query.refresh === "1");
      res.setHeader("Cache-Control", "no-store");
      res.json(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore scansione mercato crypto live";
      res.status(502).json({ error: message });
    }
  });

  // Pre-Breakout Memecoin & Crypto Detector (Prima dell'esplosione)
  app.get("/api/crypto/prebreakout", async (req, res) => {
    try {
      const scan = await computeLiveCryptoOpportunities(req.query.refresh === "1");
      const candidates = scan.opportunities
        .filter((o) => o.volUsd24h >= 500_000 && o.spreadPct <= 0.3)
        .filter((o) => {
          const nearUpperCoil = o.rangePos >= 0.66 && o.changePct24h >= -1.5 && o.changePct24h <= 16;
          const memeEarlyWave = o.sector === "memecoin" && o.changePct24h >= 1.5 && o.changePct24h <= 20;
          const fibSpring = o.changePct24h <= -3.0 && o.rangePos >= 0.25 && o.rangePos <= 0.52;
          const bearTrigger = o.changePct24h <= -2.5 && o.rangePos <= 0.26;
          return nearUpperCoil || memeEarlyWave || fibSpring || bearTrigger;
        })
        .sort((a, b) => {
          const scoreA = a.probabilityPct + (a.sector === "memecoin" ? 5 : 0) + (a.rangePos >= 0.72 ? 4 : 0);
          const scoreB = b.probabilityPct + (b.sector === "memecoin" ? 5 : 0) + (b.rangePos >= 0.72 ? 4 : 0);
          return scoreB - scoreA;
        })
        .slice(0, 8);

      const candleStats = await Promise.allSettled(
        candidates.slice(0, 6).map((c) => fetchCandleSnapshot(c.instId))
      );

      const signals = candidates.map((c, idx) => {
        const snap = idx < candleStats.length && candleStats[idx].status === "fulfilled"
          ? candleStats[idx].value
          : null;

        let technique = "Breakout Range 24h + Sentiment";
        let triggerNote = `${c.reasons[0] || "Compressione volatilità"} · Spazio stimato +${c.potentialMovePct}%`;
        let urgency: "IMMINENTE" | "ALTA" | "RADAR" = c.probabilityPct >= 74 ? "IMMINENTE" : c.probabilityPct >= 66 ? "ALTA" : "RADAR";

        if (snap) {
          if (snap.bbWidthPct <= 0.65 && snap.volSurgeRatio >= 1.35) {
            technique = "Bollinger Squeeze Pre-Esplosione";
            triggerNote = `Banda compressa (${snap.bbWidthPct}%) con picco volumi ${snap.volSurgeRatio}x · RSI ${snap.rsi14}`;
            urgency = "IMMINENTE";
          } else if (c.direction === "L" && snap.ema9 > snap.ema21 && snap.rsi14 >= 52 && snap.rsi14 <= 72) {
            technique = "Incrocio EMA9/21 + Volumi";
            triggerNote = `Trend 1m rialzista prima della rottura massimi · Volumi ${snap.volSurgeRatio}x · RSI ${snap.rsi14}`;
            if (snap.volSurgeRatio >= 1.5) urgency = "IMMINENTE";
          } else if (snap.fibDepth >= 0.35 && snap.fibDepth <= 0.72) {
            technique = "Ritracciamento Fibonacci Golden Zone";
            triggerNote = `Prezzo su Fibonacci ${(snap.fibDepth * 100).toFixed(0)}% · Pronto al rimbalzo con RSI ${snap.rsi14}`;
          } else if (c.direction === "S" && snap.ema9 < snap.ema21) {
            technique = "Pressione Ribassista EMA9 < EMA21";
            triggerNote = `Debolezza sotto medie veloci · RSI ${snap.rsi14} · Volumi ${snap.volSurgeRatio}x`;
          }
        }

        return {
          instId: c.instId,
          baseSymbol: c.baseSymbol,
          name: c.name,
          sector: c.sector,
          direction: c.direction,
          lastPrice: c.last,
          changePct24h: c.changePct24h,
          range24hPct: c.range24hPct,
          probabilityPct: c.probabilityPct,
          potentialMovePct: c.potentialMovePct,
          technique,
          triggerNote,
          urgency,
          volUsd24h: c.volUsd24h,
        };
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        globalContext: scan.globalContext,
        signals,
        generatedAt: Date.now(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore rilevazione segnali pre-breakout";
      res.status(502).json({ error: message });
    }
  });

  // Gemini AI Global Crypto & Memecoin Sentiment Brief
  app.post("/api/ai/crypto-macro-brief", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "Chiave GEMINI_API_KEY non configurata nel pannello Secrets del server.",
      });
      return;
    }

    try {
      const { globalContext, topBullish, topBearish, topMemecoins } = req.body || {};

      const prompt = `Sei lo stratega macro crypto & memecoin di un hedge fund quantitativo.
Analizza i dati LIVE reali del mercato globale e delle migliori opportunità OKX (incluse memecoin) e produci una sintesi operativa chiara in italiano.

CONTESTO GLOBALE LIVE:
${JSON.stringify(globalContext || {})}

TOP RIALZISTE LIVE (OKX):
${JSON.stringify((topBullish || []).slice(0, 6))}

TOP RIBASSISTE LIVE (OKX):
${JSON.stringify((topBearish || []).slice(0, 6))}

TOP MEMECOIN LIVE (OKX):
${JSON.stringify((topMemecoins || []).slice(0, 6))}

Fornisci un'analisi concreta basata esclusivamente su questi numeri reali: sentore globale, direzione prevalente, rotazione su Bitcoin/Altcoin/Memecoin e principali rischi.`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: "Titolo sintetico dello stato globale crypto (max 10 parole).",
              },
              globalSentimentSummary: {
                type: Type.STRING,
                description: "Sintesi chiara del sentore globale e della forza BTC/mercato (max 2 frasi).",
              },
              memecoinOutlook: {
                type: Type.STRING,
                description: "Stato della rotazione e dei volumi sulle memecoin (max 2 frasi).",
              },
              topBullishPick: {
                type: Type.STRING,
                description: "Miglior opportunità rialzista attuale e perché (1 frase).",
              },
              topBearishPick: {
                type: Type.STRING,
                description: "Miglior opportunità ribassista/short o copertura attuale (1 frase).",
              },
              riskNote: {
                type: Type.STRING,
                description: "Avvertenza sintetica su volatilità o livelli chiave (1 frase).",
              },
            },
            required: [
              "headline",
              "globalSentimentSummary",
              "memecoinOutlook",
              "topBullishPick",
              "topBearishPick",
              "riskNote",
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({
        headline: String(parsed.headline || "Analisi Globale Crypto Live"),
        globalSentimentSummary: String(parsed.globalSentimentSummary || ""),
        memecoinOutlook: String(parsed.memecoinOutlook || ""),
        topBullishPick: String(parsed.topBullishPick || ""),
        topBearishPick: String(parsed.topBearishPick || ""),
        riskNote: String(parsed.riskNote || ""),
        generatedAt: Date.now(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore analisi macro IA Gemini";
      res.status(502).json({ error: message });
    }
  });

  // Gemini AI Pre-Trade Validation Gate (Server-side @google/genai)
  app.post("/api/ai/validate-trade", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "Chiave GEMINI_API_KEY non configurata nel pannello Secrets del server.",
      });
      return;
    }

    try {
      const payload = req.body || {};
      const {
        pair,
        name,
        direction,
        currentPrice,
        spreadPct,
        score,
        fibDepth,
        tpPct,
        slPct,
        tpRoiPct,
        rrNet,
        confirmations,
        rsi14,
        e20,
        e60,
        macdHist,
        supertrendDir,
        trend5m,
        atrPct,
        recentCloses,
        gates,
      } = payload;

      const prompt = `Sei il comitato di rischio quantitativo di un desk di trading ad alta precisione (scalping & swing Fibonacci multi-timeframe).
Valuta questo setup LIVE prima dell'apertura dell'ordine. L'obiettivo è proteggere il capitale ed entrare SOLO se il momentum, la struttura Fibonacci e il contesto multi-timeframe giustificano un target minimo >= +10% ROI sul margine.

ASSET: ${name} (${pair})
DIREZIONE PROPOSTA: ${direction === "L" ? "LONG (Acquisto)" : "SHORT (Vendita)"}
PREZZO LIVE: ${currentPrice}
SPREAD BID/ASK: ${Number(spreadPct || 0).toFixed(4)}%
SCORE TECNICO: ${score}/100
RITRACCIAMENTO FIBONACCI: ${(Number(fibDepth || 0) * 100).toFixed(1)}% (Zona ideale 38.2%-78.6%)
TREND 5M SUPERIORE: ${trend5m || "NEUTRALE"}
SUPERTREND 1M: ${supertrendDir || "N/D"}
EMA20 / EMA60: ${e20} / ${e60}
RSI 14: ${Number(rsi14 || 50).toFixed(1)}
MACD HIST: ${Number(macdHist || 0).toFixed(6)}
ATR VOLATILITÀ (14): ${Number(atrPct || 0).toFixed(3)}%
CONFERME TECNICHE: ${(confirmations || []).join(", ")}
TAKE PROFIT PREZZO: +${Number(tpPct || 0).toFixed(3)}% (ROI netto stimato sul margine: +${Number(tpRoiPct || 10).toFixed(1)}%)
STOP LOSS PREZZO: -${Number(slPct || 0).toFixed(3)}%
RAPPORTO R:R NETTO: ${Number(rrNet || 0).toFixed(2)}x
ULTIME 15 CHIUSURE 1M: ${JSON.stringify((recentCloses || []).slice(-15))}
CONTROLLI PRELIMINARI SUPERATI: ${JSON.stringify(gates || [])}

Decidi in modo rigoroso se APPROVARE o RIFIUTARE l'apertura immediata della posizione.
Se il trend 5m è contrario alla direzione, o RSI è in estremo sfavorevole (>78 per LONG, <22 per SHORT), o le ultime candele mostrano inversione violenta contraria, RIFIUTA (approved: false, recommendedSide: "HOLD").
Altrimenti, se il setup è coerente per puntare ad almeno +10% ROI con trailing profit, APPROVA (approved: true).
Fornisci una motivazione chiara e sintetica in italiano.`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              approved: {
                type: Type.BOOLEAN,
                description: "True solo se l'operazione supera la verifica quantitativa IA.",
              },
              confidence: {
                type: Type.INTEGER,
                description: "Livello di confidenza da 0 a 100.",
              },
              recommendedSide: {
                type: Type.STRING,
                description: "Direzione consigliata: L, S oppure HOLD.",
              },
              reasoning: {
                type: Type.STRING,
                description: "Motivazione tecnica chiara in italiano (max 2 frasi).",
              },
              keyFactors: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "2-4 punti chiave verificati.",
              },
            },
            required: ["approved", "confidence", "recommendedSide", "reasoning", "keyFactors"],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText);
      res.json({
        approved: Boolean(parsed.approved),
        confidence: Number(parsed.confidence || 0),
        recommendedSide:
          parsed.recommendedSide === "L" || parsed.recommendedSide === "S"
            ? parsed.recommendedSide
            : "HOLD",
        reasoning: String(parsed.reasoning || "Analisi completata."),
        keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 4) : [],
        checkedAt: Date.now(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore validazione AI Gemini";
      res.status(502).json({ error: message });
    }
  });

  // OKX Copy Trading Private API Connection (HMAC-SHA256 in server memory)
  app.post("/api/okx/copytrading/connect", async (req, res) => {
    try {
      const { apiKey, secretKey, passphrase, simulated } = req.body || {};
      if (!apiKey || !secretKey || !passphrase) {
        res.status(400).json({ error: "Inserisci API Key, Secret Key e Passphrase OKX." });
        return;
      }

      const candidateSession: OkxApiSession = {
        apiKey: String(apiKey).trim(),
        secretKey: String(secretKey).trim(),
        passphrase: String(passphrase).trim(),
        simulated: Boolean(simulated),
        connectedAt: Date.now(),
        maskedKey: `${String(apiKey).trim().slice(0, 5)}…${String(apiKey).trim().slice(-4)}`,
      };

      const { json } = await okxPrivateRequest(
        candidateSession,
        "GET",
        "/api/v5/account/balance"
      );

      if (json?.code !== "0") {
        res.status(401).json({
          error: json?.msg || `Autenticazione OKX rifiutata (code ${json?.code || "?"})`,
        });
        return;
      }

      okxSession = candidateSession;
      const details = json.data?.[0]?.details || [];
      const totalEq = Number(json.data?.[0]?.totalEq || 0);

      res.json({
        connected: true,
        simulated: candidateSession.simulated,
        maskedKey: candidateSession.maskedKey,
        totalEqUsd: totalEq,
        balances: details.slice(0, 8).map((b: Record<string, string>) => ({
          ccy: b.ccy,
          availBal: Number(b.availBal || 0),
          eqUsd: Number(b.eqUsd || 0),
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore connessione OKX";
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/okx/copytrading/disconnect", (_req, res) => {
    okxSession = null;
    res.json({ connected: false });
  });

  app.get("/api/okx/copytrading/status", async (_req, res) => {
    if (!okxSession) {
      res.json({ connected: false });
      return;
    }

    try {
      const [balRes, posRes, copyRes] = await Promise.allSettled([
        okxPrivateRequest(okxSession, "GET", "/api/v5/account/balance"),
        okxPrivateRequest(okxSession, "GET", "/api/v5/account/positions"),
        okxPrivateRequest(okxSession, "GET", "/api/v5/copytrading/current-subpositions"),
      ]);

      const balJson = balRes.status === "fulfilled" ? balRes.value.json : null;
      const posJson = posRes.status === "fulfilled" ? posRes.value.json : null;
      const copyJson = copyRes.status === "fulfilled" ? copyRes.value.json : null;

      if (balJson?.code && balJson.code !== "0") {
        res.status(401).json({ connected: false, error: balJson.msg || "Sessione OKX non valida" });
        return;
      }

      const details = balJson?.data?.[0]?.details || [];
      const totalEqUsd = Number(balJson?.data?.[0]?.totalEq || 0);
      const livePositions = Array.isArray(posJson?.data)
        ? posJson.data.map((p: Record<string, string>) => ({
            instId: p.instId,
            posSide: p.posSide,
            pos: Number(p.pos || 0),
            avgPx: Number(p.avgPx || 0),
            upl: Number(p.upl || 0),
            uplRatio: Number(p.uplRatio || 0) * 100,
            lever: Number(p.lever || 1),
          }))
        : [];
      const copySubpositions = Array.isArray(copyJson?.data) ? copyJson.data : [];

      res.json({
        connected: true,
        simulated: okxSession.simulated,
        maskedKey: okxSession.maskedKey,
        totalEqUsd,
        balances: details.slice(0, 8).map((b: Record<string, string>) => ({
          ccy: b.ccy,
          availBal: Number(b.availBal || 0),
          eqUsd: Number(b.eqUsd || 0),
        })),
        positions: livePositions,
        copySubpositionsCount: copySubpositions.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore stato OKX";
      res.status(502).json({ connected: Boolean(okxSession), error: message });
    }
  });

  app.post("/api/okx/copytrading/order", async (req, res) => {
    if (!okxSession) {
      res.status(401).json({ error: "API OKX Copy Trading non connessa." });
      return;
    }

    try {
      const { instId, side, tdMode, sz, lever, tpTriggerPx, slTriggerPx } = req.body || {};
      if (!instId || !side || !sz) {
        res.status(400).json({ error: "Parametri ordine OKX incompleti." });
        return;
      }

      // Best-effort set leverage on SWAP
      if (String(instId).endsWith("-SWAP") && lever) {
        await okxPrivateRequest(okxSession, "POST", "/api/v5/account/set-leverage", {
          instId: String(instId),
          lever: String(lever),
          mgnMode: tdMode === "isolated" ? "isolated" : "cross",
        }).catch(() => {});
      }

      const orderBody: Record<string, unknown> = {
        instId: String(instId),
        tdMode: tdMode === "isolated" ? "isolated" : "cross",
        side: side === "buy" ? "buy" : "sell",
        ordType: "market",
        sz: String(sz),
      };

      if (tpTriggerPx && slTriggerPx) {
        orderBody.attachAlgoOrds = [
          {
            tpTriggerPx: String(tpTriggerPx),
            tpOrdPx: "-1",
            slTriggerPx: String(slTriggerPx),
            slOrdPx: "-1",
          },
        ];
      }

      const { json } = await okxPrivateRequest(
        okxSession,
        "POST",
        "/api/v5/trade/order",
        orderBody
      );

      if (json?.code !== "0" || json?.data?.[0]?.sCode !== "0") {
        const msg = json?.data?.[0]?.sMsg || json?.msg || "Ordine OKX rifiutato";
        res.status(400).json({ error: msg, raw: json });
        return;
      }

      res.json({
        ok: true,
        ordId: json.data[0].ordId,
        clOrdId: json.data[0].clOrdId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore esecuzione ordine OKX";
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/okx/copytrading/close", async (req, res) => {
    if (!okxSession) {
      res.status(401).json({ error: "API OKX non connessa." });
      return;
    }

    try {
      const { instId, mgnMode } = req.body || {};
      if (!instId) {
        res.status(400).json({ error: "instId mancante." });
        return;
      }
      const { json } = await okxPrivateRequest(
        okxSession,
        "POST",
        "/api/v5/trade/close-position",
        {
          instId: String(instId),
          mgnMode: mgnMode === "isolated" ? "isolated" : "cross",
        }
      );
      if (json?.code !== "0") {
        res.status(400).json({ error: json?.msg || "Errore chiusura posizione OKX" });
        return;
      }
      res.json({ ok: true, data: json.data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore chiusura OKX";
      res.status(502).json({ error: message });
    }
  });

  // Telegram Bot notification forwarder
  app.post("/api/telegram/notify", async (req, res) => {
    try {
      const { token, chatId, text } = req.body || {};
      if (!token || !chatId || !text) {
        res.status(400).json({ error: "Missing token, chatId or text" });
        return;
      }
      const response = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(String(token))}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: String(chatId), text: String(text) }),
        }
      );
      const data = await response.json();
      res.status(response.ok ? 200 : 502).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send Telegram message";
      res.status(502).json({ error: message });
    }
  });

  // =========================================================================
  // 24/7 THREE AUTONOMOUS 3-MINUTE AI BOTS (59% Profit Reserve + ≥100% Goal)
  // =========================================================================
  let botState: BotEngineStateServer = readPersistedBotsState();
  let botCycleStarting = false;
  let botMonitorBusy = false;

  function computeBotPnl(pos: BotPositionServer, livePrice: number) {
    const rawMove =
      pos.direction === "L"
        ? (livePrice - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - livePrice) / pos.entryPrice;
    const roundTripFeeEur = pos.allocatedMarginEur * pos.leverage * 0.0008;
    const pnl = pos.allocatedMarginEur * pos.leverage * rawMove - roundTripFeeEur;
    const roi = pos.allocatedMarginEur > 0 ? (pnl / pos.allocatedMarginEur) * 100 : 0;
    return {
      pnlEur: Number(pnl.toFixed(2)),
      roiPct: Number(roi.toFixed(2)),
    };
  }

  async function executeOkxBotOrder(
    instId: string,
    direction: "L" | "S",
    leverage: number,
    targetPrice: number,
    stopPrice: number
  ): Promise<string | undefined> {
    if (!botState.config.autoCopyToOkx || !okxSession) return undefined;
    try {
      await okxPrivateRequest(okxSession, "POST", "/api/v5/account/set-leverage", {
        instId,
        lever: String(leverage),
        mgnMode: "cross",
      }).catch(() => {});
      const ord = await okxPrivateRequest(okxSession, "POST", "/api/v5/trade/order", {
        instId,
        tdMode: "cross",
        side: direction === "L" ? "buy" : "sell",
        ordType: "market",
        sz: "1",
        attachAlgoOrds: [
          {
            tpTriggerPx: String(targetPrice),
            tpOrdPx: "-1",
            slTriggerPx: String(stopPrice),
            slOrdPx: "-1",
          },
        ],
      });
      if (ord.json?.code === "0" && ord.json?.data?.[0]?.sCode === "0") {
        return String(ord.json.data[0].ordId);
      }
    } catch {
      // keep local cycle accurate even if OKX size rejected
    }
    return undefined;
  }

  const BOT_TRADFI_META: Record<
    string,
    { name: string; sector: "metallo" | "azione" | "altro_mercato" }
  > = {
    XAU: { name: "Oro Spot (XAU)", sector: "metallo" },
    XAG: { name: "Argento Spot (XAG)", sector: "metallo" },
    XAUT: { name: "Oro Tether Gold", sector: "metallo" },
    PAXG: { name: "Oro PAX Gold", sector: "metallo" },
    GLD: { name: "ETF Oro (GLD)", sector: "metallo" },
    SLV: { name: "ETF Argento (SLV)", sector: "metallo" },
    CL: { name: "Petrolio WTI (CL)", sector: "altro_mercato" },
    USO: { name: "ETF Petrolio (USO)", sector: "altro_mercato" },
    NG: { name: "Gas Naturale (NG)", sector: "altro_mercato" },
    QQQ: { name: "Nasdaq 100 (QQQ)", sector: "altro_mercato" },
    SPY: { name: "S&P 500 (SPY)", sector: "altro_mercato" },
    IWM: { name: "Russell 2000 (IWM)", sector: "altro_mercato" },
    SOXL: { name: "Semiconduttori 3x (SOXL)", sector: "altro_mercato" },
    TQQQ: { name: "Nasdaq 3x Long (TQQQ)", sector: "altro_mercato" },
    SQQQ: { name: "Nasdaq 3x Short (SQQQ)", sector: "altro_mercato" },
    SPXL: { name: "S&P 500 3x (SPXL)", sector: "altro_mercato" },
    EUR: { name: "Euro / USD", sector: "altro_mercato" },
    GBP: { name: "Sterlina / USD", sector: "altro_mercato" },
    JPY: { name: "Yen Giapponese", sector: "altro_mercato" },
    NVDA: { name: "NVIDIA (Azione)", sector: "azione" },
    TSLA: { name: "Tesla (Azione)", sector: "azione" },
    AAPL: { name: "Apple (Azione)", sector: "azione" },
    MSFT: { name: "Microsoft (Azione)", sector: "azione" },
    AMZN: { name: "Amazon (Azione)", sector: "azione" },
    META: { name: "Meta Platforms (Azione)", sector: "azione" },
    GOOGL: { name: "Alphabet (Azione)", sector: "azione" },
    GOOG: { name: "Alphabet C (Azione)", sector: "azione" },
    NFLX: { name: "Netflix (Azione)", sector: "azione" },
    AMD: { name: "AMD (Azione)", sector: "azione" },
    PLTR: { name: "Palantir (Azione)", sector: "azione" },
    COIN: { name: "Coinbase (Azione)", sector: "azione" },
    MSTR: { name: "MicroStrategy (Azione)", sector: "azione" },
    HOOD: { name: "Robinhood (Azione)", sector: "azione" },
    ARM: { name: "ARM Holdings (Azione)", sector: "azione" },
    AVGO: { name: "Broadcom (Azione)", sector: "azione" },
    INTC: { name: "Intel (Azione)", sector: "azione" },
    ORCL: { name: "Oracle (Azione)", sector: "azione" },
    CRWD: { name: "CrowdStrike (Azione)", sector: "azione" },
    SMCI: { name: "Super Micro (Azione)", sector: "azione" },
    MU: { name: "Micron Tech (Azione)", sector: "azione" },
    ASML: { name: "ASML (Azione)", sector: "azione" },
    TSM: { name: "TSMC (Azione)", sector: "azione" },
    BABA: { name: "Alibaba (Azione)", sector: "azione" },
    NBIS: { name: "Nebius Group (Azione)", sector: "azione" },
    TSLL: { name: "Tesla 2x (TSLL)", sector: "azione" },
    TSLQ: { name: "Tesla Short (TSLQ)", sector: "azione" },
  };

  interface BotCandidateMarket {
    instId: string;
    baseSymbol: string;
    name: string;
    sector: "memecoin" | "major" | "altcoin" | "metallo" | "azione" | "altro_mercato";
    last: number;
    bidPx: number;
    askPx: number;
    spreadPct: number;
    volUsd24h: number;
    changePct24h: number;
    range24hPct: number;
    rangePos: number;
    probabilityPct: number;
    potentialMovePct: number;
    trendLabel: string;
    direction: "L" | "S";
    reasons: string[];
  }

  async function computeMultiMarketBotCandidates(refresh = false) {
    const [cryptoScan, okxTickersRes] = await Promise.all([
      computeLiveCryptoOpportunities(refresh),
      fetchJsonWithTimeout("https://www.okx.com/api/v5/market/tickers?instType=SWAP", {}, 7000).catch(
        () => null
      ),
    ]);

    const rawRows = Array.isArray(okxTickersRes?.data)
      ? (okxTickersRes.data as Record<string, string>[])
      : [];

    const tradfiCandidates: BotCandidateMarket[] = [];
    for (const t of rawRows) {
      const instId = t.instId || "";
      if (!instId.endsWith("-USDT-SWAP")) continue;
      const base = instId.replace("-USDT-SWAP", "");
      const meta = BOT_TRADFI_META[base];
      if (!meta && !TRADFI_OKX_EXCLUDES.has(base)) continue;

      const last = Number(t.last);
      const bidPx = Number(t.bidPx);
      const askPx = Number(t.askPx);
      const open24h = Number(t.open24h);
      if (!(last > 0 && bidPx > 0 && askPx > 0 && open24h > 0)) continue;

      const spreadPct = ((askPx - bidPx) / last) * 100;
      const volCcy24h = Number(t.volCcy24h || 0);
      const volUsd24h = volCcy24h > 0 ? volCcy24h * last : Number(t.vol24h || 0);
      if (volUsd24h < 1_000_000 || spreadPct > 0.16) continue;

      const high24h = Math.max(Number(t.high24h) || last, last);
      const low24h = Math.min(Number(t.low24h) || last, last);
      const changePct24h = ((last - open24h) / open24h) * 100;
      const range24hPct = low24h > 0 ? ((high24h - low24h) / low24h) * 100 : 0;
      const rangePos =
        high24h > low24h ? Math.max(0, Math.min(1, (last - low24h) / (high24h - low24h))) : 0.5;
      const direction: "L" | "S" =
        changePct24h > 0.25 || rangePos >= 0.54 ? "L" : "S";

      const liqScore = Math.min(10, Math.max(0, (Math.log10(volUsd24h) - 6) * 3.5));
      const spreadScore = spreadPct <= 0.03 ? 8 : spreadPct <= 0.06 ? 5 : 2;
      const momMag = Math.tanh(Math.abs(changePct24h) / 5) * 16;
      const rangeAlign =
        direction === "L" ? (rangePos - 0.5) * 20 : (0.5 - rangePos) * 20;
      const probabilityPct = Math.round(
        Math.max(45, Math.min(91, 48 + liqScore + spreadScore + momMag + rangeAlign))
      );

      tradfiCandidates.push({
        instId,
        baseSymbol: base,
        name: meta?.name || base,
        sector: meta?.sector || "altro_mercato",
        last,
        bidPx,
        askPx,
        spreadPct,
        volUsd24h,
        changePct24h,
        range24hPct,
        rangePos,
        probabilityPct,
        potentialMovePct: Number(Math.max(0.8, Math.min(12, range24hPct * 0.45)).toFixed(1)),
        trendLabel:
          changePct24h >= 1.5
            ? "ALTAMENTE RIALZISTA"
            : changePct24h <= -1.5
            ? "ALTAMENTE RIBASSISTA"
            : direction === "L"
            ? "RIALZISTA"
            : "RIBASSISTA",
        direction,
        reasons: [
          `Spread ultra-stretto ${spreadPct.toFixed(3)}%`,
          `Volumi 24h $${(volUsd24h / 1_000_000).toFixed(1)}M`,
        ],
      });
    }

    const cryptoList: BotCandidateMarket[] = cryptoScan.opportunities
      .filter((o) => o.volUsd24h >= 3_000_000 && o.spreadPct <= 0.1)
      .map((o) => ({
        instId: o.instId,
        baseSymbol: o.baseSymbol,
        name: o.name,
        sector: o.sector,
        last: o.last,
        bidPx: o.bidPx,
        askPx: o.askPx,
        spreadPct: o.spreadPct,
        volUsd24h: o.volUsd24h,
        changePct24h: o.changePct24h,
        range24hPct: o.range24hPct,
        rangePos: o.rangePos,
        probabilityPct: o.probabilityPct,
        potentialMovePct: o.potentialMovePct,
        trendLabel: o.trendLabel,
        direction: o.direction,
        reasons: o.reasons,
      }));

    // Balanced multi-market selection: metals, stocks, indices/commodities, and top liquid crypto
    const metals = tradfiCandidates
      .filter((c) => c.sector === "metallo")
      .sort((a, b) => b.probabilityPct - a.probabilityPct)
      .slice(0, 4);
    const others = tradfiCandidates
      .filter((c) => c.sector === "altro_mercato")
      .sort((a, b) => b.probabilityPct - a.probabilityPct)
      .slice(0, 4);
    const stocks = tradfiCandidates
      .filter((c) => c.sector === "azione")
      .sort((a, b) => b.probabilityPct - a.probabilityPct)
      .slice(0, 6);
    const cryptos = cryptoList.slice(0, 10);

    const seen = new Set<string>();
    const combined: BotCandidateMarket[] = [];
    for (const item of [...metals, ...others, ...stocks, ...cryptos]) {
      if (seen.has(item.instId)) continue;
      seen.add(item.instId);
      combined.push(item);
    }

    return {
      globalContext: cryptoScan.globalContext,
      candidates: combined,
    };
  }

  function ensureLearning(): BotLearningMemoryServer {
    if (!botState.learning) {
      botState.learning = createDefaultLearningMemory();
    }
    if (!Array.isArray(botState.learning.positionLessons)) {
      botState.learning.positionLessons = [];
    }
    if (
      !Array.isArray(botState.learning.discoveredTechniques) ||
      botState.learning.discoveredTechniques.length === 0
    ) {
      botState.learning.discoveredTechniques = createDefaultTechniques(Date.now());
    }
    return botState.learning;
  }

  function registerTechniqueProposal(proposal: {
    name?: string;
    hypothesis?: string;
    horizon?: string;
  } | null | undefined) {
    if (!proposal?.name || !proposal?.hypothesis) return;
    const cleanName = String(proposal.name).trim().slice(0, 64);
    const cleanHypothesis = String(proposal.hypothesis).trim().slice(0, 180);
    if (cleanName.length < 4 || cleanHypothesis.length < 10) return;

    const learning = ensureLearning();
    const exists = learning.discoveredTechniques.find(
      (t) => t.name.toLowerCase() === cleanName.toLowerCase()
    );
    const horizon: BotHorizonModeServer =
      proposal.horizon && ["scalping", "intraday", "swing", "macro"].includes(proposal.horizon)
        ? (proposal.horizon as BotHorizonModeServer)
        : botState.config.horizonMode || "scalping";

    if (exists) {
      exists.hypothesis = cleanHypothesis;
      exists.lastUsedAt = Date.now();
      return;
    }

    const now = Date.now();
    learning.discoveredTechniques = [
      {
        name: cleanName,
        hypothesis: cleanHypothesis,
        horizon,
        wins: 0,
        losses: 0,
        netPnlEur: 0,
        status: "in_test" as const,
        createdAt: now,
        lastUsedAt: now,
      },
      ...learning.discoveredTechniques,
    ].slice(0, 16);
  }

  function recordBotOutcomeAndLearn(
    pos: BotPositionServer,
    pnlEur: number,
    exitReason: string
  ) {
    const learning = ensureLearning();
    const now = Date.now();
    const isWin = pnlEur >= 0;
    learning.totalEvaluated += 1;
    if (isWin) {
      botState.totalGrossProfitEur = Number(
        ((botState.totalGrossProfitEur || 0) + pnlEur).toFixed(2)
      );
    } else {
      botState.totalGrossLossEur = Number(
        ((botState.totalGrossLossEur || 0) + Math.abs(pnlEur)).toFixed(2)
      );
    }

    // 1. Update Asset Track Record
    const prevAsset = learning.assetStats[pos.instId] || {
      instId: pos.instId,
      symbol: pos.symbol,
      wins: 0,
      losses: 0,
      netPnlEur: 0,
      consecutiveLosses: 0,
      cooldownUntil: 0,
      lastOutcomeAt: now,
    };

    if (isWin) {
      prevAsset.wins += 1;
      prevAsset.consecutiveLosses = 0;
      prevAsset.cooldownUntil = 0;
    } else {
      prevAsset.losses += 1;
      prevAsset.consecutiveLosses += 1;
      prevAsset.cooldownUntil =
        prevAsset.consecutiveLosses >= 2 ? now + 480_000 : now + 150_000;
    }
    prevAsset.netPnlEur = Number((prevAsset.netPnlEur + pnlEur).toFixed(2));
    prevAsset.lastOutcomeAt = now;
    learning.assetStats[pos.instId] = prevAsset;

    // 2. Update Technique, Playbook & Sector Track Records
    const techKey = pos.technique.slice(0, 56);
    const prevTech = learning.techniqueStats[techKey] || {
      key: techKey,
      wins: 0,
      losses: 0,
      netPnlEur: 0,
    };
    if (isWin) prevTech.wins += 1;
    else prevTech.losses += 1;
    prevTech.netPnlEur = Number((prevTech.netPnlEur + pnlEur).toFixed(2));
    learning.techniqueStats[techKey] = prevTech;

    let playbookItem = learning.discoveredTechniques.find(
      (t) => t.name.toLowerCase() === techKey.toLowerCase()
    );
    if (!playbookItem) {
      playbookItem = {
        name: techKey,
        hypothesis: pos.reasoning.slice(0, 150),
        horizon: pos.entryMeta?.multiHorizon?.horizonMode || botState.config.horizonMode || "scalping",
        wins: 0,
        losses: 0,
        netPnlEur: 0,
        status: "in_test",
        createdAt: now,
        lastUsedAt: now,
      };
      learning.discoveredTechniques = [playbookItem, ...learning.discoveredTechniques].slice(0, 16);
    }
    if (isWin) playbookItem.wins += 1;
    else playbookItem.losses += 1;
    playbookItem.netPnlEur = Number((playbookItem.netPnlEur + pnlEur).toFixed(2));
    playbookItem.lastUsedAt = now;
    const totalPlays = playbookItem.wins + playbookItem.losses;
    const playWr = totalPlays > 0 ? (playbookItem.wins / totalPlays) * 100 : 50;
    if (totalPlays >= 2 && playWr >= 60 && playbookItem.netPnlEur > 0) {
      playbookItem.status = "vincente";
    } else if (playbookItem.losses >= 2 && playWr < 40) {
      playbookItem.status = "scartata";
    } else {
      playbookItem.status = "in_test";
    }

    const secKey = pos.sector;
    const prevSec = learning.sectorStats[secKey] || {
      key: secKey,
      wins: 0,
      losses: 0,
      netPnlEur: 0,
    };
    if (isWin) prevSec.wins += 1;
    else prevSec.losses += 1;
    prevSec.netPnlEur = Number((prevSec.netPnlEur + pnlEur).toFixed(2));
    learning.sectorStats[secKey] = prevSec;

    // 3. Per-Position Learning Lesson (Both Wins & Losses) + Parameter Calibration
    const params = learning.adaptiveParams;
    const meta = pos.entryMeta || {};
    const horizonSummary =
      meta.multiHorizon?.summary ||
      `MTF 1m+5m ${meta.mtfAligned ? "allineato" : "misto"} · Spread ${(meta.spreadPct ?? 0).toFixed(3)}%`;

    if (!isWin) {
      let diagnosis = `Ritracciamento avverso su ${pos.symbol} (${exitReason})`;
      let correctiveRule = `Aumentata soglia parsimonia a ${Math.min(72, params.minParsimonyScore + 2)}`;

      if ((pos.reversalsCount || 0) > 0) {
        diagnosis = `Doppia inversione laterale su ${pos.symbol} (${pnlEur.toFixed(2)}€)`;
        correctiveRule = `Quarantena 8 min su ${pos.symbol} + filtro ATR stop più ampio`;
        params.atrInversionMultiplier = Math.min(
          1.85,
          Number((params.atrInversionMultiplier + 0.08).toFixed(2))
        );
        prevAsset.cooldownUntil = now + 480_000;
      } else if (meta.mtfAligned === false) {
        diagnosis = `Ingresso contro-trend 5m su ${pos.symbol} (${pos.direction})`;
        correctiveRule = "Imposto filtro multi-timeframe 1m+5m obbligatorio";
        params.requireMtf5m = true;
        params.minParsimonyScore = Math.min(72, params.minParsimonyScore + 3);
      } else if ((meta.multiHorizon?.alignmentScore ?? 70) < 55) {
        diagnosis = `Allineamento candele multi-orizzonte debole (${meta.multiHorizon?.alignmentScore}%) su ${pos.symbol}`;
        correctiveRule = "Richiedi maggiore confluenza candele Ore/Giorni/Settimane prima di aprire";
        params.minParsimonyScore = Math.min(72, params.minParsimonyScore + 2);
      } else if ((meta.spreadPct || 0) >= 0.065) {
        diagnosis = `Erosione spread (${meta.spreadPct?.toFixed(3)}%) + fee`;
        params.maxSpreadPct = Math.max(0.055, Number((params.maxSpreadPct - 0.01).toFixed(3)));
        correctiveRule = `Spread massimo ristretto a ${params.maxSpreadPct.toFixed(3)}%`;
      } else if ((meta.volSurge || 1) < 1.08) {
        diagnosis = `Breakout su volumi insufficienti (${(meta.volSurge || 1).toFixed(2)}x)`;
        params.minVolSurge = Math.min(1.25, Number((params.minVolSurge + 0.05).toFixed(2)));
        correctiveRule = `Volume surge minimo alzato a ${params.minVolSurge.toFixed(2)}x`;
      } else {
        params.minParsimonyScore = Math.min(72, params.minParsimonyScore + 2);
        params.atrTpMultiplier = Math.max(1.35, Number((params.atrTpMultiplier - 0.06).toFixed(2)));
      }

      learning.recentMistakes = [
        {
          ts: now,
          symbol: pos.symbol,
          instId: pos.instId,
          sector: pos.sector,
          direction: pos.direction,
          technique: pos.technique,
          pnlEur: Number(pnlEur.toFixed(2)),
          diagnosis,
          correctiveRule,
        },
        ...learning.recentMistakes,
      ].slice(0, 15);

      learning.positionLessons = [
        {
          ts: now,
          symbol: pos.symbol,
          direction: pos.direction,
          technique: techKey,
          pnlEur: Number(pnlEur.toFixed(2)),
          outcome: "loss" as const,
          horizonSummary,
          lesson: `${diagnosis} → Correzione: ${correctiveRule}.`,
        },
        ...learning.positionLessons,
      ].slice(0, 25);
    } else {
      const globalWinRate =
        botState.totalTrades > 0 ? botState.wins / botState.totalTrades : 0.7;
      if (globalWinRate >= 0.72) {
        params.minParsimonyScore = Math.max(50, params.minParsimonyScore - 1);
      }

      learning.positionLessons = [
        {
          ts: now,
          symbol: pos.symbol,
          direction: pos.direction,
          technique: techKey,
          pnlEur: Number(pnlEur.toFixed(2)),
          outcome: "win" as const,
          horizonSummary,
          lesson: `Setup confermato (${exitReason}): tecnica "${techKey}" in profitto (+${pnlEur.toFixed(2)}€) con allineamento ${meta.multiHorizon?.alignmentScore ?? 75}% e volumi ${(meta.volSurge || 1).toFixed(2)}x.`,
        },
        ...learning.positionLessons,
      ].slice(0, 25);
    }

    learning.lastCalibratedAt = now;
  }

  async function fetchSnapshotsBatched(instIds: string[]) {
    const out: (Awaited<ReturnType<typeof fetchCandleSnapshot>>)[] = [];
    const batchSize = 4;
    for (let i = 0; i < instIds.length; i += batchSize) {
      const slice = instIds.slice(i, i + batchSize);
      const res = await Promise.allSettled(slice.map((id) => fetchCandleSnapshot(id)));
      for (const r of res) {
        out.push(r.status === "fulfilled" ? r.value : null);
      }
      if (i + batchSize < instIds.length) {
        await new Promise((r) => setTimeout(r, 110));
      }
    }
    return out;
  }

  function scoreParsimonyCandidate(
    opp: BotCandidateMarket,
    snap: Awaited<ReturnType<typeof fetchCandleSnapshot>>,
    relaxed = false
  ) {
    if (!snap) return null;
    const learning = ensureLearning();
    const params = learning.adaptiveParams;
    const now = Date.now();

    // Self-Learning Quarantine Check (always enforced even in relaxed mode)
    const assetMem = learning.assetStats[opp.instId];
    if (assetMem && assetMem.cooldownUntil > now) {
      if (!relaxed) learning.blockedByLearningCount += 1;
      return null;
    }

    // Strict anti-stale / fee-clearing volatility / spread filter
    if (snap.lastCandleAgeMs > (relaxed ? 4 * 60 * 1000 : 2 * 60 * 1000)) return null;
    const minFeeClearingRange = relaxed
      ? 0.05
      : Math.max(0.11, (0.08 + opp.spreadPct) * 1.25);
    if (snap.recentRangePct < minFeeClearingRange) return null;
    if (!relaxed && snap.atr1mPct < 0.065) return null;
    if (opp.spreadPct > (relaxed ? Math.max(params.maxSpreadPct, 0.1) : params.maxSpreadPct)) {
      return null;
    }

    const vel1m = snap.vel1mPct;
    const vel3m = snap.vel3mPct;
    const volSurge = snap.volSurgeRatio;
    const rsi = snap.rsi14;
    const sameVelDir = (vel1m > 0 && vel3m > 0) || (vel1m < 0 && vel3m < 0);

    // Pick best direction using EMA + 3m/1m velocity + VWAP + 5m alignment
    let bullVotes = 0;
    let bearVotes = 0;
    if (snap.emaSlopeDir === "L") bullVotes += 2; else bearVotes += 2;
    if (vel3m >= 0.02) bullVotes += 2; else if (vel3m <= -0.02) bearVotes += 2;
    if (vel1m >= 0.01) bullVotes += 1; else if (vel1m <= -0.01) bearVotes += 1;
    if (snap.dir5m === "L") bullVotes += 2; else if (snap.dir5m === "S") bearVotes += 2;
    if (snap.macdDir === "L") bullVotes += 1; else bearVotes += 1;
    const direction: "L" | "S" = bullVotes >= bearVotes ? "L" : "S";

    const mtfAligned = snap.dir5m === direction || snap.dir5m === "FLAT";
    if (
      !relaxed &&
      params.requireMtf5m &&
      snap.dir5m !== "FLAT" &&
      snap.dir5m !== direction &&
      volSurge < 1.85
    ) {
      return null;
    }

    // Anti-wick rejection & anti-chasing filter
    if (direction === "L" && (rsi > 77 || (snap.upperWickReject && vel1m > 0.3))) {
      return null;
    }
    if (direction === "S" && (rsi < 23 || (snap.lowerWickReject && vel1m < -0.3))) {
      return null;
    }
    if (Math.abs(vel3m) > 0.85 && volSurge < 1.7) {
      return null;
    }

    const alignedEma = snap.emaSlopeDir === direction;
    const healthyRsi =
      direction === "L" ? rsi >= 47 && rsi <= 72 : rsi >= 28 && rsi <= 53;
    const vwapAligned =
      (direction === "L" && snap.vwapDistPct >= -0.08 && snap.vwapDistPct <= 0.55) ||
      (direction === "S" && snap.vwapDistPct <= 0.08 && snap.vwapDistPct >= -0.55);

    let parsimonyScore = opp.probabilityPct * 0.55;
    if (opp.spreadPct <= 0.035) parsimonyScore += 14;
    else if (opp.spreadPct <= 0.06) parsimonyScore += 9;
    if (snap.emaAligned && alignedEma) parsimonyScore += 16;
    else if (alignedEma) parsimonyScore += 8;
    if (snap.dir5m === direction) parsimonyScore += 14;
    if (sameVelDir) parsimonyScore += 10;
    if (vwapAligned) parsimonyScore += 8;
    if (snap.macdDir === direction) parsimonyScore += 7;
    if (volSurge >= params.minVolSurge) {
      parsimonyScore += Math.min(14, Math.max(2, (volSurge - 0.85) * 14));
    }
    if (healthyRsi) parsimonyScore += 9;
    parsimonyScore += Math.min(9, Math.abs(vel3m) * 24);

    // Apply Adaptive Track Record Edge (Asset + Sector)
    let learnedEdgePts = 0;
    if (assetMem) {
      const totA = assetMem.wins + assetMem.losses;
      if (totA >= 2) {
        const wr = assetMem.wins / totA;
        if (wr >= 0.65 && assetMem.netPnlEur > 0) learnedEdgePts += 8;
        else if (assetMem.consecutiveLosses === 1) learnedEdgePts -= 9;
      }
    }
    const secStat = learning.sectorStats[opp.sector];
    if (secStat && secStat.wins + secStat.losses >= 3) {
      const swr = secStat.wins / (secStat.wins + secStat.losses);
      if (swr >= 0.65 && secStat.netPnlEur > 0) learnedEdgePts += 6;
      else if (swr < 0.4 && secStat.netPnlEur < 0) learnedEdgePts -= 8;
    }
    parsimonyScore += learnedEdgePts;

    const minScoreRequired = relaxed
      ? params.minParsimonyScore * 0.65
      : params.minParsimonyScore * 0.85;
    if (parsimonyScore < minScoreRequired) {
      return null;
    }

    // ATR-calibrated Target & Smart Inversion threshold
    const atr = Math.max(0.08, Math.min(0.45, snap.atr1mPct));
    const targetPct = Number(
      Math.max(0.2, Math.min(0.55, atr * params.atrTpMultiplier + 0.06)).toFixed(3)
    );
    const stopPct = Number(
      Math.max(0.18, Math.min(0.36, atr * params.atrInversionMultiplier + opp.spreadPct)).toFixed(3)
    );

    return {
      direction,
      parsimonyScore: Number(parsimonyScore.toFixed(1)),
      alignedEma,
      healthyRsi,
      sameVelDir,
      mtfAligned,
      vwapAligned,
      learnedEdgePts,
      targetPct,
      stopPct,
      snap,
    };
  }

  async function pickAggressiveReplacement(
    excludeInstIds: Set<string>,
    tickerMap: Map<string, { last: number; bid: number; ask: number }> | null
  ) {
    try {
      const learning = ensureLearning();
      const { candidates } = await computeMultiMarketBotCandidates(false);
      const nowFilter = Date.now();
      const pool = candidates
        .filter((o) => {
          if (excludeInstIds.has(o.instId)) return false;
          if (o.spreadPct > learning.adaptiveParams.maxSpreadPct) return false;
          const mem = learning.assetStats[o.instId];
          return !(mem && mem.cooldownUntil > nowFilter);
        })
        .sort((a, b) => (b.probabilityPct - b.spreadPct * 120) - (a.probabilityPct - a.spreadPct * 120))
        .slice(0, 10);
      if (pool.length === 0) return null;

      const snaps = await fetchSnapshotsBatched(pool.map((o) => o.instId));

      let best: {
        opp: BotCandidateMarket;
        direction: "L" | "S";
        entryPrice: number;
        bidPrice: number;
        askPrice: number;
        probabilityPct: number;
        technique: string;
        reasoning: string;
        targetPct: number;
        stopPct: number;
        score: number;
        entryMeta: BotPositionEntryMetaServer;
      } | null = null;

      for (let idx = 0; idx < pool.length; idx++) {
        const opp = pool[idx];
        const snap = snaps[idx];
        const evalRes = scoreParsimonyCandidate(opp, snap);
        if (!evalRes) continue;

        const tk = tickerMap?.get(opp.instId);
        const entryPrice = tk?.last || opp.last;
        if (!entryPrice || entryPrice <= 0) continue;

        const { direction, parsimonyScore } = evalRes;
        const vel3m = evalRes.snap.vel3mPct;
        const volSurge = evalRes.snap.volSurgeRatio;
        const rsi = evalRes.snap.rsi14;

        const prob = Math.max(
          76,
          Math.min(
            97,
            Math.round(
              opp.probabilityPct +
                (evalRes.snap.emaAligned ? 5 : 2) +
                (evalRes.mtfAligned ? 4 : 0) +
                (evalRes.vwapAligned ? 2 : 0) +
                (volSurge >= 1.25 ? 3 : 0)
            )
          )
        );

        if (!best || parsimonyScore > best.score) {
          best = {
            opp,
            direction,
            entryPrice,
            bidPrice: tk?.bid || opp.bidPx,
            askPrice: tk?.ask || opp.askPx,
            probabilityPct: prob,
            technique:
              evalRes.mtfAligned && evalRes.snap.emaAligned
                ? "Confluenza MTF 1m+5m + VWAP"
                : "Breakout Volume Surge & EMA",
            reasoning: `Selezione adattiva ${direction === "L" ? "LONG" : "SHORT"} su ${opp.name} (${opp.sector}): MTF 5m ${evalRes.snap.dir5m}, ATR ${evalRes.snap.atr1mPct}%, volumi ${volSurge.toFixed(2)}x, spread ${opp.spreadPct.toFixed(3)}%, RSI ${rsi.toFixed(1)}.`,
            targetPct: evalRes.targetPct,
            stopPct: evalRes.stopPct,
            score: parsimonyScore,
            entryMeta: {
              spreadPct: opp.spreadPct,
              rsi14: rsi,
              volSurge,
              atr1mPct: evalRes.snap.atr1mPct,
              mtfAligned: evalRes.mtfAligned,
              vwapDistPct: evalRes.snap.vwapDistPct,
              reversalTriggerPct: evalRes.stopPct,
            },
          };
        }
      }

      if (best) {
        const horizonMode = botState.config.horizonMode || "scalping";
        const mh = await fetchMultiHorizonEstimate(
          best.opp.instId,
          best.direction,
          horizonMode
        ).catch(() => undefined);
        if (mh) {
          best.entryMeta.multiHorizon = mh;
        }
      }

      return best;
    } catch {
      return null;
    }
  }

  async function finalizeActiveCycle(reasonLabel: string) {
    const cycle = botState.currentCycle;
    if (!cycle || cycle.status === "completed") return;

    let tickerMap = new Map<string, { last: number; bid: number; ask: number }>();
    try {
      const tJson = await fetchJsonWithTimeout(
        "https://www.okx.com/api/v5/market/tickers?instType=SWAP",
        {},
        6000
      );
      if (Array.isArray(tJson?.data)) {
        for (const r of tJson.data as Record<string, string>[]) {
          const px = Number(r.last);
          const bid = Number(r.bidPx) || px;
          const ask = Number(r.askPx) || px;
          if (r.instId && px > 0) tickerMap.set(r.instId, { last: px, bid, ask });
        }
      }
    } catch {
      // fallback to last recorded currentPrice
    }

    const now = Date.now();
    const isStaleRecovery = now > cycle.endsAt + 15000;
    for (const pos of cycle.positions) {
      if (pos.status === "open") {
        const tk = tickerMap.get(pos.instId);
        let px = tk?.last || pos.currentPrice || pos.entryPrice;
        if (isStaleRecovery) {
          px =
            pos.direction === "L"
              ? Math.max(pos.stopPrice, Math.min(pos.targetPrice, px))
              : Math.min(pos.stopPrice, Math.max(pos.targetPrice, px));
        }
        pos.currentPrice = px;
        if (tk) {
          pos.bidPrice = tk.bid;
          pos.askPrice = tk.ask;
        }
        const { pnlEur, roiPct } = computeBotPnl(pos, px);
        pos.livePnlEur = pnlEur;
        pos.liveRoiPct = roiPct;
        pos.peakPnlEur = Math.max(pos.peakPnlEur, pnlEur);
        pos.status = "closed";
        pos.closedAt = now;
        pos.exitReason = reasonLabel;
        if (pos.okxOrderId && okxSession) {
          void okxPrivateRequest(okxSession, "POST", "/api/v5/trade/close-position", {
            instId: pos.instId,
            mgnMode: "cross",
          }).catch(() => {});
        }
        botState.totalTrades += 1;
        if (pos.livePnlEur >= 0) botState.wins += 1;
        else botState.losses += 1;
        recordBotOutcomeAndLearn(pos, pos.livePnlEur, reasonLabel);
      }
    }

    const openLegsPnl = cycle.positions.reduce((s, p) => s + p.livePnlEur, 0);
    const netPnlEur = Number(((cycle.closedSlotPnlEur || 0) + openLegsPnl).toFixed(2));
    const reserveRate = Math.max(0, Math.min(95, botState.config.vaultReservePct)) / 100;
    const vaultAddedEur =
      netPnlEur > 0 ? Number((netPnlEur * reserveRate).toFixed(2)) : 0;
    const reinvestedEur = Number((netPnlEur - vaultAddedEur).toFixed(2));

    botState.vaultEur = Number((botState.vaultEur + vaultAddedEur).toFixed(2));
    botState.activeCapitalEur = Number(
      Math.max(50, botState.activeCapitalEur + reinvestedEur).toFixed(2)
    );
    botState.totalRealizedPnlEur = Number(
      (botState.totalRealizedPnlEur + netPnlEur).toFixed(2)
    );

    cycle.status = "completed";
    cycle.endsAt = now;
    cycle.netPnlEur = netPnlEur;
    cycle.vaultAddedEur = vaultAddedEur;
    cycle.reinvestedEur = reinvestedEur;
    cycle.vaultTotalEur = botState.vaultEur;

    botState.history = [cycle, ...botState.history].slice(0, 40);
    botState.currentCycle = null;
    botState.updatedAt = now;
    botState.nextCycleAt = botState.active && botState.config.enabled24h ? now + 1500 : 0;
    writePersistedBotsState(botState);
  }

  async function runThreeBotCycle(forceStart = false) {
    if (botCycleStarting) return;
    if (!forceStart && (!botState.active || !botState.config.enabled24h)) return;

    botCycleStarting = true;
    try {
      const learning = ensureLearning();
      if (botState.currentCycle && botState.currentCycle.status === "running") {
        await finalizeActiveCycle(forceStart ? "Chiusura manuale riavvio" : "Scadenza ciclo 2m");
      }

      const ai = getGeminiClient();
      if (!ai) {
        botState.lastError =
          "Chiave GEMINI_API_KEY mancante sul server: i 3 Bot AI richiedono Gemini per selezionare tecnica e motivazione.";
        botState.nextCycleAt = Date.now() + 30000;
        botState.updatedAt = Date.now();
        writePersistedBotsState(botState);
        return;
      }

      const { globalContext, candidates } = await computeMultiMarketBotCandidates(true);
      if (candidates.length < 3) {
        throw new Error("Meno di 3 mercati liquidi disponibili su OKX.");
      }

      const nowPre = Date.now();
      const activePool = candidates
        .filter((o) => {
          const mem = learning.assetStats[o.instId];
          if (mem && mem.cooldownUntil > nowPre) {
            learning.blockedByLearningCount += 1;
            return false;
          }
          return true;
        })
        .sort((a, b) => (b.probabilityPct - b.spreadPct * 120) - (a.probabilityPct - a.spreadPct * 120))
        .slice(0, 12);

      const candleSnaps = await fetchSnapshotsBatched(activePool.map((o) => o.instId));

      const vettedCandidates: {
        opp: BotCandidateMarket;
        evalRes: NonNullable<ReturnType<typeof scoreParsimonyCandidate>>;
      }[] = [];

      for (let idx = 0; idx < activePool.length; idx++) {
        const opp = activePool[idx];
        const snap = candleSnaps[idx];
        const evalRes = scoreParsimonyCandidate(opp, snap, false);
        if (evalRes) {
          vettedCandidates.push({ opp, evalRes });
        }
      }

      if (vettedCandidates.length < 3) {
        const existingIds = new Set(vettedCandidates.map((v) => v.opp.instId));
        for (let idx = 0; idx < activePool.length; idx++) {
          const opp = activePool[idx];
          if (existingIds.has(opp.instId)) continue;
          const snap = candleSnaps[idx];
          const evalRes = scoreParsimonyCandidate(opp, snap, true);
          if (evalRes) {
            vettedCandidates.push({ opp, evalRes });
            existingIds.add(opp.instId);
          }
        }
      }

      vettedCandidates.sort((a, b) => b.evalRes.parsimonyScore - a.evalRes.parsimonyScore);
      const horizonMode: BotHorizonModeServer = botState.config.horizonMode || "scalping";
      const topRaw = vettedCandidates.slice(0, 8);

      if (topRaw.length < 3) {
        throw new Error("Meno di 3 mercati attivi superano i filtri MTF + Apprendimento Errori.");
      }

      // Fetch real historical candle estimates (Hours 1H, Days 1D, Weeks 1W, Months/Years 1M) before opening
      const mhBundles = await Promise.all(
        topRaw.map(({ opp }) =>
          fetchRawMultiHorizonBundle(opp.instId).catch(() => ({
            hours: null,
            days: null,
            weeks: null,
            monthsYears: null,
          }))
        )
      );

      const topVetted = topRaw.map((item, idx) => {
        const bundle = mhBundles[idx];
        const multiHorizon = buildMultiHorizonEstimate(
          bundle,
          item.evalRes.direction,
          horizonMode
        );
        const mhBoost = (multiHorizon.alignmentScore - 58) * 0.25;
        return {
          ...item,
          bundle,
          multiHorizon,
          adjustedScore: Number((item.evalRes.parsimonyScore + mhBoost).toFixed(1)),
        };
      });
      topVetted.sort((a, b) => b.adjustedScore - a.adjustedScore);

      const nowMs = Date.now();
      const quarantinedAssets = Object.values(learning.assetStats)
        .filter((a) => a.cooldownUntil > nowMs)
        .map((a) => `${a.symbol} (${a.consecutiveLosses} errori consecutivi)`);

      const playbookSummary = learning.discoveredTechniques.slice(0, 8).map((t) => ({
        name: t.name,
        status: t.status,
        horizon: t.horizon,
        wins: t.wins,
        losses: t.losses,
        netPnlEur: t.netPnlEur,
        hypothesis: t.hypothesis,
      }));

      const candidatePayloads = topVetted.map(({ opp, evalRes, multiHorizon, adjustedScore }) => ({
        instId: opp.instId,
        symbol: opp.baseSymbol,
        name: opp.name,
        sector: opp.sector,
        lastPrice: opp.last,
        spreadPct: Number(opp.spreadPct.toFixed(3)),
        changePct24h: Number(opp.changePct24h.toFixed(2)),
        volUsd24hM: Number((opp.volUsd24h / 1_000_000).toFixed(1)),
        parsimonyScore: adjustedScore,
        learnedAssetEdgePts: evalRes.learnedEdgePts,
        recommendedTargetPct: evalRes.targetPct,
        recommendedStopPct: evalRes.stopPct,
        multiHorizonCandles: {
          horizonMode,
          alignmentScore: multiHorizon.alignmentScore,
          summary: multiHorizon.summary,
          hours24_1H: multiHorizon.hours,
          days30_1D: multiHorizon.days,
          weeks26_1W: multiHorizon.weeks,
          monthsYears_1M: multiHorizon.monthsYears,
        },
        quantMultiTimeframe: {
          dir5m: evalRes.snap.dir5m,
          vel5mPct: evalRes.snap.vel5mPct,
          mtfAligned: evalRes.mtfAligned,
          emaAligned1m: evalRes.snap.emaAligned,
          emaSlopeDir1m: evalRes.snap.emaSlopeDir,
          vwapDistPct: evalRes.snap.vwapDistPct,
          vwapAligned: evalRes.vwapAligned,
          macdDir: evalRes.snap.macdDir,
          rsi14: evalRes.snap.rsi14,
          healthyRsi: evalRes.healthyRsi,
          atr1mPct: evalRes.snap.atr1mPct,
          bbWidthPct: evalRes.snap.bbWidthPct,
          volSurgeRatio: evalRes.snap.volSurgeRatio,
          vel1mPct: evalRes.snap.vel1mPct,
          vel3mPct: evalRes.snap.vel3mPct,
          recentRangePct: evalRes.snap.recentRangePct,
        },
      }));

      const memoryContext = {
        horizonModeActive: horizonMode,
        currentWinRatePct:
          botState.totalTrades > 0
            ? Math.round((botState.wins / botState.totalTrades) * 100)
            : null,
        adaptiveThresholds: learning.adaptiveParams,
        quarantinedAssetsExcluded: quarantinedAssets,
        techniquesPlaybook: playbookSummary,
        recentPositionLessons: learning.positionLessons.slice(0, 6).map((l) => ({
          symbol: l.symbol,
          outcome: l.outcome,
          technique: l.technique,
          pnlEur: l.pnlEur,
          lesson: l.lesson,
        })),
      };

      const horizonFocusDesc: Record<BotHorizonModeServer, string> = {
        scalping: "Scalping 2m (priorità candele Ultime Ore 1H + Ultimi Giorni 1D + micro 1m/5m)",
        intraday: "Intraday (priorità candele Ore 1H + Giorni 1D + Settimane 1W)",
        swing: "Swing (priorità candele Giorni 1D + Settimane 1W + Mesi 1M)",
        macro: "Macro Strutturale (priorità candele Settimane 1W + Mesi/Anni 1M)",
      };

      const prompt = `Sei il cervello quantitativo adattivo e in evoluzione continua dei 3 Bot Automatici H24 di Scalper Pro LIVE (leva ${botState.config.leverage}x, 59% dei profitti in Cassaforte, orizzonte attivo: ${horizonFocusDesc[horizonMode]}).

CONTESTO GLOBALE LIVE:
${JSON.stringify(globalContext)}

MEMORIA DI APPRENDIMENTO & PLAYBOOK TECNICHE (IMPARA DA OGNI POSIZIONE E SPERIMENTA NUOVE TECNICHE):
${JSON.stringify(memoryContext)}

CANDIDATI MULTI-MERCATO CON STIMA CANDELE PRE-APERTURA (1m/5m + 1H Ore + 1D Giorni + 1W Settimane + 1M Mesi/Anni):
${JSON.stringify(candidatePayloads)}

REGOLE RIGIDE DI ECCELLENZA E EVOLUZIONE:
1. Prima di aprire OGNI posizione, verifica "multiHorizonCandles": scegli SOLO asset la cui stima storica (ore, giorni, settimane, mesi/anni in base all'orizzonte attivo "${horizonMode}") conferma la direzione scelta con alignmentScore elevato.
2. Analizza "techniquesPlaybook" e "recentPositionLessons": privilegia le tecniche "vincente", metti alla prova quelle "in_test", EVITA quelle "scartata" e NON ripetere gli errori documentati.
3. Scegli ESATTAMENTE 3 asset DISTINTI con massima probabilità di profitto.
4. Inoltre, se intravedi un pattern ricorrente dalle candele multi-orizzonte o dalle lezioni recenti, proponi UNA nuova tecnica migliorativa in "newTechniqueProposal" da testare nei prossimi cicli.
5. Per ciascuno dei 3 Bot restituisci:
   - instId esatto dalla lista
   - direction ("L" oppure "S")
   - probabilityPct (intero 76..97)
   - technique (nome preciso della tecnica applicata, preferibilmente dal playbook o la tua nuova tecnica)
   - reasoning (1-2 frasi in italiano che citano chiaramente la stima candele multi-orizzonte Ore/Giorni/Sett./Mesi-Anni e il perché della tecnica)
   - targetPct (tra 0.18 e 0.55)
   - stopPct (tra 0.18 e 0.36)`;

      const schemaConfig = {
        type: Type.OBJECT,
        properties: {
          marketHeadline: {
            type: Type.STRING,
            description: "Titolo sintetico della selezione multi-orizzonte (max 12 parole).",
          },
          newTechniqueProposal: {
            type: Type.OBJECT,
            description: "Nuova tecnica opzionale affinata dai dati live per il laboratorio di apprendimento.",
            properties: {
              name: { type: Type.STRING },
              hypothesis: { type: Type.STRING },
              horizon: { type: Type.STRING },
            },
            required: ["name", "hypothesis", "horizon"],
          },
          picks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                instId: { type: Type.STRING },
                direction: { type: Type.STRING },
                probabilityPct: { type: Type.INTEGER },
                technique: { type: Type.STRING },
                reasoning: { type: Type.STRING },
                targetPct: { type: Type.NUMBER },
                stopPct: { type: Type.NUMBER },
              },
              required: [
                "instId",
                "direction",
                "probabilityPct",
                "technique",
                "reasoning",
                "targetPct",
                "stopPct",
              ],
            },
          },
        },
        required: ["marketHeadline", "picks"],
      };

      let usedAiModel = "gemini-4-hydrogen";
      let aiRes;
      try {
        aiRes = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: schemaConfig,
          },
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE")) {
          usedAiModel = "gemini-3.1-flash-lite";
          aiRes = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: schemaConfig,
            },
          });
        } else {
          throw primaryErr;
        }
      }

      const parsed = JSON.parse((aiRes.text ?? "{}").trim()) as {
        marketHeadline?: string;
        newTechniqueProposal?: {
          name?: string;
          hypothesis?: string;
          horizon?: string;
        };
        picks?: {
          instId: string;
          direction: string;
          probabilityPct: number;
          technique: string;
          reasoning: string;
          targetPct: number;
          stopPct: number;
        }[];
      };

      if (parsed.newTechniqueProposal) {
        registerTechniqueProposal(parsed.newTechniqueProposal);
      }

      const rawPicks = Array.isArray(parsed.picks) ? parsed.picks : [];
      const vettedById = new Map(topVetted.map((v) => [v.opp.instId, v]));
      const chosenIds = new Set<string>();
      const validPicks: {
        opp: BotCandidateMarket;
        evalRes: NonNullable<ReturnType<typeof scoreParsimonyCandidate>>;
        multiHorizon: MultiHorizonEstimateServer;
        direction: "L" | "S";
        probabilityPct: number;
        technique: string;
        reasoning: string;
        targetPct: number;
        stopPct: number;
      }[] = [];

      for (const p of rawPicks) {
        const match = vettedById.get(p.instId);
        if (!match || chosenIds.has(match.opp.instId)) continue;
        chosenIds.add(match.opp.instId);
        const dir: "L" | "S" = p.direction === "S" ? "S" : "L";
        const mhForDir = buildMultiHorizonEstimate(match.bundle, dir, horizonMode);
        validPicks.push({
          opp: match.opp,
          evalRes: match.evalRes,
          multiHorizon: mhForDir,
          direction: dir,
          probabilityPct: Math.max(76, Math.min(97, Math.round(Number(p.probabilityPct) || match.opp.probabilityPct))),
          technique: String(p.technique || "Confluenza MTF 1m+5m + VWAP").slice(0, 80),
          reasoning: String(p.reasoning || match.opp.reasons.join(". ")).slice(0, 320),
          targetPct: Math.max(0.18, Math.min(0.55, Number(p.targetPct) || match.evalRes.targetPct)),
          stopPct: Math.max(0.18, Math.min(0.36, Number(p.stopPct) || match.evalRes.stopPct)),
        });
        if (validPicks.length === 3) break;
      }

      if (validPicks.length < 3) {
        throw new Error("Risposta AI incompleta: richiesti 3 setup distinti.");
      }

      const now = Date.now();
      const durationMs = Math.max(60, botState.config.cycleDurationSec) * 1000;
      const endsAt = now + durationMs;
      const leverage = Math.max(2, Math.min(50, botState.config.leverage));
      const marginPerBot =
        botState.config.tradeAmountMode === "auto"
          ? Math.max(15, Number(((botState.activeCapitalEur * 0.28) / 3).toFixed(2)))
          : Math.max(10, Math.min(botState.config.fixedPerBotEur, botState.activeCapitalEur / 3.1));

      const positions: BotPositionServer[] = [];
      for (let i = 0; i < 3; i++) {
        const pick = validPicks[i];
        const entryPrice = pick.opp.last;
        const targetPrice =
          pick.direction === "L"
            ? entryPrice * (1 + pick.targetPct / 100)
            : entryPrice * (1 - pick.targetPct / 100);
        const stopPrice =
          pick.direction === "L"
            ? entryPrice * (1 - pick.stopPct / 100)
            : entryPrice * (1 + pick.stopPct / 100);

        const okxOrderId = await executeOkxBotOrder(
          pick.opp.instId,
          pick.direction,
          leverage,
          targetPrice,
          stopPrice
        );

        const initialFeePnl = -Number((marginPerBot * leverage * 0.0008).toFixed(2));
        positions.push({
          botIndex: (i + 1) as 1 | 2 | 3,
          instId: pick.opp.instId,
          symbol: pick.opp.baseSymbol,
          name: pick.opp.name,
          sector: pick.opp.sector,
          direction: pick.direction,
          probabilityPct: pick.probabilityPct,
          technique: pick.technique,
          reasoning: pick.reasoning,
          entryPrice,
          currentPrice: entryPrice,
          bidPrice: pick.opp.bidPx,
          askPrice: pick.opp.askPx,
          targetPrice,
          stopPrice,
          leverage,
          allocatedMarginEur: Number(marginPerBot.toFixed(2)),
          peakPnlEur: initialFeePnl,
          livePnlEur: initialFeePnl,
          liveRoiPct: Number(((initialFeePnl / marginPerBot) * 100).toFixed(2)),
          openedAt: now,
          expiresAt: endsAt,
          okxOrderId,
          reversalsCount: 0,
          entryMeta: {
            spreadPct: pick.opp.spreadPct,
            rsi14: pick.evalRes.snap.rsi14,
            volSurge: pick.evalRes.snap.volSurgeRatio,
            atr1mPct: pick.evalRes.snap.atr1mPct,
            mtfAligned: pick.evalRes.mtfAligned,
            vwapDistPct: pick.evalRes.snap.vwapDistPct,
            reversalTriggerPct: pick.stopPct,
            multiHorizon: pick.multiHorizon,
          },
          status: "open",
        });
      }

      const cycleNumber =
        (botState.history[0]?.cycleNumber ?? botState.history.length) + 1;

      botState.currentCycle = {
        cycleId: `cycle-${cycleNumber}-${now}`,
        cycleNumber,
        startedAt: now,
        endsAt,
        status: "running",
        startingCapitalEur: botState.activeCapitalEur,
        closedSlotPnlEur: 0,
        netPnlEur: Number(
          positions.reduce((s, p) => s + p.livePnlEur, 0).toFixed(2)
        ),
        vaultAddedEur: 0,
        reinvestedEur: 0,
        vaultTotalEur: botState.vaultEur,
        aiModel: usedAiModel,
        marketHeadline: String(
          parsed.marketHeadline || "Cervello Adattivo MTF · 3 Bot AI H24"
        ),
        positions,
        recentSlotEvents: [],
      };
      botState.lastScanAt = now;
      botState.nextCycleAt = endsAt;
      botState.lastError = null;
      botState.updatedAt = now;
      writePersistedBotsState(botState);
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : "Errore avvio ciclo 3 Bot AI";
      let cleanMsg = rawMsg;
      try {
        const parsedErr = JSON.parse(rawMsg);
        if (parsedErr?.error?.message) cleanMsg = String(parsedErr.error.message);
      } catch {
        // keep raw string
      }
      botState.lastError = cleanMsg;
      botState.nextCycleAt = Date.now() + 20000;
      botState.updatedAt = Date.now();
      writePersistedBotsState(botState);
    } finally {
      botCycleStarting = false;
    }
  }

  async function monitorBotsLoop() {
    if (botMonitorBusy || botCycleStarting) return;
    botMonitorBusy = true;
    try {
      const now = Date.now();
      const cycle = botState.currentCycle;
      if (cycle && cycle.status === "running") {
        let tickerMap: Map<string, { last: number; bid: number; ask: number }> | null = null;
        try {
          const tJson = await fetchJsonWithTimeout(
            "https://www.okx.com/api/v5/market/tickers?instType=SWAP",
            {},
            5000
          );
          if (Array.isArray(tJson?.data)) {
            tickerMap = new Map<string, { last: number; bid: number; ask: number }>();
            for (const r of tJson.data as Record<string, string>[]) {
              const px = Number(r.last);
              const bid = Number(r.bidPx) || px;
              const ask = Number(r.askPx) || px;
              if (r.instId && px > 0) tickerMap.set(r.instId, { last: px, bid, ask });
            }
          }
        } catch {
          tickerMap = null;
        }

        const recordSlotEvent = (evt: BotSlotEventServer) => {
          cycle.recentSlotEvents = [evt, ...(cycle.recentSlotEvents || [])].slice(0, 15);
        };

        const fillSlotWithReplacement = async (
          slotIdx: number,
          botIndex: 1 | 2 | 3,
          marginEur: number,
          leverage: number,
          prevSymbol: string,
          prevDirection: "L" | "S",
          realizedPnl: number,
          reasonLabel: string
        ) => {
          const heldIds = new Set(
            cycle.positions
              .filter((p, idx) => idx !== slotIdx && p.status === "open")
              .map((p) => p.instId)
          );
          heldIds.add(cycle.positions[slotIdx].instId);

          const nextPick = await pickAggressiveReplacement(heldIds, tickerMap);
          if (!nextPick) {
            recordSlotEvent({
              ts: now,
              botIndex,
              symbol: prevSymbol,
              direction: prevDirection,
              pnlEur: realizedPnl,
              reason: reasonLabel,
              replacedBy: "In attesa candidato",
            });
            return false;
          }

          const targetPrice =
            nextPick.direction === "L"
              ? nextPick.entryPrice * (1 + nextPick.targetPct / 100)
              : nextPick.entryPrice * (1 - nextPick.targetPct / 100);
          const stopPrice =
            nextPick.direction === "L"
              ? nextPick.entryPrice * (1 - nextPick.stopPct / 100)
              : nextPick.entryPrice * (1 + nextPick.stopPct / 100);

          const okxOrderId = await executeOkxBotOrder(
            nextPick.opp.instId,
            nextPick.direction,
            leverage,
            targetPrice,
            stopPrice
          );
          const initFee = -Number((marginEur * leverage * 0.0008).toFixed(2));

          cycle.positions[slotIdx] = {
            botIndex,
            instId: nextPick.opp.instId,
            symbol: nextPick.opp.baseSymbol,
            name: nextPick.opp.name,
            sector: nextPick.opp.sector,
            direction: nextPick.direction,
            probabilityPct: nextPick.probabilityPct,
            technique: nextPick.technique,
            reasoning: nextPick.reasoning,
            entryPrice: nextPick.entryPrice,
            currentPrice: nextPick.entryPrice,
            bidPrice: nextPick.bidPrice,
            askPrice: nextPick.askPrice,
            targetPrice,
            stopPrice,
            leverage,
            allocatedMarginEur: marginEur,
            peakPnlEur: initFee,
            livePnlEur: initFee,
            liveRoiPct: marginEur > 0 ? Number(((initFee / marginEur) * 100).toFixed(2)) : 0,
            openedAt: now,
            expiresAt: cycle.endsAt,
            okxOrderId,
            reversalsCount: 0,
            entryMeta: nextPick.entryMeta,
            status: "open",
          };

          recordSlotEvent({
            ts: now,
            botIndex,
            symbol: prevSymbol,
            direction: prevDirection,
            pnlEur: realizedPnl,
            reason: reasonLabel,
            replacedBy: `${nextPick.opp.baseSymbol} ${nextPick.direction === "L" ? "LONG" : "SHORT"}`,
          });
          return true;
        };

        if (now < cycle.endsAt) {
          for (let i = 0; i < cycle.positions.length; i++) {
            const pos = cycle.positions[i];
            if (pos.status !== "open") {
              if (pos.exitReason === "Chiusura Manuale Focus") {
                continue;
              }
              await fillSlotWithReplacement(
                i,
                pos.botIndex,
                pos.allocatedMarginEur,
                pos.leverage,
                pos.symbol,
                pos.direction,
                0,
                "Ricarica Slot"
              );
              continue;
            }

            const tk = tickerMap?.get(pos.instId);
            const livePx = tk?.last;
            if (!livePx || livePx <= 0) continue;

            pos.currentPrice = livePx;
            if (tk) {
              pos.bidPrice = tk.bid;
              pos.askPrice = tk.ask;
            }
            const { pnlEur, roiPct } = computeBotPnl(pos, livePx);
            pos.livePnlEur = pnlEur;
            pos.liveRoiPct = roiPct;
            pos.peakPnlEur = Math.max(pos.peakPnlEur, pnlEur);

            const hitTp =
              pos.direction === "L"
                ? livePx >= pos.targetPrice
                : livePx <= pos.targetPrice;
            const hitSl =
              pos.direction === "L"
                ? livePx <= pos.stopPrice
                : livePx >= pos.stopPrice;
            const peakRoi =
              pos.allocatedMarginEur > 0
                ? (pos.peakPnlEur / pos.allocatedMarginEur) * 100
                : 0;
            const hitBreakEvenShield = peakRoi >= 2.8 && roiPct <= 0.85 && pnlEur > 0;
            const hitTrailing = peakRoi >= 5.2 && roiPct <= peakRoi * 0.78 && pnlEur > 0;
            const preExpiryWinner = cycle.endsAt - now <= 15000 && roiPct >= 1.2 && pnlEur > 0;

            const adverseMovePct =
              pos.entryPrice > 0
                ? pos.direction === "L"
                  ? ((pos.entryPrice - livePx) / pos.entryPrice) * 100
                  : ((livePx - pos.entryPrice) / pos.entryPrice) * 100
                : 0;
            const heldMs = now - pos.openedAt;
            const triggerThreshold = pos.entryMeta?.reversalTriggerPct ?? 0.22;
            const wrongInversion = (adverseMovePct >= triggerThreshold || hitSl) && heldMs >= 11000;

            if (hitTp || hitTrailing || hitBreakEvenShield || preExpiryWinner) {
              const winReason = hitTp
                ? "Take Profit"
                : hitTrailing
                ? "Trailing Profit"
                : hitBreakEvenShield
                ? "Break-Even Shield"
                : "Pre-Chiusura Profit";

              if (pos.okxOrderId && okxSession) {
                void okxPrivateRequest(okxSession, "POST", "/api/v5/trade/close-position", {
                  instId: pos.instId,
                  mgnMode: "cross",
                }).catch(() => {});
              }
              cycle.closedSlotPnlEur = Number(((cycle.closedSlotPnlEur || 0) + pnlEur).toFixed(2));
              botState.totalTrades += 1;
              if (pnlEur >= 0) botState.wins += 1;
              else botState.losses += 1;
              recordBotOutcomeAndLearn(pos, pnlEur, winReason);

              pos.status = "closed";
              pos.closedAt = now;
              pos.exitReason = winReason;

              await fillSlotWithReplacement(
                i,
                pos.botIndex,
                pos.allocatedMarginEur,
                pos.leverage,
                pos.symbol,
                pos.direction,
                pnlEur,
                `${winReason} → Ricarica`
              );
            } else if (wrongInversion) {
              if (pos.okxOrderId && okxSession) {
                void okxPrivateRequest(okxSession, "POST", "/api/v5/trade/close-position", {
                  instId: pos.instId,
                  mgnMode: "cross",
                }).catch(() => {});
              }
              cycle.closedSlotPnlEur = Number(((cycle.closedSlotPnlEur || 0) + pnlEur).toFixed(2));
              botState.totalTrades += 1;
              if (pnlEur >= 0) botState.wins += 1;
              else botState.losses += 1;
              recordBotOutcomeAndLearn(pos, pnlEur, `Inversione (-${adverseMovePct.toFixed(2)}%)`);

              // Check fresh 1m candle confirmation before flipping vs rotating cleanly
              const flipSnap = await fetchCandleSnapshot(pos.instId).catch(() => null);
              const oppDir: "L" | "S" = pos.direction === "L" ? "S" : "L";
              const oppMomentumConfirmed =
                flipSnap &&
                ((oppDir === "L" && flipSnap.vel1mPct > 0.01 && flipSnap.rsi14 < 74) ||
                  (oppDir === "S" && flipSnap.vel1mPct < -0.01 && flipSnap.rsi14 > 26));

              if ((pos.reversalsCount || 0) === 0 && oppMomentumConfirmed) {
                const atr = Math.max(0.1, Math.min(0.4, flipSnap?.atr1mPct || 0.16));
                const tpPct = Number((atr * 1.55 + 0.08).toFixed(3));
                const slPct = Number((atr * 1.35 + 0.06).toFixed(3));
                const newTp =
                  oppDir === "L" ? livePx * (1 + tpPct / 100) : livePx * (1 - tpPct / 100);
                const newSl =
                  oppDir === "L" ? livePx * (1 - slPct / 100) : livePx * (1 + slPct / 100);
                const okxOrderId = await executeOkxBotOrder(
                  pos.instId,
                  oppDir,
                  pos.leverage,
                  newTp,
                  newSl
                );
                const initFee = -Number(
                  (pos.allocatedMarginEur * pos.leverage * 0.0008).toFixed(2)
                );

                recordSlotEvent({
                  ts: now,
                  botIndex: pos.botIndex,
                  symbol: pos.symbol,
                  direction: pos.direction,
                  pnlEur,
                  reason: `Inversione Verificata (${adverseMovePct.toFixed(2)}%)`,
                  replacedBy: `${pos.symbol} ${oppDir === "L" ? "LONG" : "SHORT"}`,
                });

                cycle.positions[i] = {
                  ...pos,
                  direction: oppDir,
                  probabilityPct: Math.min(95, Math.max(78, pos.probabilityPct)),
                  technique: "Tecnica Inversione Verificata ATR",
                  reasoning: `Inversione strutturale confermata 1m su ${pos.symbol} (-${adverseMovePct.toFixed(2)}%): flip ${pos.direction === "L" ? "LONG→SHORT" : "SHORT→LONG"} a ${livePx} (ATR ${atr}%).`,
                  entryPrice: livePx,
                  currentPrice: livePx,
                  targetPrice: newTp,
                  stopPrice: newSl,
                  peakPnlEur: initFee,
                  livePnlEur: initFee,
                  liveRoiPct:
                    pos.allocatedMarginEur > 0
                      ? Number(((initFee / pos.allocatedMarginEur) * 100).toFixed(2))
                      : 0,
                  openedAt: now,
                  expiresAt: cycle.endsAt,
                  closedAt: undefined,
                  exitReason: undefined,
                  okxOrderId,
                  reversalsCount: 1,
                  entryMeta: {
                    ...pos.entryMeta,
                    atr1mPct: atr,
                    reversalTriggerPct: slPct,
                  },
                  status: "open",
                };
              } else {
                // Skip blind flip in chop or post-inversion: rotate to the top un-quarantined market
                pos.status = "closed";
                pos.closedAt = now;
                pos.exitReason = "Rotazione Adattiva Anti-Errore";
                await fillSlotWithReplacement(
                  i,
                  pos.botIndex,
                  pos.allocatedMarginEur,
                  pos.leverage,
                  pos.symbol,
                  pos.direction,
                  pnlEur,
                  "Rotazione Adattiva"
                );
              }
            }
          }
        }

        const openLegsPnl = cycle.positions.reduce(
          (s, p) => s + (p.status === "open" ? p.livePnlEur : 0),
          0
        );
        cycle.netPnlEur = Number(((cycle.closedSlotPnlEur || 0) + openLegsPnl).toFixed(2));
        botState.updatedAt = now;
        writePersistedBotsState(botState);

        if (now >= cycle.endsAt) {
          await finalizeActiveCycle("Chiusura automatica 2m");
          if (botState.active && botState.config.enabled24h) {
            void runThreeBotCycle(false);
          }
        }
      } else if (
        botState.active &&
        botState.config.enabled24h &&
        (botState.nextCycleAt === 0 || now >= botState.nextCycleAt)
      ) {
        void runThreeBotCycle(false);
      }
    } finally {
      botMonitorBusy = false;
    }
  }

  // On boot, finalize any stale running cycle from an older session before starting loop
  if (botState.currentCycle && Date.now() >= botState.currentCycle.endsAt) {
    void finalizeActiveCycle("Ripristino post-riavvio");
  }
  const botLoopTimer = setInterval(() => {
    void monitorBotsLoop();
  }, 3000);
  botLoopTimer.unref();

  app.get("/api/bots/state", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      state: botState,
      cycleStarting: botCycleStarting,
      okxCopyConnected: Boolean(okxSession),
    });
  });

  app.post("/api/bots/config", (req, res) => {
    const body = req.body || {};
    if (typeof body.active === "boolean") {
      botState.active = body.active;
      botState.config.enabled24h = body.active;
    }
    if (typeof body.enabled24h === "boolean") {
      botState.config.enabled24h = body.enabled24h;
      botState.active = body.enabled24h;
    }
    if (typeof body.cycleDurationSec === "number" && Number.isFinite(body.cycleDurationSec)) {
      botState.config.cycleDurationSec = Math.max(60, Math.min(300, Math.round(body.cycleDurationSec)));
    }
    if (typeof body.leverage === "number" && Number.isFinite(body.leverage)) {
      botState.config.leverage = Math.max(2, Math.min(50, Math.round(body.leverage)));
    }
    if (body.tradeAmountMode === "auto" || body.tradeAmountMode === "fixed") {
      botState.config.tradeAmountMode = body.tradeAmountMode;
    }
    if (typeof body.fixedPerBotEur === "number" && Number.isFinite(body.fixedPerBotEur)) {
      botState.config.fixedPerBotEur = Math.max(10, Math.min(10000, body.fixedPerBotEur));
    }
    if (typeof body.autoCopyToOkx === "boolean") {
      botState.config.autoCopyToOkx = body.autoCopyToOkx;
    }
    if (
      typeof body.horizonMode === "string" &&
      ["scalping", "intraday", "swing", "macro"].includes(body.horizonMode)
    ) {
      botState.config.horizonMode = body.horizonMode as BotHorizonModeServer;
    }
    if (botState.active && !botState.currentCycle) {
      botState.nextCycleAt = Date.now() + 500;
    }
    botState.updatedAt = Date.now();
    writePersistedBotsState(botState);
    res.json({ ok: true, state: botState });
  });

  app.get("/api/bots/live-quote", async (req, res) => {
    try {
      const instId = String(req.query.instId || "").trim();
      const directionParam = req.query.direction === "S" ? "S" : "L";
      if (!instId) {
        res.status(400).json({ error: "Missing instId" });
        return;
      }

      const [tickerRes, candles1mRes, mhBundle] = await Promise.allSettled([
        fetchJsonWithTimeout(
          `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
          {},
          4500
        ),
        fetchJsonWithTimeout(
          `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1m&limit=24`,
          {},
          4500
        ),
        fetchRawMultiHorizonBundle(instId),
      ]);

      const row =
        tickerRes.status === "fulfilled" && Array.isArray(tickerRes.value?.data)
          ? (tickerRes.value.data[0] as Record<string, string> | undefined)
          : undefined;
      if (!row) {
        res.status(502).json({ error: "Prezzo live non disponibile per questo mercato" });
        return;
      }

      const last = Number(row.last);
      const bid = Number(row.bidPx) || last;
      const ask = Number(row.askPx) || last;
      const open24h = Number(row.open24h) || last;
      const high24h = Number(row.high24h) || last;
      const low24h = Number(row.low24h) || last;
      const spreadPct = last > 0 ? Number((((ask - bid) / last) * 100).toFixed(4)) : 0;
      const changePct24h = open24h > 0 ? Number((((last - open24h) / open24h) * 100).toFixed(2)) : 0;

      const sparkline: number[] =
        candles1mRes.status === "fulfilled" && Array.isArray(candles1mRes.value?.data)
          ? [...(candles1mRes.value.data as string[][])]
              .reverse()
              .map((r) => Number(r[4]))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

      const multiHorizon =
        mhBundle.status === "fulfilled"
          ? buildMultiHorizonEstimate(
              mhBundle.value,
              directionParam,
              botState.config.horizonMode || "scalping"
            )
          : null;

      res.setHeader("Cache-Control", "no-store");
      res.json({
        instId,
        last,
        bid,
        ask,
        open24h,
        high24h,
        low24h,
        spreadPct,
        changePct24h,
        sparkline,
        multiHorizon,
        ts: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore live quote";
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/bots/close-slot", async (req, res) => {
    try {
      const botIndex = Number(req.body?.botIndex);
      if (![1, 2, 3].includes(botIndex)) {
        res.status(400).json({ error: "botIndex non valido (1, 2 o 3)" });
        return;
      }
      const cycle = botState.currentCycle;
      if (!cycle || cycle.status !== "running") {
        res.status(409).json({ error: "Nessun ciclo attivo in corso" });
        return;
      }
      const pos = cycle.positions.find((p) => p.botIndex === botIndex && p.status === "open");
      if (!pos) {
        res.status(404).json({ error: "Posizione già chiusa o non trovata" });
        return;
      }

      let livePx = pos.currentPrice || pos.entryPrice;
      try {
        const tkJson = await fetchJsonWithTimeout(
          `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(pos.instId)}`,
          {},
          4500
        );
        const row = Array.isArray(tkJson?.data) ? tkJson.data[0] : null;
        const px = Number(row?.last);
        if (px > 0) {
          livePx = px;
          pos.bidPrice = Number(row?.bidPx) || px;
          pos.askPrice = Number(row?.askPx) || px;
        }
      } catch {
        // use latest live price
      }

      const now = Date.now();
      pos.currentPrice = livePx;
      const { pnlEur, roiPct } = computeBotPnl(pos, livePx);
      pos.livePnlEur = pnlEur;
      pos.liveRoiPct = roiPct;
      pos.peakPnlEur = Math.max(pos.peakPnlEur, pnlEur);
      pos.status = "closed";
      pos.closedAt = now;
      pos.exitReason = "Chiusura Manuale Focus";

      if (pos.okxOrderId && okxSession) {
        void okxPrivateRequest(okxSession, "POST", "/api/v5/trade/close-position", {
          instId: pos.instId,
          mgnMode: "cross",
        }).catch(() => {});
      }

      cycle.closedSlotPnlEur = Number(((cycle.closedSlotPnlEur || 0) + pnlEur).toFixed(2));
      botState.totalTrades += 1;
      if (pnlEur >= 0) botState.wins += 1;
      else botState.losses += 1;
      recordBotOutcomeAndLearn(pos, pnlEur, "Chiusura Manuale Focus");

      cycle.recentSlotEvents = [
        {
          ts: now,
          botIndex: pos.botIndex,
          symbol: pos.symbol,
          direction: pos.direction,
          pnlEur,
          reason: "Chiusura Manuale Focus",
          replacedBy: "Slot libero fino al prossimo ciclo",
        },
        ...(cycle.recentSlotEvents || []),
      ].slice(0, 15);

      const openLegsPnl = cycle.positions.reduce(
        (s, p) => s + (p.status === "open" ? p.livePnlEur : 0),
        0
      );
      cycle.netPnlEur = Number(((cycle.closedSlotPnlEur || 0) + openLegsPnl).toFixed(2));
      botState.updatedAt = now;
      writePersistedBotsState(botState);

      res.json({ ok: true, closedPosition: pos, state: botState });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore chiusura posizione";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/bots/run-cycle", async (_req, res) => {
    await runThreeBotCycle(true);
    res.json({ ok: !botState.lastError, state: botState });
  });

  app.post("/api/bots/emergency-close", async (_req, res) => {
    const openBefore =
      botState.currentCycle?.positions.filter((p) => p.status === "open").length ?? 0;
    botState.active = false;
    botState.config.enabled24h = false;
    botState.nextCycleAt = 0;
    if (botState.currentCycle && botState.currentCycle.status === "running") {
      await finalizeActiveCycle("Vendita d'Emergenza");
    }
    botState.active = false;
    botState.config.enabled24h = false;
    botState.nextCycleAt = 0;
    botState.updatedAt = Date.now();
    writePersistedBotsState(botState);
    res.json({ ok: true, closedCount: openBefore, state: botState });
  });

  app.post("/api/bots/rebalance", async (_req, res) => {
    botState.config.tradeAmountMode = "auto";
    botState.active = true;
    botState.config.enabled24h = true;
    if (botState.currentCycle && botState.currentCycle.status === "running") {
      await finalizeActiveCycle("Ribilanciamento Portafoglio");
    }
    await runThreeBotCycle(true);
    res.json({ ok: !botState.lastError, state: botState });
  });

  app.post("/api/bots/reset", (_req, res) => {
    botState = createDefaultBotState();
    botState.active = false;
    botState.config.enabled24h = false;
    botState.nextCycleAt = 0;
    writePersistedBotsState(botState);
    res.json({ ok: true, state: botState });
  });

  const httpServer = http.createServer(app);

  if (!isProduction) {
    const hmrEnabled = process.env.DISABLE_HMR !== "true";
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
        ws: { server: httpServer },
        watch: hmrEnabled ? {} : null,
        allowedHosts: true,
      },
      appType: "spa",
    });

    if (!hmrEnabled) {
      app.get("/@vite/client", async (_req, res, next) => {
        try {
          const transformed = await vite.transformRequest("/@vite/client");
          if (!transformed?.code) {
            next();
            return;
          }
          const patched = transformed.code.replace(
            "transport.connect(createHMRHandler(handleMessage));",
            "/* HMR disabled: websocket connect suppressed */"
          );
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.status(200).send(patched);
        } catch {
          next();
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Scalper Pro LIVE server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
