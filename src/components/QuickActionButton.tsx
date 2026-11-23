import React, { useEffect, useRef, useState } from "react";
import { Loader2, OctagonAlert, Scale, X, Zap } from "lucide-react";

interface QuickActionButtonProps {
  openTerminalCount: number;
  openBotCount: number;
  equityEur: number;
  busyAction: "sell_all" | "rebalance" | null;
  lastActionNote: string | null;
  onEmergencySellAll: () => Promise<void>;
  onRebalance: () => Promise<void>;
}

export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  openTerminalCount,
  openBotCount,
  equityEur,
  busyAction,
  lastActionNote,
  onEmergencySellAll,
  onRebalance,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalOpen = openTerminalCount + openBotCount;
  const targetSizeEur = Math.max(25, Math.min(500, Math.round((equityEur * 0.1) / 5) * 5));

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSellAllClick = async () => {
    await onEmergencySellAll();
    setOpen(false);
  };

  const handleRebalanceClick = async () => {
    await onRebalance();
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2.5"
    >
      {/* Floating Quick Action Menu */}
      {open && (
        <div
          role="dialog"
          aria-label="Azioni rapide terminale"
          className="w-[304px] sm:w-[336px] rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white/95 dark:bg-[#0D1421]/95 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-150"
        >
          <div className="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Azioni Rapide Terminale
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                {openTerminalCount} terminale · {openBotCount} bot attivi
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Chiudi menu azioni rapide"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2">
            {/* One-Click Emergency Sell All */}
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleSellAllClick()}
              className="w-full text-left p-3 rounded-lg border border-red-200 dark:border-red-500/35 bg-red-50/80 dark:bg-red-950/35 hover:bg-red-100/90 dark:hover:bg-red-950/60 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-red-600 dark:text-red-400 shrink-0">
                  {busyAction === "sell_all" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <OctagonAlert className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-red-700 dark:text-red-300 whitespace-nowrap">
                      {busyAction === "sell_all"
                        ? "Liquidazione in corso…"
                        : "Emergency Sell All"}
                    </span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-red-600 dark:text-red-400 shrink-0">
                      {totalOpen} {totalOpen === 1 ? "aperta" : "aperte"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                    Chiude subito tutte le posizioni aperte su Terminale e 3 Bot AI e mette in pausa l&apos;auto-trading.
                  </p>
                </div>
              </div>
            </button>

            {/* One-Click Re-Balance */}
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleRebalanceClick()}
              className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-50/90 dark:bg-white/[0.03] hover:bg-emerald-50/70 dark:hover:bg-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0">
                  {busyAction === "rebalance" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Scale className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {busyAction === "rebalance"
                        ? "Ribilanciamento…"
                        : "Re-Balance"}
                    </span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                      Size €{targetSizeEur}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                    Chiude posizioni sbilanciate, calibra la size al 10% dell&apos;equity e riallinea i 3 Bot in peso equo.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {lastActionNote && (
            <div className="px-4 py-2 border-t border-slate-200/70 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02] text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              Ultimo: {lastActionNote}
            </div>
          )}
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`h-11 px-4 rounded-xl border shadow-lg inline-flex items-center gap-2 text-xs font-bold whitespace-nowrap shrink-0 transition-transform duration-150 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          open
            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
            : "bg-slate-900/95 dark:bg-emerald-600 text-white border-slate-800 dark:border-emerald-500/80 hover:bg-slate-800 dark:hover:bg-emerald-500"
        }`}
      >
        {busyAction !== null ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : open ? (
          <X className="w-4 h-4" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        <span>
          {busyAction === "sell_all"
            ? "Chiusura…"
            : busyAction === "rebalance"
            ? "Ribilancio…"
            : "Quick Action"}
        </span>
        {totalOpen > 0 && busyAction === null && (
          <span className="font-mono text-[11px] opacity-80 tabular-nums">
            · {totalOpen}
          </span>
        )}
      </button>
    </div>
  );
};
