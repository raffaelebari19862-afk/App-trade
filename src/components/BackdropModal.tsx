import React, { useRef, useState } from "react";
import { Check, Image as ImageIcon, Moon, RotateCcw, Sun, Upload, X } from "lucide-react";
import { BACKDROP_PRESETS, DEFAULT_BACKDROP } from "../data/markets";
import type { BackdropConfig } from "../types/trading";

interface BackdropModalProps {
  open: boolean;
  onClose: () => void;
  backdrop: BackdropConfig;
  onUpdateBackdrop: (next: BackdropConfig) => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

export const BackdropModal: React.FC<BackdropModalProps> = ({
  open,
  onClose,
  backdrop,
  onUpdateBackdrop,
  darkMode,
  onToggleDark,
}) => {
  const [urlInput, setUrlInput] = useState(backdrop.customUrl || "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        try {
          const maxW = 1600;
          const scale = img.width > maxW ? maxW / img.width : 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setUploadError("Impossibile elaborare l'immagine selezionata.");
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL("image/jpeg", 0.82);
          setUrlInput(compressed);
          onUpdateBackdrop({
            ...backdrop,
            preset: "custom",
            customUrl: compressed,
          });
        } catch {
          setUploadError("Formato immagine non supportato.");
        }
      };
      img.onerror = () => setUploadError("File immagine non valido.");
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setUploadError(null);
    onUpdateBackdrop({
      ...backdrop,
      preset: "custom",
      customUrl: trimmed,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Personalizza Sfondo e Aspetto"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Personalizza Sfondo & Aspetto Terminale
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Scegli uno scenario istituzionale, regola intensità e sfocatura o carica una tua immagine
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-6">
          {/* Theme Surface Switch */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Modalità Superfici e Schede
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Scuro istituzionale consigliato per ridurre l'affaticamento visivo
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (!darkMode) onToggleDark();
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  darkMode
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Scuro Pro
              </button>
              <button
                type="button"
                onClick={() => {
                  if (darkMode) onToggleDark();
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  !darkMode
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Chiaro Slate
              </button>
            </div>
          </div>

          {/* Preset Gallery */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white">
              Sfondi Professionali Pronti
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {BACKDROP_PRESETS.map((preset) => {
                const active = backdrop.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onUpdateBackdrop({
                        ...backdrop,
                        preset: preset.id,
                      })
                    }
                    className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer ${
                      active
                        ? "border-emerald-500 ring-2 ring-emerald-500/25"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="relative h-24 w-full overflow-hidden bg-slate-900">
                      {preset.imagePath ? (
                        <img
                          src={preset.imagePath}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : preset.id === "obsidian_slate" ? (
                        <div className="w-full h-full bg-gradient-to-br from-[#070B12] via-[#0D1624] to-[#0B1F1C]" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-200 via-slate-300 to-emerald-100/70 dark:from-[#0B1220] dark:via-[#111C2D] dark:to-[#0C211C]" />
                      )}

                      {active && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-[#0B0F17]">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {preset.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {preset.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intensity & Blur Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Visibilità Immagine Sfondo
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {backdrop.intensity}%
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={90}
                step={5}
                value={backdrop.intensity}
                onChange={(e) =>
                  onUpdateBackdrop({
                    ...backdrop,
                    intensity: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </label>

            <label className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Sfocatura Sfondo
                </span>
                <span className="font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {backdrop.blurPx} px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={backdrop.blurPx}
                onChange={(e) =>
                  onUpdateBackdrop({
                    ...backdrop,
                    blurPx: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Custom Image Upload or URL */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                Sfondo Personalizzato (Immagine o URL)
              </div>

              <button
                type="button"
                onClick={() => onUpdateBackdrop(DEFAULT_BACKDROP)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Ripristina predefinito
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-800 dark:text-slate-200 hover:border-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Carica foto dal dispositivo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="flex-1 min-w-[200px] flex items-center gap-2">
                <input
                  type="text"
                  value={urlInput.startsWith("data:") ? "" : urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Oppure incolla URL immagine https://…"
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  Applica
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {uploadError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
