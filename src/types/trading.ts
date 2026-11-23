export type AssetGroup = "c" | "i" | "m" | "s";

export interface MarketAsset {
  pair: string;
  name: string;
  group: AssetGroup;
  okxId?: string;
  yahooSymbol?: string;
  custom?: boolean;
}

export interface CandleBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LiveQuote {
  bid: number;
  ask: number;
  mid: number;
  open24h?: number;
  high24h?: number;
  low24h?: number;
  vol24h?: number;
  ts: number;
  marketState: string;
  source: "OKX WS" | "OKX REST" | "Yahoo";
}

export interface GateCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface AiValidationResult {
  approved: boolean;
  confidence: number;
  recommendedSide: "L" | "S" | "HOLD";
  reasoning: string;
  keyFactors: string[];
  checkedAt: number;
  error?: string;
}

export interface TechnicalAnalysis {
  warmingUp: boolean;
  hasSwing: boolean;
  direction: "L" | "S";
  fibDepth: number;
  swingHigh: number;
  swingLow: number;
  tpPct: number;
  slPct: number;
  tpRoiPct: number;
  slRoiPct: number;
  rrNet: number;
  confirmations: string[];
  score: number;
  winProbabilityPct: number;
  costPct: number;
  spreadPct: number;
  atrPct: number;
  supertrendDir: "L" | "S";
  trend5m: "L" | "S" | "N";
  inFibZone: boolean;
  bounceConfirmed: boolean;
  spreadOk: boolean;
  gates: GateCheck[];
  allGatesPassed: boolean;
  ok: boolean;
  e20: number;
  e60: number;
  rsi14: number;
  macdHist: number;
  bbPos: number;
  e20Series: number[];
  e60Series: number[];
  bbUpperSeries: number[];
  bbLowerSeries: number[];
}

export interface OpenPosition {
  pair: string;
  side: "L" | "S";
  entryPrice: number;
  sizeEur: number;
  notionalEur: number;
  leverage: number;
  feePerSide: number;
  openedAt: number;
  tpPct: number;
  slPct: number;
  breakEvenProtected: boolean;
  trailingActive: boolean;
  peakRoiPct: number;
  costPct: number;
  reason: string;
  gatesPassed: number;
  aiConfidence?: number;
  aiReasoning?: string;
  okxOrderId?: string;
}

export interface ClosedTrade {
  id: string;
  pair: string;
  name: string;
  side: "L" | "S";
  sizeEur: number;
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  netEur: number;
  peakRoiPct?: number;
  reason: string;
  openedAt: number;
  closedAt: number;
  aiConfidence?: number;
  okxOrderId?: string;
}

export interface AuditLogEntry {
  id: string;
  ts: number;
  pair: string;
  name: string;
  direction: "L" | "S";
  score: number;
  tpRoiPct: number;
  gatesPassed: number;
  aiApproved: boolean;
  aiConfidence: number;
  aiReasoning: string;
  action: "APERTA" | "COPIATA SU OKX" | "RIFIUTATA IA" | "ERRORE IA";
  okxOrderId?: string;
}

export interface StrategyConfig {
  capital: number;
  sizeEur: number;
  feeEur: number;
  cryptoLeverage: number;
  tradfiLeverage: number;
  maxOpen: number;
  minRR: number;
  minConfirmations: number;
  minScore: number;
  minTargetRoiPct: number;
  maxHoldSec: number;
  requireAiApproval: boolean;
  enableTrailingProfit: boolean;
  tgToken: string;
  tgChatId: string;
}

export interface AccountStats {
  totalTrades: number;
  wins: number;
  losses: number;
  realizedPnl: number;
  totalFees: number;
}

export interface ToastNotice {
  id: string;
  title: string;
  body: string;
  tone: "up" | "dn" | "neutral";
}

export interface OkxTickerRow {
  instId: string;
  instType: string;
  last: number;
  bidPx: number;
  askPx: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volCcy24h: number;
  changePct24h: number;
}

export interface OkxCopyStatus {
  connected: boolean;
  simulated?: boolean;
  maskedKey?: string;
  totalEqUsd?: number;
  balances?: { ccy: string; availBal: number; eqUsd: number }[];
  positions?: {
    instId: string;
    posSide: string;
    pos: number;
    avgPx: number;
    upl: number;
    uplRatio: number;
    lever: number;
  }[];
  copySubpositionsCount?: number;
  error?: string;
}

export interface OkxCopySettings {
  enabled: boolean;
  orderSizeContracts: string;
  marginMode: "cross" | "isolated";
}

export type BackdropPresetId =
  | "executive"
  | "skyline"
  | "trading_hq"
  | "obsidian_slate"
  | "etoro_clean"
  | "custom";

export interface BackdropConfig {
  preset: BackdropPresetId;
  customUrl: string;
  intensity: number;
  blurPx: number;
}

export type AlertSoundPreset = "bell" | "chime" | "sonar" | "pulse" | "siren";

export type PriceAlertCondition = "above" | "below";

export interface PriceAlert {
  id: string;
  pair: string;
  assetName: string;
  condition: PriceAlertCondition;
  targetPrice: number;
  soundPreset: AlertSoundPreset;
  enabled: boolean;
  repeatUntilDismissed: boolean;
  note?: string;
  createdAt: number;
  triggeredAt?: number;
  triggeredPrice?: number;
}

export interface SoundSettings {
  muted: boolean;
  volume: number;
  defaultPreset: AlertSoundPreset;
}

export type CryptoSector = "memecoin" | "major" | "altcoin";

export type CryptoTrendRegime =
  | "ALTAMENTE RIALZISTA"
  | "RIALZISTA"
  | "RIMBALZO ATTESO"
  | "RIBASSISTA"
  | "ALTAMENTE RIBASSISTA";

export interface GlobalCryptoSentiment {
  fearGreedValue: number | null;
  fearGreedLabel: string;
  fearGreedPrevValue: number | null;
  globalMarketCapChange24hPct: number | null;
  btcDominancePct: number | null;
  ethDominancePct: number | null;
  okxTotalPairs: number;
  okxBullishBreadthPct: number;
  avg24hChangePct: number;
  memecoinAvg24hChangePct: number;
  btcChange24hPct: number | null;
  ethChange24hPct: number | null;
  solChange24hPct: number | null;
  globalRegime:
    | "RIALZISTA FORTE"
    | "RIALZISTA"
    | "MISTO / ROTAZIONE"
    | "RIBASSISTA"
    | "RIBASSISTA FORTE";
  updatedAt: number;
}

export interface CryptoOpportunityRow {
  instId: string;
  baseSymbol: string;
  name: string;
  sector: CryptoSector;
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
  trendLabel: CryptoTrendRegime;
  direction: "L" | "S";
  reasons: string[];
}

export interface CryptoAiBrief {
  headline: string;
  globalSentimentSummary: string;
  memecoinOutlook: string;
  topBullishPick: string;
  topBearishPick: string;
  riskNote: string;
  generatedAt: number;
}

export interface PreBreakoutSignal {
  instId: string;
  baseSymbol: string;
  name: string;
  sector: CryptoSector;
  direction: "L" | "S";
  lastPrice: number;
  changePct24h: number;
  range24hPct: number;
  probabilityPct: number;
  potentialMovePct: number;
  technique: string;
  triggerNote: string;
  urgency: "IMMINENTE" | "ALTA" | "RADAR";
  volUsd24h: number;
}

export interface EmailAlertDispatchRecord {
  alertId: string;
  recipientEmail: string;
  subject: string;
  topAsset: string;
  signalsCount: number;
  sentAt: number;
}

export type BotMarketSector =
  | CryptoSector
  | "metallo"
  | "azione"
  | "altro_mercato";

export type BotHorizonMode = "scalping" | "intraday" | "swing" | "macro";

export interface HorizonTimeframeStat {
  label: string;
  bar: string;
  barsAnalyzed: number;
  changePct: number;
  trend: "L" | "S" | "FLAT";
  rangePosPct: number;
}

export interface MultiHorizonEstimate {
  horizonMode: BotHorizonMode;
  hours: HorizonTimeframeStat | null;
  days: HorizonTimeframeStat | null;
  weeks: HorizonTimeframeStat | null;
  monthsYears: HorizonTimeframeStat | null;
  alignmentScore: number;
  summary: string;
}

export interface BotPositionEntryMeta {
  spreadPct?: number;
  rsi14?: number;
  volSurge?: number;
  atr1mPct?: number;
  mtfAligned?: boolean;
  vwapDistPct?: number;
  reversalTriggerPct?: number;
  multiHorizon?: MultiHorizonEstimate;
}

export interface BotPositionItem {
  botIndex: 1 | 2 | 3;
  instId: string;
  symbol: string;
  name: string;
  sector: BotMarketSector;
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
  entryMeta?: BotPositionEntryMeta;
  status: "open" | "closed";
}

export interface BotSlotEvent {
  ts: number;
  botIndex: 1 | 2 | 3;
  symbol: string;
  direction: "L" | "S";
  pnlEur: number;
  reason: string;
  replacedBy: string;
}

export interface BotCycleSnapshot {
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
  positions: BotPositionItem[];
  recentSlotEvents?: BotSlotEvent[];
}

export interface BotEngineConfig {
  enabled24h: boolean;
  cycleDurationSec: number;
  vaultReservePct: number;
  monthlyGoalPct: number;
  leverage: number;
  tradeAmountMode: "auto" | "fixed";
  fixedPerBotEur: number;
  autoCopyToOkx: boolean;
  horizonMode?: BotHorizonMode;
}

export interface BotLearningAssetStat {
  instId: string;
  symbol: string;
  wins: number;
  losses: number;
  netPnlEur: number;
  consecutiveLosses: number;
  cooldownUntil: number;
  lastOutcomeAt: number;
}

export interface BotLearningBucketStat {
  key: string;
  wins: number;
  losses: number;
  netPnlEur: number;
}

export interface BotLearningMistake {
  ts: number;
  symbol: string;
  instId: string;
  sector: BotMarketSector;
  direction: "L" | "S";
  technique: string;
  pnlEur: number;
  diagnosis: string;
  correctiveRule: string;
}

export interface BotTechniquePlaybookItem {
  name: string;
  hypothesis: string;
  horizon: BotHorizonMode;
  wins: number;
  losses: number;
  netPnlEur: number;
  status: "vincente" | "in_test" | "scartata";
  createdAt: number;
  lastUsedAt: number;
}

export interface BotPositionLesson {
  ts: number;
  symbol: string;
  direction: "L" | "S";
  technique: string;
  pnlEur: number;
  outcome: "win" | "loss";
  horizonSummary: string;
  lesson: string;
}

export interface BotAdaptiveParams {
  minParsimonyScore: number;
  maxSpreadPct: number;
  requireMtf5m: boolean;
  minVolSurge: number;
  atrTpMultiplier: number;
  atrInversionMultiplier: number;
}

export interface BotLearningMemory {
  totalEvaluated: number;
  blockedByLearningCount: number;
  recentMistakes: BotLearningMistake[];
  positionLessons?: BotPositionLesson[];
  discoveredTechniques?: BotTechniquePlaybookItem[];
  assetStats: Record<string, BotLearningAssetStat>;
  techniqueStats: Record<string, BotLearningBucketStat>;
  sectorStats: Record<string, BotLearningBucketStat>;
  adaptiveParams: BotAdaptiveParams;
  lastCalibratedAt: number;
}

export interface BotEngineState {
  active: boolean;
  startingMonthCapitalEur: number;
  activeCapitalEur: number;
  vaultEur: number;
  totalRealizedPnlEur: number;
  totalGrossProfitEur?: number;
  totalGrossLossEur?: number;
  totalTrades: number;
  wins: number;
  losses: number;
  currentCycle: BotCycleSnapshot | null;
  history: BotCycleSnapshot[];
  config: BotEngineConfig;
  learning?: BotLearningMemory;
  lastScanAt: number;
  nextCycleAt: number;
  lastError: string | null;
  updatedAt: number;
}



