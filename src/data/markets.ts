import type { BackdropConfig, BackdropPresetId, MarketAsset, StrategyConfig } from "../types/trading";

export const DEFAULT_MARKETS: MarketAsset[] = [
  { pair: "BTC/USD", name: "Bitcoin", group: "c", okxId: "BTC-USDT-SWAP" },
  { pair: "ETH/USD", name: "Ethereum", group: "c", okxId: "ETH-USDT-SWAP" },
  { pair: "SOL/USD", name: "Solana", group: "c", okxId: "SOL-USDT-SWAP" },
  { pair: "XRP/USD", name: "XRP", group: "c", okxId: "XRP-USDT-SWAP" },
  { pair: "BNB/USD", name: "BNB", group: "c", okxId: "BNB-USDT-SWAP" },
  { pair: "DOGE/USD", name: "Dogecoin", group: "c", okxId: "DOGE-USDT-SWAP" },
  { pair: "ADA/USD", name: "Cardano", group: "c", okxId: "ADA-USDT-SWAP" },
  { pair: "AVAX/USD", name: "Avalanche", group: "c", okxId: "AVAX-USDT-SWAP" },
  { pair: "LINK/USD", name: "Chainlink", group: "c", okxId: "LINK-USDT-SWAP" },
  { pair: "SUI/USD", name: "Sui", group: "c", okxId: "SUI-USDT-SWAP" },
  { pair: "TON/USD", name: "Toncoin", group: "c", okxId: "TON-USDT-SWAP" },
  { pair: "XAUT/USD", name: "Tether Gold (OKX)", group: "c", okxId: "XAUT-USDT-SWAP" },
  { pair: "NVDA", name: "NVIDIA (Azione)", group: "s", yahooSymbol: "NVDA" },
  { pair: "AAPL", name: "Apple (Azione)", group: "s", yahooSymbol: "AAPL" },
  { pair: "TSLA", name: "Tesla (Azione)", group: "s", yahooSymbol: "TSLA" },
  { pair: "MSFT", name: "Microsoft (Azione)", group: "s", yahooSymbol: "MSFT" },
  { pair: "AMZN", name: "Amazon (Azione)", group: "s", yahooSymbol: "AMZN" },
  { pair: "SPX500", name: "S&P 500", group: "i", yahooSymbol: "^GSPC" },
  { pair: "NSDQ100", name: "Nasdaq 100", group: "i", yahooSymbol: "^NDX" },
  { pair: "DJ30", name: "Dow Jones", group: "i", yahooSymbol: "^DJI" },
  { pair: "GER40", name: "DAX 40", group: "i", yahooSymbol: "^GDAXI" },
  { pair: "UK100", name: "FTSE 100", group: "i", yahooSymbol: "^FTSE" },
  { pair: "JPN225", name: "Nikkei 225", group: "i", yahooSymbol: "^N225" },
  { pair: "FRA40", name: "CAC 40", group: "i", yahooSymbol: "^FCHI" },
  { pair: "GOLD", name: "Oro Spot", group: "m", yahooSymbol: "GC=F" },
  { pair: "SILVER", name: "Argento Spot", group: "m", yahooSymbol: "SI=F" },
];

export const DEFAULT_CONFIG: StrategyConfig = {
  capital: 500,
  sizeEur: 150,
  feeEur: 1,
  cryptoLeverage: 10,
  tradfiLeverage: 5,
  maxOpen: 3,
  minRR: 1.5,
  minConfirmations: 3,
  minScore: 65,
  minTargetRoiPct: 10,
  maxHoldSec: 7200,
  requireAiApproval: true,
  enableTrailingProfit: true,
  tgToken: "",
  tgChatId: "",
};

export function formatEur(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}€${Math.abs(value).toFixed(2)}`;
}

export function formatSignedEur(value: number): string {
  if (value > 0) return `+€${value.toFixed(2)}`;
  if (value < 0) return `-€${Math.abs(value).toFixed(2)}`;
  return "€0.00";
}

export function formatPrice(value: number): string {
  if (!(value > 0)) return "–";
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(3);
  if (value >= 0.01) return value.toFixed(5);
  return value.toFixed(7);
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function getCostSpecs(asset: MarketAsset, cfg: StrategyConfig) {
  const leverage = asset.group === "c" ? cfg.cryptoLeverage : cfg.tradfiLeverage;
  const notional = cfg.sizeEur * leverage;
  const costPct = notional > 0 ? ((2 * cfg.feeEur) / notional) * 100 : 0;
  return { leverage, notional, costPct };
}

export function getAssetCategoryLabel(asset: MarketAsset): string {
  if (asset.group === "c") return "Crypto OKX";
  if (asset.group === "s") return "Azione";
  if (asset.group === "m") return "Metallo";
  return "Indice";
}

export interface BackdropPresetMeta {
  id: BackdropPresetId;
  label: string;
  description: string;
  imagePath?: string;
}

export const BACKDROP_PRESETS: BackdropPresetMeta[] = [
  {
    id: "executive",
    label: "Executive Desk",
    description: "Sala direzionale antracite con luce smeraldo",
    imagePath: "/src/assets/images/etoro_executive_backdrop_1795126283985.jpg",
  },
  {
    id: "skyline",
    label: "Skyline Finanziario",
    description: "Distretto finanziario notturno vista panoramica",
    imagePath: "/src/assets/images/skyline_finance_backdrop_1795126283737.jpg",
  },
  {
    id: "trading_hq",
    label: "Sala Trading HQ",
    description: "Floor operativo istituzionale panoramico",
    imagePath: "/src/assets/images/trading_hq_backdrop_1795124782918.jpg",
  },
  {
    id: "obsidian_slate",
    label: "Obsidian Pro",
    description: "Sfondo tecnico scuro antracite ad alto contrasto",
  },
  {
    id: "etoro_clean",
    label: "eToro Slate Pro",
    description: "Sfondo ardesia-smeraldo sobrio per massima lettura",
  },
];

export const DEFAULT_BACKDROP: BackdropConfig = {
  preset: "executive",
  customUrl: "",
  intensity: 60,
  blurPx: 0,
};

export function getAssetBadgeMeta(asset: MarketAsset): { code: string; bgClass: string } {
  const sym = asset.pair.split("/")[0].replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase();
  const palette: Record<string, string> = {
    BTC: "bg-amber-500 text-slate-950",
    ETH: "bg-indigo-600 text-white",
    SOL: "bg-teal-600 text-white",
    XRP: "bg-slate-700 text-white",
    BNB: "bg-yellow-500 text-slate-950",
    DOGE: "bg-amber-600 text-white",
    ADA: "bg-blue-600 text-white",
    AVAX: "bg-red-600 text-white",
    NVDA: "bg-emerald-600 text-white",
    AAPL: "bg-slate-800 text-white",
    TSLA: "bg-rose-600 text-white",
    MSFT: "bg-sky-600 text-white",
    AMZN: "bg-orange-500 text-slate-950",
    SPX5: "bg-blue-700 text-white",
    NSDQ: "bg-cyan-700 text-white",
    GOLD: "bg-amber-500 text-slate-950",
    SILV: "bg-slate-500 text-white",
  };
  if (palette[sym]) {
    return { code: sym, bgClass: palette[sym] };
  }
  const fallback =
    asset.group === "c"
      ? "bg-emerald-700 text-white"
      : asset.group === "s"
      ? "bg-blue-700 text-white"
      : asset.group === "m"
      ? "bg-amber-600 text-white"
      : "bg-slate-700 text-white";
  return { code: sym || "MKT", bgClass: fallback };
}
