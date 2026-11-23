import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, Sun, Moon, Bell, BellOff, Image as ImageIcon, X } from "lucide-react";
import type { StrategyConfig } from "../types/trading";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  config: StrategyConfig;
  onUpdateConfig: (next: StrategyConfig) => void;
  pushEnabled: boolean;
  onTogglePush: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onOpenBackdrop: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onResetAccount: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  open,
  onClose,
  config,
  onUpdateConfig,
  pushEnabled,
  onTogglePush,
  darkMode,
  onToggleDark,
  onOpenBackdrop,
  onExportBackup,
  onImportBackup,
  onResetAccount,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  if (!open) return null;

  const updateNum = (field: keyof StrategyConfig, raw: string, fallback: number) => {
    const val = parseFloat(raw);
    onUpdateConfig({
      ...config,
      [field]: Number.isFinite(val) ? val : fallback,
    });
  };

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimerRef.current = window.setTimeout(() => {
        setConfirmReset(false);
      }, 4000);
      return;
    }
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setConfirmReset(false);
    onResetAccount();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Impostazioni Strategia e Sistema"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111722] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Parametri Strategia, IA & Conto
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Target minimo ROI, controlli multipli, validazione IA Gemini, trailing profit e notifiche
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

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-6">
          {/* Quick System Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleDark}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {darkMode ? "Tema Chiaro" : "Tema Scuro"}
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBackdrop();
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Personalizza Sfondo
            </button>

            <button
              type="button"
              onClick={onTogglePush}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                pushEnabled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300"
              }`}
            >
              {pushEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              {pushEnabled ? "Notifiche Browser ON" : "Notifiche Browser OFF"}
            </button>

            <button
              type="button"
              onClick={onExportBackup}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Esporta backup
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Importa backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportBackup(file);
                e.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              onClick={handleResetClick}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ml-auto ${
                confirmReset
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {confirmReset ? "Conferma azzeramento" : "Azzera conto"}
            </button>
          </div>

          {/* AI Gate & Profit Trailing Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17]">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Approvazione IA obbligatoria
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ogni apertura deve essere approvata da Gemini
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ ...config, requireAiApproval: !config.requireAiApproval })
                }
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  config.requireAiApproval
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                {config.requireAiApproval ? "ATTIVO" : "DISATTIVO"}
              </button>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17]">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Trailing Max Profitto (+10%+)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Blocca il +10% e lascia correre i profitti
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    ...config,
                    enableTrailingProfit: !config.enableTrailingProfit,
                  })
                }
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  config.enableTrailingProfit
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                {config.enableTrailingProfit ? "ATTIVO" : "DISATTIVO"}
              </button>
            </div>
          </div>

          {/* Numeric Parameters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Capitale €
              <input
                type="number"
                value={config.capital}
                onChange={(e) => updateNum("capital", e.target.value, 500)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Importo posizione €
              <input
                type="number"
                value={config.sizeEur}
                onChange={(e) => updateNum("sizeEur", e.target.value, 150)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Target Profitto min (%)
              <input
                type="number"
                min={10}
                step="1"
                value={config.minTargetRoiPct}
                onChange={(e) =>
                  updateNum("minTargetRoiPct", e.target.value, 10)
                }
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Costo € apri/chiudi
              <input
                type="number"
                step="0.1"
                value={config.feeEur}
                onChange={(e) => updateNum("feeEur", e.target.value, 1)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Leva Crypto (OKX)
              <input
                type="number"
                value={config.cryptoLeverage}
                onChange={(e) => updateNum("cryptoLeverage", e.target.value, 10)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Leva Indici / Metalli
              <input
                type="number"
                value={config.tradfiLeverage}
                onChange={(e) => updateNum("tradfiLeverage", e.target.value, 5)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Max posizioni aperte
              <input
                type="number"
                value={config.maxOpen}
                onChange={(e) => updateNum("maxOpen", e.target.value, 3)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              R:R netto minimo
              <input
                type="number"
                step="0.1"
                value={config.minRR}
                onChange={(e) => updateNum("minRR", e.target.value, 1.5)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Conferme minime (≥ 3)
              <input
                type="number"
                min={3}
                value={config.minConfirmations}
                onChange={(e) =>
                  updateNum("minConfirmations", e.target.value, 3)
                }
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Punteggio minimo (0–100)
              <input
                type="number"
                value={config.minScore}
                onChange={(e) => updateNum("minScore", e.target.value, 65)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Tempo max durata (s)
              <input
                type="number"
                value={config.maxHoldSec}
                onChange={(e) => updateNum("maxHoldSec", e.target.value, 7200)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono font-semibold text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Telegram Bot Token
              <input
                type="text"
                value={config.tgToken}
                onChange={(e) =>
                  onUpdateConfig({ ...config, tgToken: e.target.value })
                }
                placeholder="Opzionale"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono text-xs"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 sm:col-span-3">
              Telegram Chat ID
              <input
                type="text"
                value={config.tgChatId}
                onChange={(e) =>
                  onUpdateConfig({ ...config, tgChatId: e.target.value })
                }
                placeholder="Opzionale"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono text-xs"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
