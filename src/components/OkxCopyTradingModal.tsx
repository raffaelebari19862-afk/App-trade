import React, { useState } from "react";
import { RefreshCw, Unplug, CheckCircle2, AlertCircle, X, KeyRound } from "lucide-react";
import type { OkxCopySettings, OkxCopyStatus } from "../types/trading";

interface OkxCopyTradingModalProps {
  open: boolean;
  onClose: () => void;
  status: OkxCopyStatus;
  copySettings: OkxCopySettings;
  onUpdateCopySettings: (next: OkxCopySettings) => void;
  onRefreshStatus: () => Promise<void>;
  onConnected: (nextStatus: OkxCopyStatus) => void;
  onDisconnected: () => void;
}

export const OkxCopyTradingModal: React.FC<OkxCopyTradingModalProps> = ({
  open,
  onClose,
  status,
  copySettings,
  onUpdateCopySettings,
  onRefreshStatus,
  onConnected,
  onDisconnected,
}) => {
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [simulated, setSimulated] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/okx/copytrading/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secretKey, passphrase, simulated }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Connessione OKX rifiutata.");
      }
      onConnected(json);
      setApiKey("");
      setSecretKey("");
      setPassphrase("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Errore connessione OKX");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await fetch("/api/okx/copytrading/disconnect", { method: "POST" });
      onDisconnected();
    } catch {
      setErrorMsg("Errore durante la disconnessione.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefreshStatus();
    setRefreshing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="OKX Live Copy Trading API"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111722] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              OKX Copy Trading Live (API v5)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Collega il tuo account OKX per replicare automaticamente le operazioni approvate da IA e 3 controlli
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

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {status.connected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      Account OKX Connesso ({status.simulated ? "Demo Trading" : "Live Reale"})
                    </div>
                    <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      Chiave {status.maskedKey} · Equity ${Number(status.totalEqUsd || 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Aggiorna
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 cursor-pointer"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Disconnetti
                  </button>
                </div>
              </div>

              {/* Copy Trading Execution Controls */}
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Copia automatica ordini su OKX
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Invia automaticamente l'ordine su OKX quando una coppia supera i 3 controlli e l'IA
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCopySettings({
                        ...copySettings,
                        enabled: !copySettings.enabled,
                      })
                    }
                    className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      copySettings.enabled
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {copySettings.enabled ? "Copy ON" : "Copy OFF"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Quantità contratti OKX (sz)
                    <input
                      type="text"
                      value={copySettings.orderSizeContracts}
                      onChange={(e) =>
                        onUpdateCopySettings({
                          ...copySettings,
                          orderSizeContracts: e.target.value,
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111722] font-mono text-sm font-semibold text-slate-900 dark:text-white"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Modalità Margine
                    <select
                      value={copySettings.marginMode}
                      onChange={(e) =>
                        onUpdateCopySettings({
                          ...copySettings,
                          marginMode: e.target.value === "isolated" ? "isolated" : "cross",
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111722] text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="cross">Cross Margin</option>
                      <option value="isolated">Isolated Margin</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Balances & Open OKX Positions */}
              {status.balances && status.balances.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Saldi Live OKX
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {status.balances.map((b) => (
                      <div
                        key={b.ccy}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] font-mono tabular-nums"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {b.ccy}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          {b.availBal.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {status.positions && status.positions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Posizioni Live aperte su OKX ({status.positions.length})
                  </h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {status.positions.map((p, i) => (
                      <div
                        key={`${p.instId}-${i}`}
                        className="px-3.5 py-2.5 flex items-center justify-between text-xs font-mono tabular-nums"
                      >
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {p.instId}
                          </span>{" "}
                          <span className="text-slate-500">
                            ×{p.lever} · sz {p.pos}
                          </span>
                        </div>
                        <div
                          className={
                            p.upl >= 0
                              ? "text-emerald-600 dark:text-emerald-400 font-bold"
                              : "text-red-600 dark:text-red-400 font-bold"
                          }
                        >
                          {p.upl >= 0 ? "+" : ""}
                          ${p.upl.toFixed(2)} ({p.uplRatio.toFixed(2)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="flex items-center gap-2 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSimulated(true)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    simulated
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  OKX Demo Trading (Consigliato per test)
                </button>
                <button
                  type="button"
                  onClick={() => setSimulated(false)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    !simulated
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  OKX Live Reale
                </button>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                OKX API Key
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Inserisci la API Key generata nell'app OKX"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] font-mono text-xs text-slate-900 dark:text-white"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                OKX Secret Key
                <input
                  type="password"
                  required
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Inserisci la Secret Key OKX"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] font-mono text-xs text-slate-900 dark:text-white"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                Passphrase OKX
                <input
                  type="password"
                  required
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Passphrase impostata su OKX"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] font-mono text-xs text-slate-900 dark:text-white"
                />
              </label>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Le credenziali OKX vengono firmate in HMAC-SHA256 esclusivamente in memoria RAM sul server locale per questa sessione e non vengono mai salvate su file. Abilita solo i permessi di Lettura e Trading (senza prelievi) nell'app OKX.
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {submitting ? "Verifica firma OKX in corso…" : "Collega Account OKX"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
