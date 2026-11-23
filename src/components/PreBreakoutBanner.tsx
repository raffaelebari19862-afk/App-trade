import React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  Mail,
  RefreshCw,
} from "lucide-react";
import type { GlobalCryptoSentiment, PreBreakoutSignal } from "../types/trading";
import { formatPrice } from "../data/markets";
import { SectionInfoBar } from "./SectionInfoBar";

interface PreBreakoutBannerProps {
  signals: PreBreakoutSignal[];
  globalContext: GlobalCryptoSentiment | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectSignal: (signal: PreBreakoutSignal) => void;
  onOpenEmailModal: () => void;
}

export const PreBreakoutBanner: React.FC<PreBreakoutBannerProps> = ({
  signals,
  globalContext,
  loading,
  onRefresh,
  onSelectSignal,
  onOpenEmailModal,
}) => {
  const topSignals = signals.slice(0, 3);

  return (
    <section className="rounded-2xl border border-amber-500/40 dark:border-amber-400/25 liquid-surface overflow-hidden">
      <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-amber-500/[0.12] via-emerald-500/[0.06] to-transparent border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                Radar Pre-Esplosione Memecoin &amp; Crypto
              </h2>
              {globalContext && (
                <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Sentore: {globalContext.globalRegime}
                  {globalContext.fearGreedValue !== null
                    ? ` · F&G ${globalContext.fearGreedValue}/100`
                    : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
              Asset in compressione o rotazione imminente prima del breakout, pronti per l&apos;invio banner su Gmail.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Aggiorna segnali pre-breakout"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200/80 dark:border-white/[0.1] bg-white/70 dark:bg-white/[0.05] text-slate-700 dark:text-slate-200 hover:border-amber-500/50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </button>

          <button
            type="button"
            onClick={onOpenEmailModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap shadow-sm shadow-amber-500/20 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            Invia Banner Gmail
          </button>
        </div>
      </div>

      {topSignals.length === 0 ? (
        <div className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
          {loading
            ? "Scansione candele 1m, Bollinger Squeeze e sentiment OKX in corso…"
            : "Nessuna compressione pre-breakout rilevata in questo istante. Premi Aggiorna per rieseguire."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/60 dark:divide-white/[0.06]">
          {topSignals.map((sig) => {
            const isLong = sig.direction === "L";
            return (
              <button
                key={sig.instId}
                type="button"
                onClick={() => onSelectSignal(sig)}
                className="p-3.5 sm:px-5 text-left hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04] transition-colors flex flex-col justify-between gap-2 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {sig.sector === "memecoin" && (
                        <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                        {sig.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {sig.baseSymbol}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 truncate">
                      {sig.technique}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                        isLong
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-red-500/15 text-red-700 dark:text-red-300"
                      }`}
                    >
                      {isLong ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {isLong ? "LONG" : "SHORT"} {sig.probabilityPct}%
                    </span>
                    <div className="mt-0.5 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                      {sig.urgency} · +{sig.potentialMovePct}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="truncate">{sig.triggerNote}</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                    {formatPrice(sig.lastPrice)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SectionInfoBar
        compact
        title="Radar Pre-Esplosione"
        summary="Individua in anticipo cripto e memecoin in compressione di volatilità prima del breakout direzionale, con invio rapido su Gmail."
        details={[
          {
            heading: "Rilevazione segnali",
            body: "Analizza in tempo reale i ticker OKX SWAP insieme alle candele 1m per riconoscere Bollinger Squeeze, incroci EMA9/21 con volumi in aumento e rimbalzi su zona Fibonacci.",
          },
          {
            heading: "Urgenza e Probabilità",
            body: "Ogni card riporta direzione stimata (LONG/SHORT), probabilità di continuazione, spazio potenziale residuo (%) e urgenza operativa (Imminente, Alta o Radar).",
          },
          {
            heading: "Azione rapida",
            body: "Cliccando su un segnale si apre subito il grafico completo nel Terminale; con 'Invia Banner Gmail' puoi spedire il riepilogo operativo alla tua email collegata.",
          },
        ]}
      />
    </section>
  );
};
