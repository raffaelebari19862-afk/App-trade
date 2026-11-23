import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { formatPrice, getAssetBadgeMeta } from "../data/markets";
import type {
  AlertSoundPreset,
  LiveQuote,
  MarketAsset,
  PriceAlert,
  PriceAlertCondition,
  SoundSettings,
} from "../types/trading";
import {
  ALERT_SOUND_PRESETS,
  playAlarmSound,
  unlockAudioContext,
} from "../utils/soundAlarm";

interface PriceAlertModalProps {
  open: boolean;
  onClose: () => void;
  markets: MarketAsset[];
  quotes: Record<string, LiveQuote>;
  selectedPair: string;
  alerts: PriceAlert[];
  ringingAlertIds: string[];
  soundSettings: SoundSettings;
  onUpdateSoundSettings: (next: SoundSettings) => void;
  onAddAlert: (alert: Omit<PriceAlert, "id" | "createdAt">) => void;
  onToggleAlert: (id: string) => void;
  onRearmAlert: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onSilenceAll: () => void;
  onSelectPair: (pair: string) => void;
}

function formatInputPrice(val: number): string {
  if (!(val > 0)) return "";
  if (val >= 1000) return val.toFixed(2);
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.01) return val.toFixed(5);
  return val.toFixed(7);
}

export const PriceAlertModal: React.FC<PriceAlertModalProps> = ({
  open,
  onClose,
  markets,
  quotes,
  selectedPair,
  alerts,
  ringingAlertIds,
  soundSettings,
  onUpdateSoundSettings,
  onAddAlert,
  onToggleAlert,
  onRearmAlert,
  onDeleteAlert,
  onSilenceAll,
  onSelectPair,
}) => {
  const [formPair, setFormPair] = useState<string>(selectedPair);
  const [condition, setCondition] = useState<PriceAlertCondition>("above");
  const [targetInput, setTargetInput] = useState<string>("");
  const [soundPreset, setSoundPreset] = useState<AlertSoundPreset>(
    soundSettings.defaultPreset
  );
  const [repeatUntilDismissed, setRepeatUntilDismissed] = useState<boolean>(true);
  const [note, setNote] = useState<string>("");
  const [listScope, setListScope] = useState<"selected" | "all">("all");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormPair(selectedPair);
    const live = quotes[selectedPair]?.mid;
    if (live && live > 0) {
      setTargetInput(formatInputPrice(live * 1.005));
      setCondition("above");
    } else {
      setTargetInput("");
    }
    setSoundPreset(soundSettings.defaultPreset);
    setFormError(null);
  }, [open, selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps

  const formAsset = useMemo(
    () => markets.find((m) => m.pair === formPair) || markets[0],
    [markets, formPair]
  );
  const formQuote = quotes[formAsset.pair];
  const currentMid = formQuote?.mid || 0;

  const parsedTarget = Number(targetInput.replace(",", "."));
  const isTargetValid = Number.isFinite(parsedTarget) && parsedTarget > 0;

  const immediateTriggerWarning = useMemo(() => {
    if (!isTargetValid || !(currentMid > 0)) return false;
    return condition === "above"
      ? currentMid >= parsedTarget
      : currentMid <= parsedTarget;
  }, [isTargetValid, currentMid, condition, parsedTarget]);

  const visibleAlerts = useMemo(() => {
    const base =
      listScope === "selected"
        ? alerts.filter((a) => a.pair === formAsset.pair)
        : alerts;
    return [...base].sort((a, b) => {
      const aRing = ringingAlertIds.includes(a.id) ? 1 : 0;
      const bRing = ringingAlertIds.includes(b.id) ? 1 : 0;
      if (aRing !== bRing) return bRing - aRing;
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [alerts, listScope, formAsset.pair, ringingAlertIds]);

  if (!open) return null;

  const applyPctOffset = (pct: number) => {
    if (!(currentMid > 0)) return;
    const nextPrice = currentMid * (1 + pct / 100);
    setTargetInput(formatInputPrice(nextPrice));
    if (pct > 0) setCondition("above");
    else if (pct < 0) setCondition("below");
    setFormError(null);
  };

  const handleTestSound = async (preset: AlertSoundPreset) => {
    await unlockAudioContext();
    await playAlarmSound(preset, soundSettings.volume);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTargetValid) {
      setFormError("Inserisci una soglia di prezzo valida maggiore di zero.");
      return;
    }
    await unlockAudioContext();
    onAddAlert({
      pair: formAsset.pair,
      assetName: formAsset.name,
      condition,
      targetPrice: parsedTarget,
      soundPreset,
      enabled: true,
      repeatUntilDismissed,
      note: note.trim() || undefined,
    });
    onUpdateSoundSettings({
      ...soundSettings,
      defaultPreset: soundPreset,
    });
    setNote("");
    setFormError(null);
  };

  const activeCount = alerts.filter((a) => a.enabled && !a.triggeredAt).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Allarmi Sonori di Prezzo"
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-500" />
              Allarmi Sonori di Prezzo Live
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ricevi un avviso acustico immediato quando un asset raggiunge la soglia configurata ({activeCount} attivi)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ringingAlertIds.length > 0 && (
              <button
                type="button"
                onClick={onSilenceAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <BellOff className="w-3.5 h-3.5" />
                Silenzia ({ringingAlertIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Chiudi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-5">
          {/* Global Audio Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B0F17]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  await unlockAudioContext();
                  onUpdateSoundSettings({
                    ...soundSettings,
                    muted: !soundSettings.muted,
                  });
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  soundSettings.muted
                    ? "border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {soundSettings.muted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    Audio Disattivato
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    Audio Attivo
                  </>
                )}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Volume suoneria
              </span>
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-xs">
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(soundSettings.volume * 100)}
                onChange={(e) =>
                  onUpdateSoundSettings({
                    ...soundSettings,
                    volume: Number(e.target.value) / 100,
                  })
                }
                aria-label="Volume allarme"
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums w-10 text-right">
                {Math.round(soundSettings.volume * 100)}%
              </span>
              <button
                type="button"
                onClick={() => handleTestSound(soundPreset)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111824] text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3 h-3" />
                Prova
              </button>
            </div>
          </div>

          {/* Create New Price Alert Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B0F17]/80 p-4 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Nuovo Allarme di Prezzo
              </h4>
              {currentMid > 0 && (
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Prezzo live {formAsset.name}:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {formatPrice(currentMid)}
                  </strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Asset Selector */}
              <label className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Asset / Mercato
                </span>
                <select
                  value={formAsset.pair}
                  onChange={(e) => {
                    const nextPair = e.target.value;
                    setFormPair(nextPair);
                    const nextMid = quotes[nextPair]?.mid;
                    if (nextMid && nextMid > 0) {
                      setTargetInput(
                        formatInputPrice(
                          nextMid * (condition === "above" ? 1.005 : 0.995)
                        )
                      );
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {markets.map((m) => (
                    <option key={m.pair} value={m.pair}>
                      {m.name} ({m.pair})
                    </option>
                  ))}
                </select>
              </label>

              {/* Condition Selector */}
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Condizione di Scatto
                </span>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#111824] border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCondition("above")}
                    className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      condition === "above"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    Sale ≥
                  </button>
                  <button
                    type="button"
                    onClick={() => setCondition("below")}
                    className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      condition === "below"
                        ? "bg-red-600 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <TrendingDown className="w-3 h-3" />
                    Scende ≤
                  </button>
                </div>
              </div>

              {/* Target Price Input */}
              <label className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Soglia Prezzo Target
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetInput}
                  onChange={(e) => {
                    setTargetInput(e.target.value);
                    setFormError(null);
                  }}
                  placeholder={currentMid > 0 ? formatInputPrice(currentMid) : "Es. 95000"}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </label>
            </div>

            {/* Quick Percentage Offset Buttons */}
            {currentMid > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                  Scostamento rapido:
                </span>
                {[-2, -1, -0.5, 0, 0.5, 1, 2].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => applyPctOffset(pct)}
                    className={`px-2 py-1 text-[11px] font-mono font-semibold rounded border transition-colors cursor-pointer ${
                      pct === 0
                        ? "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111824] text-slate-700 dark:text-slate-300 hover:border-blue-500"
                        : pct > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                        : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20"
                    }`}
                  >
                    {pct === 0 ? "Attuale" : `${pct > 0 ? "+" : ""}${pct}%`}
                  </button>
                ))}
              </div>
            )}

            {/* Sound Preset & Repeat Mode & Optional Note */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Tono Suoneria
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={soundPreset}
                    onChange={(e) =>
                      setSoundPreset(e.target.value as AlertSoundPreset)
                    }
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    {ALERT_SOUND_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleTestSound(soundPreset)}
                    title="Ascolta anteprima suono"
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] text-slate-700 dark:text-slate-200 hover:border-emerald-500 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </div>
              </label>

              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Modalità Suono
                </span>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#111824] border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setRepeatUntilDismissed(false)}
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      !repeatUntilDismissed
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Singolo
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepeatUntilDismissed(true)}
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      repeatUntilDismissed
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Ripetuto
                  </button>
                </div>
              </div>

              <label className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Nota (opzionale)
                </span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={60}
                  placeholder="Es. Breakout Fibonacci"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </label>
            </div>

            {immediateTriggerWarning && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                Il prezzo attuale ({formatPrice(currentMid)}) soddisfa già questa soglia: salvando ora l'allarme scatterà immediatamente.
              </div>
            )}

            {formError && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {formError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Attiva Allarme Sonoro
              </button>
            </div>
          </form>

          {/* Configured Alerts List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Allarmi Configurati ({visibleAlerts.length})
              </h4>

              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setListScope("all")}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    listScope === "all"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  Tutti ({alerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setListScope("selected")}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    listScope === "selected"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  Solo {formAsset.pair}
                </button>
              </div>
            </div>

            {visibleAlerts.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                Nessun allarme configurato in questa vista. Imposta una soglia qui sopra per ricevere un avviso sonoro live.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {visibleAlerts.map((alert) => {
                  const asset = markets.find((m) => m.pair === alert.pair);
                  const badge = asset
                    ? getAssetBadgeMeta(asset)
                    : { code: alert.pair.slice(0, 4), bgClass: "bg-slate-700 text-white" };
                  const liveMid = quotes[alert.pair]?.mid;
                  const distPct =
                    liveMid && liveMid > 0
                      ? ((alert.targetPrice - liveMid) / liveMid) * 100
                      : null;
                  const isRinging = ringingAlertIds.includes(alert.id);
                  const presetMeta = ALERT_SOUND_PRESETS.find(
                    (p) => p.id === alert.soundPreset
                  );

                  return (
                    <div
                      key={alert.id}
                      className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                        isRinging
                          ? "bg-amber-500/15 dark:bg-amber-500/15"
                          : "bg-white dark:bg-[#111824] hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold shrink-0 ${badge.bgClass}`}
                        >
                          {badge.code}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectPair(alert.pair);
                                onClose();
                              }}
                              className="font-semibold text-sm text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                            >
                              {alert.assetName}
                            </button>
                            <span
                              className={`font-mono text-xs font-bold tabular-nums ${
                                alert.condition === "above"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {alert.condition === "above" ? "≥" : "≤"}{" "}
                              {formatPrice(alert.targetPrice)}
                            </span>
                            {isRinging ? (
                              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                · SUONERIA ATTIVA
                              </span>
                            ) : alert.triggeredAt ? (
                              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                · Scattato {new Date(alert.triggeredAt).toLocaleTimeString("it-IT")}
                              </span>
                            ) : alert.enabled ? (
                              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                · In ascolto
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                · Sospeso
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 flex flex-wrap items-center gap-2">
                            <span>{presetMeta?.label || alert.soundPreset}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {alert.repeatUntilDismissed ? "Ripetuto" : "Singolo"}
                            </span>
                            {distPct !== null && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>
                                  Distanza {distPct >= 0 ? "+" : ""}
                                  {distPct.toFixed(2)}%
                                </span>
                              </>
                            )}
                            {alert.note && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-sans text-slate-600 dark:text-slate-300">
                                  {alert.note}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {alert.triggeredAt && !alert.enabled && (
                          <button
                            type="button"
                            onClick={() => onRearmAlert(alert.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Riattiva
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onToggleAlert(alert.id)}
                          title={alert.enabled ? "Metti in pausa" : "Attiva allarme"}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            alert.enabled
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          }`}
                        >
                          {alert.enabled ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Bell className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteAlert(alert.id)}
                          title="Elimina allarme"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-900/60 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
