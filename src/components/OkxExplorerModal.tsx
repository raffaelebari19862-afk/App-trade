import React, { useEffect, useMemo, useState } from "react";
import { Plus, Check, Search, X, RefreshCw } from "lucide-react";
import type { MarketAsset, OkxTickerRow } from "../types/trading";
import { formatPrice } from "../data/markets";

interface OkxExplorerModalProps {
  open: boolean;
  onClose: () => void;
  activeAssets: MarketAsset[];
  onToggleAsset: (asset: MarketAsset) => void;
}

export const OkxExplorerModal: React.FC<OkxExplorerModalProps> = ({
  open,
  onClose,
  activeAssets,
  onToggleAsset,
}) => {
  const [tickers, setTickers] = useState<OkxTickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [instType, setInstType] = useState<"SWAP" | "SPOT">("SWAP");

  const loadTickers = async (type: "SWAP" | "SPOT") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/okx/tickers?instType=${type}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.data || !Array.isArray(json.data)) {
        throw new Error("Formato risposta OKX non valido");
      }

      const parsed: OkxTickerRow[] = json.data
        .filter((item: Record<string, string>) => {
          const id = item.instId || "";
          return id.includes("-USDT") && Number(item.bidPx) > 0 && Number(item.askPx) > 0;
        })
        .map((item: Record<string, string>) => {
          const last = Number(item.last);
          const open24h = Number(item.open24h);
          const changePct24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
          return {
            instId: item.instId,
            instType: item.instType || type,
            last,
            bidPx: Number(item.bidPx),
            askPx: Number(item.askPx),
            open24h,
            high24h: Number(item.high24h),
            low24h: Number(item.low24h),
            volCcy24h: Number(item.volCcy24h || item.vol24h || 0),
            changePct24h,
          };
        })
        .sort((a: OkxTickerRow, b: OkxTickerRow) => b.volCcy24h - a.volCcy24h);

      setTickers(parsed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore caricamento valute OKX"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTickers(instType);
    }
  }, [open, instType]);

  const activeOkxIds = useMemo(
    () => new Set(activeAssets.map((a) => a.okxId).filter(Boolean)),
    [activeAssets]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    const list = q
      ? tickers.filter((t) => t.instId.toUpperCase().includes(q))
      : tickers;
    return list.slice(0, 80);
  }, [tickers, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Esplora Valute Live OKX"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111722] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Catalogo Valute Live OKX
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dati pubblici OKX in tempo reale senza chiave API · Seleziona le coppie da monitorare nello scanner
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca ticker OKX (es. PEPE, ARB, NEAR, RENDER)…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setInstType("SWAP")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                instType === "SWAP"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Perpetual SWAP
            </button>
            <button
              type="button"
              onClick={() => setInstType("SPOT")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                instType === "SPOT"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Spot USDT
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadTickers(instType)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/80">
          {loading && tickers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Scaricamento coppie live da OKX…
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nessuna valuta trovata per "{search}".
            </div>
          ) : (
            filtered.map((row) => {
              const base = row.instId.split("-")[0];
              const isAdded = activeOkxIds.has(row.instId);
              const asset: MarketAsset = {
                pair: `${base}/USD${instType === "SPOT" ? " (Spot)" : ""}`,
                name: base,
                group: "c",
                okxId: row.instId,
                custom: true,
              };

              return (
                <div
                  key={row.instId}
                  className="flex items-center justify-between gap-4 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {base}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {row.instId}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                      Bid {formatPrice(row.bidPx)} / Ask {formatPrice(row.askPx)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        ${formatPrice(row.last)}
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          row.changePct24h >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {row.changePct24h >= 0 ? "+" : ""}
                        {row.changePct24h.toFixed(2)}%
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleAsset(asset)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                        isAdded
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-blue-500"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Attiva
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          Aggiungi
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
