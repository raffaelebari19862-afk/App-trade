import React, { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Trophy,
} from "lucide-react";
import {
  formatPrice,
  formatSignedEur,
  getAssetBadgeMeta,
  getAssetCategoryLabel,
} from "../data/markets";
import type {
  AiValidationResult,
  LiveQuote,
  MarketAsset,
  OpenPosition,
  TechnicalAnalysis,
} from "../types/trading";

interface LeaderboardPanelProps {
  markets: MarketAsset[];
  quotes: Record<string, LiveQuote>;
  analyses: Record<string, TechnicalAnalysis>;
  positions: Record<string, OpenPosition>;
  aiSnapshots: Record<string, AiValidationResult>;
  selectedPair: string;
  tickNow: number;
  requireAiApproval: boolean;
  aiBusyPair: string | null;
  onSelectPair: (pair: string) => void;
  onQuickOpen: (
    asset: MarketAsset,
    quote: LiveQuote,
    analysis: TechnicalAnalysis,
    side: "L" | "S"
  ) => void;
  onQuickClose: (asset: MarketAsset, quote: LiveQuote) => void;
  embedded?: boolean;
}

type LeaderboardFilter = "all" | "crypto" | "tradfi" | "open";

interface RankedEntry {
  asset: MarketAsset;
  categoryLabel: string;
  tickerLabel: string;
  quote?: LiveQuote;
  analysis?: TechnicalAnalysis;
  position?: OpenPosition;
  ai?: AiValidationResult;
  direction: "L" | "S";
  probabilityPct: number;
  hasLiveQuote: boolean;
  hasAiBlend: boolean;
  gatesPassed: number;
  targetRoiPct: number;
  unrealizedEur: number | null;
  isClosedMarket: boolean;
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  markets,
  quotes,
  analyses,
  positions,
  aiSnapshots,
  selectedPair,
  tickNow,
  requireAiApproval,
  aiBusyPair,
  onSelectPair,
  onQuickOpen,
  onQuickClose,
  embedded = false,
}) => {
  const [filter, setFilter] = useState<LeaderboardFilter>("all");
  const [expanded, setExpanded] = useState<boolean>(false);

  const rankedEntries = useMemo(() => {
    const items: RankedEntry[] = [];

    for (const asset of markets) {
      const quote = quotes[asset.pair];
      const analysis = analyses[asset.pair];
      const position = positions[asset.pair];
      const ai = aiSnapshots[asset.pair];

      const hasLiveQuote = Boolean(
        quote && (tickNow - quote.ts <= 180000 || Boolean(position))
      );

      const isClosedMarket = Boolean(
        asset.group !== "c" &&
          quote &&
          quote.marketState !== "REGULAR" &&
          quote.marketState !== "OPEN"
      );

      const direction: "L" | "S" = position
        ? position.side
        : analysis?.direction || "L";

      const baseTechProb =
        analysis?.winProbabilityPct ??
        (position ? 72 : hasLiveQuote ? 22 : 10);
      const aiConfidence = position?.aiConfidence ?? ai?.confidence;
      const aiApproved = position ? true : ai?.approved;

      let probabilityPct = baseTechProb;
      let hasAiBlend = false;

      if (typeof aiConfidence === "number" && aiConfidence > 0) {
        hasAiBlend = true;
        if (aiApproved) {
          probabilityPct = Math.round(baseTechProb * 0.52 + aiConfidence * 0.48);
        } else {
          probabilityPct = Math.min(
            baseTechProb,
            Math.round(baseTechProb * 0.45 + aiConfidence * 0.3)
          );
        }
      }

      if (isClosedMarket && !position) {
        probabilityPct = Math.min(probabilityPct, 15);
      }

      probabilityPct = Math.max(5, Math.min(98, probabilityPct));

      const gatesPassed = position
        ? Math.max(
            position.gatesPassed,
            analysis ? analysis.gates.filter((g) => g.passed).length : 3
          )
        : analysis
        ? analysis.gates.filter((g) => g.passed).length
        : 0;

      const targetRoiPct = position
        ? Math.max(10, (position.tpPct - position.costPct) * position.leverage)
        : analysis?.tpRoiPct ?? 10;

      let unrealizedEur: number | null = null;
      if (position && quote) {
        const exitPx = position.side === "L" ? quote.bid : quote.ask;
        const gainPct =
          position.side === "L"
            ? ((exitPx - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - exitPx) / position.entryPrice) * 100;
        unrealizedEur = (position.notionalEur * gainPct) / 100 - 2 * position.feePerSide;
      }

      items.push({
        asset,
        categoryLabel: getAssetCategoryLabel(asset),
        tickerLabel: asset.okxId || asset.yahooSymbol || asset.pair,
        quote,
        analysis,
        position,
        ai,
        direction,
        probabilityPct,
        hasLiveQuote,
        hasAiBlend,
        gatesPassed,
        targetRoiPct,
        unrealizedEur,
        isClosedMarket,
      });
    }

    // Strict descending sort: highest probability % first
    items.sort((a, b) => {
      if (b.probabilityPct !== a.probabilityPct) {
        return b.probabilityPct - a.probabilityPct;
      }
      if (Boolean(b.position) !== Boolean(a.position)) {
        return b.position ? 1 : -1;
      }
      if (b.hasLiveQuote !== a.hasLiveQuote) {
        return b.hasLiveQuote ? 1 : -1;
      }
      if (b.gatesPassed !== a.gatesPassed) {
        return b.gatesPassed - a.gatesPassed;
      }
      return (b.analysis?.score || 0) - (a.analysis?.score || 0);
    });

    return items;
  }, [markets, quotes, analyses, positions, aiSnapshots, tickNow]);

  const openCount = useMemo(
    () => rankedEntries.filter((e) => Boolean(e.position)).length,
    [rankedEntries]
  );

  const filteredEntries = useMemo(() => {
    if (filter === "open") return rankedEntries.filter((e) => Boolean(e.position));
    if (filter === "crypto") return rankedEntries.filter((e) => e.asset.group === "c");
    if (filter === "tradfi") return rankedEntries.filter((e) => e.asset.group !== "c");
    return rankedEntries;
  }, [rankedEntries, filter]);

  const visibleEntries = expanded ? filteredEntries : filteredEntries.slice(0, 6);

  const getRankBadgeStyle = (rank: number) => {
    if (rank === 1) {
      return "border-amber-400/70 bg-amber-500/15 text-amber-600 dark:text-amber-300";
    }
    if (rank === 2) {
      return "border-slate-300 dark:border-slate-600 bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200";
    }
    if (rank === 3) {
      return "border-orange-400/60 bg-orange-500/10 text-orange-600 dark:text-orange-300";
    }
    return "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-500 dark:text-slate-400";
  };

  const getProbTone = (prob: number) => {
    if (prob >= 75) {
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        bar: "bg-emerald-500",
      };
    }
    if (prob >= 58) {
      return {
        text: "text-blue-600 dark:text-blue-400",
        bar: "bg-blue-500",
      };
    }
    if (prob >= 42) {
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
          <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-tight">
              Classifica Migliori Posizioni (Crypto & Azioni/Indici)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Ordinate dalla probabilità di successo più alta alla più bassa
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filter === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Tutte ({rankedEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("crypto")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filter === "crypto"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Crypto
            </button>
            <button
              type="button"
              onClick={() => setFilter("tradfi")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filter === "tradfi"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Azioni & Indici
            </button>
            <button
              type="button"
              onClick={() => setFilter("open")}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filter === "open"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Aperte ({openCount})
            </button>
          </div>

          {filteredEntries.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:border-blue-500 transition-colors whitespace-nowrap cursor-pointer"
            >
              {expanded ? (
                <>
                  Top 6 <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Mostra tutte ({filteredEntries.length}) <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Desktop Column Headers */}
      {visibleEntries.length > 0 && (
        <div className="hidden md:grid md:grid-cols-[52px_minmax(220px,1.5fr)_175px_150px_140px_110px] items-center gap-3 px-5 py-2 bg-slate-50/70 dark:bg-[#0B0F17]/60 border-b border-slate-100 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <div>Pos.</div>
          <div>Crypto / Azione</div>
          <div>Probabilità</div>
          <div>Direzione & Stato</div>
          <div>Prezzo & Target</div>
          <div className="text-right">Azione</div>
        </div>
      )}

      {visibleEntries.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {filter === "open"
            ? "Nessuna posizione aperta da classificare al momento. Seleziona Tutte per vedere la classifica completa."
            : "Nessun mercato disponibile per questo filtro."}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {visibleEntries.map((item, idx) => {
            const rank = idx + 1;
            const tone = getProbTone(item.probabilityPct);
            const isSelected = item.asset.pair === selectedPair;
            const isBusy = aiBusyPair === item.asset.pair;

            return (
              <div
                key={item.asset.pair}
                onClick={() => onSelectPair(item.asset.pair)}
                className={`px-4 sm:px-5 py-3 grid grid-cols-1 md:grid-cols-[52px_minmax(220px,1.5fr)_175px_150px_140px_110px] items-center gap-3 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/70 dark:bg-blue-950/25"
                    : "hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                }`}
              >
                {/* Mobile Top Row: Rank + Full Clear Name & Ticker + Probability % */}
                <div className="flex items-center justify-between gap-3 md:contents">
                  {/* Rank + eToro-style Asset Avatar + Full Clear Name & Ticker */}
                  <div className="flex items-center gap-3 min-w-0 md:contents">
                    <div
                      className={`w-8 h-8 rounded-lg border font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${getRankBadgeStyle(
                        rank
                      )}`}
                    >
                      #{rank}
                    </div>

                    {/* Asset Avatar + Name + Ticker + Category */}
                    {(() => {
                      const badge = getAssetBadgeMeta(item.asset);
                      return (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold shrink-0 tracking-tight ${badge.bgClass}`}
                          >
                            {badge.code}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                              {item.asset.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {item.tickerLabel}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{item.categoryLabel}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Mobile-only Probability display next to name */}
                  <div className="md:hidden text-right shrink-0">
                    <div className={`font-mono font-bold text-base tabular-nums ${tone.text}`}>
                      {item.probabilityPct}%
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {item.hasAiBlend ? "Prob. IA" : "Probabilità"}
                    </div>
                  </div>
                </div>

                {/* Desktop Probability Column */}
                <div className="hidden md:block">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 text-[11px]">
                      {item.hasAiBlend ? (
                        <>
                          <Bot className="w-3 h-3 text-blue-500" />
                          IA + Tec
                        </>
                      ) : (
                        "Tecnica"
                      )}
                    </span>
                    <span className={`font-mono font-bold text-sm tabular-nums ${tone.text}`}>
                      {item.probabilityPct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
                      style={{ width: `${item.probabilityPct}%` }}
                    />
                  </div>
                </div>

                {/* Direction & Status + Mobile Secondary Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 md:block">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold ${
                        item.direction === "L"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {item.direction === "L" ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {item.direction === "L" ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">·</span>
                    {item.position ? (
                      <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                        APERTA{" "}
                        {item.unrealizedEur !== null
                          ? formatSignedEur(item.unrealizedEur)
                          : ""}
                      </span>
                    ) : !item.hasLiveQuote ? (
                      <span className="text-[11px] font-mono text-slate-400">
                        Attesa feed
                      </span>
                    ) : item.isClosedMarket ? (
                      <span className="text-[11px] font-mono text-slate-400">
                        Mercato chiuso
                      </span>
                    ) : item.analysis?.warmingUp ? (
                      <span className="text-[11px] font-mono text-slate-400">
                        Analisi dati
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          item.gatesPassed === 3
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {item.gatesPassed}/3 controlli
                      </span>
                    )}
                  </div>
                  {item.analysis && !item.analysis.warmingUp && item.analysis.confirmations.length > 0 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {item.analysis.confirmations.slice(0, 3).join(", ")}
                    </div>
                  )}
                </div>

                {/* Live Price & Target ROI */}
                <div className="flex items-center justify-between md:block font-mono tabular-nums">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {item.quote ? formatPrice(item.quote.mid) : "–"}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Target +{item.targetRoiPct.toFixed(1)}% ROI
                  </div>
                </div>

                {/* Action Button */}
                <div
                  className="flex justify-end shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.position ? (
                    <button
                      type="button"
                      disabled={!item.quote}
                      onClick={() => {
                        if (item.quote) onQuickClose(item.asset, item.quote);
                      }}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Chiudi
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        !item.quote ||
                        !item.analysis ||
                        item.isClosedMarket ||
                        isBusy
                      }
                      onClick={() => {
                        if (item.quote && item.analysis) {
                          onSelectPair(item.asset.pair);
                          onQuickOpen(
                            item.asset,
                            item.quote,
                            item.analysis,
                            item.direction
                          );
                        }
                      }}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer ${
                        item.direction === "L"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      {isBusy
                        ? "IA…"
                        : requireAiApproval
                        ? `IA & ${item.direction === "L" ? "LONG" : "SHORT"}`
                        : item.direction === "L"
                        ? "Apri LONG"
                        : "Apri SHORT"}
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
