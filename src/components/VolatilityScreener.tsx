import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Search,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { formatPrice, getAssetBadgeMeta } from "../data/markets";
import type {
  CryptoOpportunityRow,
  LiveQuote,
  MarketAsset,
  TechnicalAnalysis,
} from "../types/trading";

interface VolatilityScreenerProps {
  markets: MarketAsset[];
  quotes: Record<string, LiveQuote>;
  analyses: Record<string, TechnicalAnalysis>;
  cryptoOpportunities: CryptoOpportunityRow[];
  selectedPair: string;
  selectedOkxId?: string;
  tickNow: number;
  requireAiApproval: boolean;
  aiBusyPair: string | null;
  onSelectMarketAsset: (pair: string) => void;
  onSelectCryptoOpportunity: (row: CryptoOpportunityRow) => void;
  onQuickOpen: (
    asset: MarketAsset,
    quote: LiveQuote,
    analysis: TechnicalAnalysis,
    side: "L" | "S"
  ) => void;
  embedded?: boolean;
}

type VolatilityCategoryTab = "all" | "crypto" | "tradfi";
type VolatilityThreshold = "all" | "3" | "6";

interface ScreenerRow {
  key: string;
  name: string;
  symbolLabel: string;
  assetClassLabel: string;
  isCrypto: boolean;
  isMemecoin: boolean;
  isMonitored: boolean;
  isSelected: boolean;
  price: number;
  high24h: number;
  low24h: number;
  volatility24hPct: number;
  isAtrEstimated: boolean;
  change24hPct: number | null;
  rangePosPct: number;
  atrPct: number | null;
  direction: "L" | "S";
  marketAsset?: MarketAsset;
  quote?: LiveQuote;
  analysis?: TechnicalAnalysis;
  cryptoRow?: CryptoOpportunityRow;
}

function getVolatilityTier(volPct: number): {
  label: string;
  textClass: string;
  barClass: string;
} {
  if (volPct >= 12) {
    return {
      label: "Esplosivo",
      textClass: "text-amber-600 dark:text-amber-400",
      barClass: "bg-amber-500",
    };
  }
  if (volPct >= 6) {
    return {
      label: "Alta Volatilità",
      textClass: "text-emerald-600 dark:text-emerald-400",
      barClass: "bg-emerald-500",
    };
  }
  if (volPct >= 2.5) {
    return {
      label: "Momentum Attivo",
      textClass: "text-blue-600 dark:text-blue-400",
      barClass: "bg-blue-500",
    };
  }
  return {
    label: "Moderato",
    textClass: "text-slate-600 dark:text-slate-400",
    barClass: "bg-slate-400 dark:bg-slate-600",
  };
}

function getTradfiGroupLabel(group: MarketAsset["group"]): string {
  if (group === "s") return "Azione USA";
  if (group === "i") return "Indice / ETF";
  if (group === "m") return "Materia Prima";
  return "Crypto";
}

export const VolatilityScreener: React.FC<VolatilityScreenerProps> = ({
  markets,
  quotes,
  analyses,
  cryptoOpportunities,
  selectedPair,
  selectedOkxId,
  tickNow,
  requireAiApproval,
  aiBusyPair,
  onSelectMarketAsset,
  onSelectCryptoOpportunity,
  onQuickOpen,
  embedded = false,
}) => {
  const [categoryTab, setCategoryTab] = useState<VolatilityCategoryTab>("all");
  const [minThreshold, setMinThreshold] = useState<VolatilityThreshold>("all");
  const [search, setSearch] = useState<string>("");
  const [expanded, setExpanded] = useState<boolean>(false);

  const cryptoByOkxId = useMemo(() => {
    const map = new Map<string, CryptoOpportunityRow>();
    for (const row of cryptoOpportunities) {
      map.set(row.instId, row);
    }
    return map;
  }, [cryptoOpportunities]);

  const unifiedRows = useMemo<ScreenerRow[]>(() => {
    const seenOkxIds = new Set<string>();
    const rows: ScreenerRow[] = [];

    // 1. Monitored Watchlist Assets (live OKX WS/REST & Yahoo Finance)
    for (const asset of markets) {
      const q = quotes[asset.pair];
      if (!q || !(q.mid > 0)) continue;

      const analysis = analyses[asset.pair];
      const okxMeta = asset.okxId ? cryptoByOkxId.get(asset.okxId) : undefined;
      if (asset.okxId) {
        seenOkxIds.add(asset.okxId);
      }

      const rawHigh = q.high24h && q.high24h > 0 ? q.high24h : okxMeta?.high24h || 0;
      const rawLow = q.low24h && q.low24h > 0 ? q.low24h : okxMeta?.low24h || 0;

      const high24h = rawHigh > 0 ? Math.max(rawHigh, q.mid) : 0;
      const low24h = rawLow > 0 ? Math.min(rawLow, q.mid) : 0;

      let volatility24hPct = 0;
      let isAtrEstimated = false;
      if (high24h > low24h && low24h > 0) {
        volatility24hPct = ((high24h - low24h) / low24h) * 100;
      } else if (analysis && !analysis.warmingUp && analysis.atrPct > 0) {
        volatility24hPct = analysis.atrPct * 6;
        isAtrEstimated = true;
      }

      if (!(volatility24hPct > 0)) continue;

      const openRef =
        q.open24h && q.open24h > 0 ? q.open24h : okxMeta?.open24h || 0;
      const change24hPct =
        openRef > 0 ? ((q.mid - openRef) / openRef) * 100 : null;

      const rangePosPct =
        high24h > low24h
          ? Math.max(0, Math.min(100, ((q.mid - low24h) / (high24h - low24h)) * 100))
          : 50;

      const direction: "L" | "S" =
        analysis && !analysis.warmingUp
          ? analysis.direction
          : (change24hPct ?? 0) >= 0
          ? "L"
          : "S";

      const isMemecoin = okxMeta?.sector === "memecoin";
      const assetClassLabel =
        asset.group === "c"
          ? isMemecoin
            ? "Memecoin"
            : "Crypto Watchlist"
          : getTradfiGroupLabel(asset.group);

      rows.push({
        key: `m-${asset.pair}`,
        name: asset.name,
        symbolLabel: asset.okxId || asset.yahooSymbol || asset.pair,
        assetClassLabel,
        isCrypto: asset.group === "c",
        isMemecoin,
        isMonitored: true,
        isSelected: selectedPair === asset.pair,
        price: q.mid,
        high24h: high24h > 0 ? high24h : q.mid,
        low24h: low24h > 0 ? low24h : q.mid,
        volatility24hPct,
        isAtrEstimated,
        change24hPct,
        rangePosPct,
        atrPct: analysis && !analysis.warmingUp ? analysis.atrPct : null,
        direction,
        marketAsset: asset,
        quote: q,
        analysis,
        cryptoRow: okxMeta,
      });
    }

    // 2. Remaining Live OKX Crypto & Memecoin Universe (deduplicated)
    for (const row of cryptoOpportunities) {
      if (seenOkxIds.has(row.instId)) continue;
      if (!(row.last > 0) || !(row.range24hPct > 0)) continue;

      const high24h = Math.max(row.high24h, row.last);
      const low24h = row.low24h > 0 ? Math.min(row.low24h, row.last) : row.last;
      const volatility24hPct =
        low24h > 0 && high24h > low24h
          ? ((high24h - low24h) / low24h) * 100
          : row.range24hPct;

      rows.push({
        key: `c-${row.instId}`,
        name: row.name,
        symbolLabel: row.instId,
        assetClassLabel:
          row.sector === "memecoin"
            ? "Memecoin"
            : row.sector === "major"
            ? "Major Crypto"
            : "Altcoin OKX",
        isCrypto: true,
        isMemecoin: row.sector === "memecoin",
        isMonitored: false,
        isSelected: selectedOkxId === row.instId,
        price: row.last,
        high24h,
        low24h,
        volatility24hPct,
        isAtrEstimated: false,
        change24hPct: row.changePct24h,
        rangePosPct: Math.max(0, Math.min(100, row.rangePos * 100)),
        atrPct: null,
        direction: row.direction,
        cryptoRow: row,
      });
    }

    rows.sort((a, b) => {
      if (b.volatility24hPct !== a.volatility24hPct) {
        return b.volatility24hPct - a.volatility24hPct;
      }
      return Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0);
    });

    return rows;
  }, [markets, quotes, analyses, cryptoOpportunities, cryptoByOkxId, selectedPair, selectedOkxId, tickNow]);

  const counts = useMemo(() => {
    const crypto = unifiedRows.filter((r) => r.isCrypto).length;
    const tradfi = unifiedRows.filter((r) => !r.isCrypto).length;
    const highVol5 = unifiedRows.filter((r) => r.volatility24hPct >= 5).length;
    const avgVol =
      unifiedRows.length > 0
        ? unifiedRows.reduce((acc, r) => acc + r.volatility24hPct, 0) /
          unifiedRows.length
        : 0;
    return {
      all: unifiedRows.length,
      crypto,
      tradfi,
      highVol5,
      avgVol,
      topMover: unifiedRows[0] || null,
    };
  }, [unifiedRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minPct = minThreshold === "6" ? 6 : minThreshold === "3" ? 3 : 0;

    return unifiedRows.filter((row) => {
      if (categoryTab === "crypto" && !row.isCrypto) return false;
      if (categoryTab === "tradfi" && row.isCrypto) return false;
      if (minPct > 0 && row.volatility24hPct < minPct) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.symbolLabel.toLowerCase().includes(q) ||
        row.assetClassLabel.toLowerCase().includes(q)
      );
    });
  }, [unifiedRows, categoryTab, minThreshold, search]);

  const visibleRows = expanded ? filteredRows : filteredRows.slice(0, 8);
  const maxVolPct = Math.max(12, filteredRows[0]?.volatility24hPct || 12);

  const handleOpenRow = (row: ScreenerRow) => {
    if (row.marketAsset) {
      onSelectMarketAsset(row.marketAsset.pair);
    } else if (row.cryptoRow) {
      onSelectCryptoOpportunity(row.cryptoRow);
    }
  };

  return (
    <section
      className={
        embedded
          ? "overflow-hidden"
          : "rounded-2xl border border-slate-200/75 dark:border-white/[0.08] liquid-surface overflow-hidden"
      }
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200/60 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Screener Volatilità Live (Classifica Range 24h %)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Classifica in tempo reale per ampiezza escursione 24h (High–Low) su Crypto, Memecoin, Azioni USA, Indici e Materie Prime
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-amber-600 dark:text-amber-400">
            <Zap className="w-3.5 h-3.5" />
            High-Momentum
          </span>
          <span aria-hidden="true">·</span>
          <span>{unifiedRows.length} asset monitorati</span>
          <span aria-hidden="true">·</span>
          <span>Aggiornato {new Date(tickNow).toLocaleTimeString("it-IT")}</span>
        </div>
      </div>

      {/* Real-Time Volatility Telemetry Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#0B0F17]/40">
        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Top Volatilità 24h
          </div>
          {counts.topMover ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {counts.topMover.volatility24hPct.toFixed(2)}%
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                {counts.topMover.name}
              </span>
            </div>
          ) : (
            <div className="mt-1 font-mono text-lg font-bold text-slate-400">–</div>
          )}
        </div>

        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Media Volatilità Mercato
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {counts.avgVol > 0 ? `${counts.avgVol.toFixed(2)}%` : "–"}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Escursione media 24h
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Asset Alta Volatilità (≥ 5%)
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {counts.highVol5}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Setup ad alta velocità
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Copertura Feed Live
          </div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {counts.crypto} Crypto · {counts.tradfi} TradFi
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            OKX WS/REST + Yahoo Finance
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-0.5">
            <button
              type="button"
              onClick={() => setCategoryTab("all")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                categoryTab === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Tutti ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setCategoryTab("crypto")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                categoryTab === "crypto"
                  ? "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Crypto &amp; Meme ({counts.crypto})
            </button>
            <button
              type="button"
              onClick={() => setCategoryTab("tradfi")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                categoryTab === "tradfi"
                  ? "bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Azioni &amp; Indici ({counts.tradfi})
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-0.5">
            <button
              type="button"
              onClick={() => setMinThreshold("all")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                minThreshold === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Qualsiasi %
            </button>
            <button
              type="button"
              onClick={() => setMinThreshold("3")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                minThreshold === "3"
                  ? "bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              ≥ 3%
            </button>
            <button
              type="button"
              onClick={() => setMinThreshold("6")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                minThreshold === "6"
                  ? "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              ≥ 6%
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[175px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtra asset o ticker…"
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          {filteredRows.length > 8 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:border-amber-500 transition-colors whitespace-nowrap cursor-pointer"
            >
              {expanded ? (
                <>
                  Top 8 <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Tutti ({filteredRows.length}) <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Desktop Column Headers */}
      {visibleRows.length > 0 && (
        <div className="hidden md:grid md:grid-cols-[48px_minmax(200px,1.35fr)_155px_minmax(175px,1.1fr)_135px_125px_150px] items-center gap-3 px-5 py-2 bg-slate-50/70 dark:bg-[#0B0F17]/60 border-b border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <div>Pos.</div>
          <div>Asset</div>
          <div>Volatilità 24h %</div>
          <div>Posizione nel Range 24h</div>
          <div>Momentum</div>
          <div>Prezzo &amp; 24h</div>
          <div className="text-right">Azione</div>
        </div>
      )}

      {/* Body */}
      {visibleRows.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          {unifiedRows.length === 0
            ? "Sincronizzazione prezzi live e range 24h in corso…"
            : "Nessun asset soddisfa i filtri di volatilità selezionati."}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {visibleRows.map((row, idx) => {
            const rank = idx + 1;
            const tier = getVolatilityTier(row.volatility24hPct);
            const barWidth = Math.max(
              8,
              Math.min(100, (row.volatility24hPct / maxVolPct) * 100)
            );
            const badge = getAssetBadgeMeta(
              row.marketAsset || {
                pair: row.symbolLabel,
                name: row.name,
                group: "c",
                okxId: row.symbolLabel,
              }
            );
            const canQuickTrade = Boolean(
              row.marketAsset &&
                row.quote &&
                row.analysis &&
                !row.analysis.warmingUp
            );
            const isBusy =
              row.marketAsset && aiBusyPair === row.marketAsset.pair;

            return (
              <div
                key={row.key}
                onClick={() => handleOpenRow(row)}
                className={`px-4 sm:px-5 py-3 grid grid-cols-1 md:grid-cols-[48px_minmax(200px,1.35fr)_155px_minmax(175px,1.1fr)_135px_125px_150px] items-center gap-3 transition-colors cursor-pointer ${
                  row.isSelected
                    ? "bg-amber-50/70 dark:bg-amber-950/20"
                    : "hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                }`}
              >
                {/* Rank + Asset Identity */}
                <div className="flex items-center justify-between gap-3 md:contents">
                  <div className="flex items-center gap-3 min-w-0 md:contents">
                    <div
                      className={`w-8 h-8 rounded-lg border font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                        rank <= 3
                          ? "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      #{rank}
                    </div>

                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold shrink-0 ${
                          row.isMemecoin
                            ? "bg-amber-500 text-slate-950"
                            : badge.bgClass
                        }`}
                      >
                        {badge.code}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 dark:text-white leading-snug truncate">
                          {row.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>{row.symbolLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              row.isMemecoin
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : ""
                            }
                          >
                            {row.assetClassLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Volatility % */}
                  <div className="md:hidden text-right shrink-0">
                    <div className={`font-mono font-bold text-base tabular-nums ${tier.textClass}`}>
                      {row.volatility24hPct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Volatilità 24h
                    </div>
                  </div>
                </div>

                {/* Volatility 24h % Bar (Desktop) */}
                <div className="hidden md:block">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {row.isAtrEstimated ? "ATR 1m est." : "Range 24h"}
                    </span>
                    <span className={`font-mono font-bold text-sm tabular-nums ${tier.textClass}`}>
                      {row.volatility24hPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${tier.barClass}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>

                {/* 24h Range Position Gauge (Low -> High) */}
                <div className="min-w-0 font-mono tabular-nums">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>L {formatPrice(row.low24h)}</span>
                    <span>H {formatPrice(row.high24h)}</span>
                  </div>
                  <div className="relative mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-slate-400/50 dark:bg-slate-500/50"
                      style={{ width: `${row.rangePosPct}%` }}
                    />
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-white dark:border-[#111824] ${
                        row.rangePosPct >= 70
                          ? "bg-emerald-500"
                          : row.rangePosPct <= 30
                          ? "bg-red-500"
                          : "bg-amber-500"
                      }`}
                      style={{ left: `${row.rangePosPct}%` }}
                    />
                  </div>
                </div>

                {/* Momentum Regime & Bias */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {row.direction === "L" ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <span className={`text-xs font-bold ${tier.textClass}`}>
                      {tier.label}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {row.atrPct !== null
                      ? `ATR 1m ${row.atrPct.toFixed(2)}%`
                      : row.direction === "L"
                      ? "Spinta Rialzista"
                      : "Pressione Ribassista"}
                  </div>
                </div>

                {/* Live Price + 24h % */}
                <div className="flex items-center justify-between md:block font-mono tabular-nums">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {row.isCrypto ? `$${formatPrice(row.price)}` : formatPrice(row.price)}
                  </div>
                  <div className="text-[11px]">
                    {row.change24hPct !== null ? (
                      <span
                        className={`inline-flex items-center font-semibold ${
                          row.change24hPct >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {row.change24hPct >= 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {row.change24hPct >= 0 ? "+" : ""}
                        {row.change24hPct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div
                  className="flex items-center justify-end gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canQuickTrade && row.marketAsset && row.quote && row.analysis ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenRow(row)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200 hover:border-amber-500 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Grafico
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(isBusy)}
                        onClick={() =>
                          onQuickOpen(
                            row.marketAsset!,
                            row.quote!,
                            row.analysis!,
                            row.direction
                          )
                        }
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                          row.direction === "L"
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                      >
                        {isBusy
                          ? "IA…"
                          : requireAiApproval
                          ? `IA ${row.direction === "L" ? "LONG" : "SHORT"}`
                          : row.direction === "L"
                          ? "LONG"
                          : "SHORT"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenRow(row)}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg text-white transition-colors whitespace-nowrap cursor-pointer ${
                        row.direction === "L"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      Apri &amp; Analizza
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
