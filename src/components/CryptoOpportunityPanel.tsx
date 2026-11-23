import React, { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Flame,
  Globe,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatPrice, getAssetBadgeMeta } from "../data/markets";
import type {
  CryptoAiBrief,
  CryptoOpportunityRow,
  CryptoSector,
  GlobalCryptoSentiment,
} from "../types/trading";

interface CryptoOpportunityPanelProps {
  globalContext: GlobalCryptoSentiment | null;
  opportunities: CryptoOpportunityRow[];
  loading: boolean;
  error: string | null;
  cryptoLeverage: number;
  selectedOkxId?: string;
  onRefresh: () => void;
  onSelectCrypto: (row: CryptoOpportunityRow) => void;
  embedded?: boolean;
}

type CryptoFilterTab = "all" | "memecoin" | "bullish" | "bearish";
type CryptoSortKey = "probability" | "potential" | "change24h";

function formatCompactUsd(val: number): string {
  if (!(val > 0)) return "–";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function getSectorLabel(sector: CryptoSector): string {
  if (sector === "memecoin") return "Memecoin";
  if (sector === "major") return "Major / Layer 1";
  return "Altcoin / DeFi";
}

export const CryptoOpportunityPanel: React.FC<CryptoOpportunityPanelProps> = ({
  globalContext,
  opportunities,
  loading,
  error,
  cryptoLeverage,
  selectedOkxId,
  onRefresh,
  onSelectCrypto,
  embedded = false,
}) => {
  const [filterTab, setFilterTab] = useState<CryptoFilterTab>("all");
  const [sortKey, setSortKey] = useState<CryptoSortKey>("probability");
  const [search, setSearch] = useState<string>("");
  const [expanded, setExpanded] = useState<boolean>(false);

  const [aiBrief, setAiBrief] = useState<CryptoAiBrief | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const memecoin = opportunities.filter((o) => o.sector === "memecoin").length;
    const bullish = opportunities.filter(
      (o) =>
        o.trendLabel === "ALTAMENTE RIALZISTA" ||
        o.trendLabel === "RIALZISTA" ||
        o.trendLabel === "RIMBALZO ATTESO"
    ).length;
    const bearish = opportunities.filter(
      (o) =>
        o.trendLabel === "ALTAMENTE RIBASSISTA" || o.trendLabel === "RIBASSISTA"
    ).length;
    return {
      all: opportunities.length,
      memecoin,
      bullish,
      bearish,
    };
  }, [opportunities]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = opportunities.filter((o) => {
      if (filterTab === "memecoin" && o.sector !== "memecoin") return false;
      if (
        filterTab === "bullish" &&
        o.trendLabel !== "ALTAMENTE RIALZISTA" &&
        o.trendLabel !== "RIALZISTA" &&
        o.trendLabel !== "RIMBALZO ATTESO"
      ) {
        return false;
      }
      if (
        filterTab === "bearish" &&
        o.trendLabel !== "ALTAMENTE RIBASSISTA" &&
        o.trendLabel !== "RIBASSISTA"
      ) {
        return false;
      }
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.baseSymbol.toLowerCase().includes(q) ||
        o.instId.toLowerCase().includes(q)
      );
    });

    const sorted = [...list].sort((a, b) => {
      if (sortKey === "potential") {
        if (b.potentialMovePct !== a.potentialMovePct) {
          return b.potentialMovePct - a.potentialMovePct;
        }
        return b.probabilityPct - a.probabilityPct;
      }
      if (sortKey === "change24h") {
        return Math.abs(b.changePct24h) - Math.abs(a.changePct24h);
      }
      if (b.probabilityPct !== a.probabilityPct) {
        return b.probabilityPct - a.probabilityPct;
      }
      return b.potentialMovePct - a.potentialMovePct;
    });

    return sorted;
  }, [opportunities, filterTab, sortKey, search]);

  const visibleRows = expanded
    ? filteredAndSorted
    : filteredAndSorted.slice(0, 8);

  const handleGenerateAiBrief = async () => {
    if (!globalContext || opportunities.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const topBullish = opportunities
        .filter((o) => o.direction === "L")
        .slice(0, 6)
        .map((o) => ({
          symbol: o.baseSymbol,
          sector: o.sector,
          prob: o.probabilityPct,
          potentialPct: o.potentialMovePct,
          change24h: Number(o.changePct24h.toFixed(2)),
          trend: o.trendLabel,
        }));
      const topBearish = opportunities
        .filter((o) => o.direction === "S")
        .slice(0, 6)
        .map((o) => ({
          symbol: o.baseSymbol,
          sector: o.sector,
          prob: o.probabilityPct,
          potentialPct: o.potentialMovePct,
          change24h: Number(o.changePct24h.toFixed(2)),
          trend: o.trendLabel,
        }));
      const topMemecoins = opportunities
        .filter((o) => o.sector === "memecoin")
        .slice(0, 6)
        .map((o) => ({
          symbol: o.baseSymbol,
          prob: o.probabilityPct,
          potentialPct: o.potentialMovePct,
          change24h: Number(o.changePct24h.toFixed(2)),
          trend: o.trendLabel,
        }));

      const res = await fetch("/api/ai/crypto-macro-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalContext,
          topBullish,
          topBearish,
          topMemecoins,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setAiBrief(json as CryptoAiBrief);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Errore analisi macro IA"
      );
    } finally {
      setAiLoading(false);
    }
  };

  const getProbTone = (prob: number) => {
    if (prob >= 76) {
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        bar: "bg-emerald-500",
      };
    }
    if (prob >= 62) {
      return {
        text: "text-blue-600 dark:text-blue-400",
        bar: "bg-blue-500",
      };
    }
    if (prob >= 48) {
      return {
        text: "text-amber-600 dark:text-amber-400",
        bar: "bg-amber-500",
      };
    }
    return {
      text: "text-slate-500 dark:text-slate-400",
      bar: "bg-slate-400 dark:bg-slate-600",
    };
  };

  const getTrendTextStyle = (label: CryptoOpportunityRow["trendLabel"]) => {
    if (label === "ALTAMENTE RIALZISTA") {
      return "text-emerald-600 dark:text-emerald-400";
    }
    if (label === "RIALZISTA" || label === "RIMBALZO ATTESO") {
      return "text-emerald-600/90 dark:text-emerald-300";
    }
    if (label === "ALTAMENTE RIBASSISTA") {
      return "text-red-600 dark:text-red-400";
    }
    return "text-red-600/90 dark:text-red-300";
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
      <div className="px-5 py-3.5 border-b border-slate-200/60 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-tight">
              Classifica Opportunità Crypto & Memecoin (Sentore Globale)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Probabilità e potenziale rialzista/ribassista calcolati su sentore globale, ampiezza OKX e forza relativa live
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={aiLoading || !globalContext}
            onClick={handleGenerateAiBrief}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5" />
            {aiLoading ? "Analisi Macro…" : "Sintesi Macro IA"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </button>
        </div>
      </div>

      {/* Global Crypto & Macro Sentiment Telemetry Strip */}
      {globalContext && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#0B0F17]/60">
          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Sentore Globale Crypto
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 font-mono tabular-nums">
              <span
                className={`text-sm font-bold ${
                  globalContext.globalRegime.includes("RIALZISTA")
                    ? "text-emerald-600 dark:text-emerald-400"
                    : globalContext.globalRegime.includes("RIBASSISTA")
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {globalContext.globalRegime}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              Fear &amp; Greed:{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {globalContext.fearGreedValue !== null
                  ? `${globalContext.fearGreedValue}/100`
                  : "–"}
              </strong>{" "}
              ({globalContext.fearGreedLabel})
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Ampiezza Mercato OKX
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
              {globalContext.okxBullishBreadthPct}% in rialzo
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {globalContext.okxTotalPairs} SWAP · Media{" "}
              <span
                className={
                  globalContext.avg24hChangePct >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                {globalContext.avg24hChangePct >= 0 ? "+" : ""}
                {globalContext.avg24hChangePct.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Indice Memecoin 24h
            </div>
            <div
              className={`mt-0.5 font-mono text-sm font-bold tabular-nums inline-flex items-center gap-1 ${
                globalContext.memecoinAvg24hChangePct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              {globalContext.memecoinAvg24hChangePct >= 0 ? "+" : ""}
              {globalContext.memecoinAvg24hChangePct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {globalContext.btcChange24hPct !== null
                ? `BTC ${globalContext.btcChange24hPct >= 0 ? "+" : ""}${globalContext.btcChange24hPct.toFixed(1)}%`
                : "BTC –"}
              {globalContext.solChange24hPct !== null
                ? ` · SOL ${globalContext.solChange24hPct >= 0 ? "+" : ""}${globalContext.solChange24hPct.toFixed(1)}%`
                : ""}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Macro &amp; Dominance
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
              {globalContext.btcDominancePct !== null
                ? `BTC Dom ${globalContext.btcDominancePct.toFixed(1)}%`
                : globalContext.ethChange24hPct !== null
                ? `ETH ${globalContext.ethChange24hPct >= 0 ? "+" : ""}${globalContext.ethChange24hPct.toFixed(2)}%`
                : "Feed Live OKX"}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {globalContext.globalMarketCapChange24hPct !== null
                ? `Mcap 24h ${globalContext.globalMarketCapChange24hPct >= 0 ? "+" : ""}${globalContext.globalMarketCapChange24hPct.toFixed(2)}%`
                : `Aggiornato ${new Date(globalContext.updatedAt).toLocaleTimeString("it-IT")}`}
            </div>
          </div>
        </div>
      )}

      {/* Optional Gemini AI Macro Brief */}
      {aiError && (
        <div className="px-5 py-2.5 border-b border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {aiError}
        </div>
      )}

      {aiBrief && (
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Bot className="w-3.5 h-3.5 text-blue-500" />
              {aiBrief.headline}
            </div>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              IA Gemini · {new Date(aiBrief.generatedAt).toLocaleTimeString("it-IT")}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {aiBrief.globalSentimentSummary} {aiBrief.memecoinOutlook}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div className="text-emerald-700 dark:text-emerald-300">
              <strong>Top Rialzo:</strong> {aiBrief.topBullishPick}
            </div>
            <div className="text-red-700 dark:text-red-300">
              <strong>Top Ribasso / Short:</strong> {aiBrief.topBearishPick}
            </div>
            <div className="text-amber-700 dark:text-amber-300">
              <strong>Rischio:</strong> {aiBrief.riskNote}
            </div>
          </div>
        </div>
      )}

      {/* Filter & Sort Controls */}
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              filterTab === "all"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Tutte Crypto ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("memecoin")}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              filterTab === "memecoin"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Memecoin ({counts.memecoin})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("bullish")}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              filterTab === "bullish"
                ? "bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Rialziste ({counts.bullish})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("bearish")}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              filterTab === "bearish"
                ? "bg-white dark:bg-slate-800 text-red-700 dark:text-red-300 shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Ribassiste ({counts.bearish})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[165px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca crypto o meme…"
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as CryptoSortKey)}
            aria-label="Ordina classifica crypto"
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="probability">Ordina: Probabilità %</option>
            <option value="potential">Ordina: Potenziale %</option>
            <option value="change24h">Ordina: Forza 24h %</option>
          </select>

          {filteredAndSorted.length > 8 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
            >
              {expanded ? (
                <>
                  Top 8 <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Tutte ({filteredAndSorted.length}) <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Desktop Column Headers */}
      {visibleRows.length > 0 && (
        <div className="hidden md:grid md:grid-cols-[48px_minmax(200px,1.4fr)_145px_minmax(190px,1.2fr)_145px_130px_100px] items-center gap-3 px-5 py-2 bg-slate-50/70 dark:bg-[#0B0F17]/60 border-b border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <div>Pos.</div>
          <div>Crypto / Memecoin</div>
          <div>Probabilità</div>
          <div>Trend &amp; Sentori</div>
          <div>Aumento Possibile</div>
          <div>Prezzo &amp; 24h</div>
          <div className="text-right">Azione</div>
        </div>
      )}

      {/* States: Loading / Error / Empty / Rows */}
      {loading && opportunities.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Scansione live di tutte le crypto e memecoin su OKX + sentore globale in corso…
        </div>
      ) : error && opportunities.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Nessuna criptovaluta o memecoin trovata per questo filtro.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {visibleRows.map((row, idx) => {
            const rank = idx + 1;
            const tone = getProbTone(row.probabilityPct);
            const badge = getAssetBadgeMeta({
              pair: `${row.baseSymbol}/USD`,
              name: row.name,
              group: "c",
              okxId: row.instId,
            });
            const isSelected = selectedOkxId === row.instId;
            const estLevaRoi = row.potentialMovePct * cryptoLeverage;

            return (
              <div
                key={row.instId}
                onClick={() => onSelectCrypto(row)}
                className={`px-4 sm:px-5 py-3 grid grid-cols-1 md:grid-cols-[48px_minmax(200px,1.4fr)_145px_minmax(190px,1.2fr)_145px_130px_100px] items-center gap-3 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-emerald-50/70 dark:bg-emerald-950/25"
                    : "hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                }`}
              >
                {/* Mobile Top Row + Desktop Cells */}
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
                          row.sector === "memecoin"
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
                          <span>{row.instId}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              row.sector === "memecoin"
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : ""
                            }
                          >
                            {getSectorLabel(row.sector)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Probability */}
                  <div className="md:hidden text-right shrink-0">
                    <div className={`font-mono font-bold text-base tabular-nums ${tone.text}`}>
                      {row.probabilityPct}%
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Probabilità
                    </div>
                  </div>
                </div>

                {/* Probability Bar (Desktop) */}
                <div className="hidden md:block">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sentore + Tec
                    </span>
                    <span className={`font-mono font-bold text-sm tabular-nums ${tone.text}`}>
                      {row.probabilityPct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
                      style={{ width: `${row.probabilityPct}%` }}
                    />
                  </div>
                </div>

                {/* Trend Classification & Sentiment Reasons */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {row.direction === "L" ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <span
                      className={`text-xs font-mono font-bold ${getTrendTextStyle(
                        row.trendLabel
                      )}`}
                    >
                      {row.trendLabel}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {row.reasons.join(" · ")}
                  </div>
                </div>

                {/* Potential Upside / Downside Move % */}
                <div className="flex items-center justify-between md:block font-mono tabular-nums">
                  <div
                    className={`text-xs font-bold ${
                      row.direction === "L"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {row.direction === "L" ? "+" : "-"}
                    {row.potentialMovePct.toFixed(1)}%{" "}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      {row.direction === "L" ? "rialzo" : "ribasso"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    +{estLevaRoi.toFixed(0)}% ROI (×{cryptoLeverage})
                  </div>
                </div>

                {/* Live Price + 24h % + Volume */}
                <div className="flex items-center justify-between md:block font-mono tabular-nums">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    ${formatPrice(row.last)}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className={`inline-flex items-center font-semibold ${
                        row.changePct24h >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {row.changePct24h >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {row.changePct24h >= 0 ? "+" : ""}
                      {row.changePct24h.toFixed(2)}%
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatCompactUsd(row.volUsd24h)}
                    </span>
                  </div>
                </div>

                {/* Quick Open in Chart & Trade Engine */}
                <div
                  className="flex justify-end shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onSelectCrypto(row)}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-lg text-white transition-colors whitespace-nowrap cursor-pointer ${
                      row.direction === "L"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    Apri &amp; Analizza
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
