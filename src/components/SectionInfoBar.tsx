import React, { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

export interface SectionInfoDetail {
  heading: string;
  body: string;
}

interface SectionInfoBarProps {
  title: string;
  summary: string;
  details: SectionInfoDetail[];
  compact?: boolean;
}

/**
 * Discreet, institutional trading-style collapsible info strip placed
 * beneath any section. Stays whisper-quiet until clicked, then unfolds
 * a crisp, non-garish operational guide without cluttering the desk.
 */
export const SectionInfoBar: React.FC<SectionInfoBarProps> = ({
  title,
  summary,
  details,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-slate-200/80 dark:border-white/[0.06] bg-slate-50/60 dark:bg-[#080E18]/70">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-3 text-left transition-colors hover:bg-slate-100/80 dark:hover:bg-white/[0.03] cursor-pointer ${
          compact ? "px-4 py-1.5" : "px-5 py-2"
        }`}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Info
            className={`w-3.5 h-3.5 shrink-0 transition-colors ${
              open
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-400 dark:text-slate-500"
            }`}
          />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate">
            Info · {title}
          </span>
          <span
            aria-hidden="true"
            className="hidden sm:inline text-slate-300 dark:text-slate-600"
          >
            /
          </span>
          <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-slate-500 truncate">
            {summary}
          </span>
        </span>

        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
          <span>{open ? "Chiudi" : "Dettagli"}</span>
          {open ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </span>
      </button>

      {open && (
        <div
          className={`border-t border-slate-200/70 dark:border-white/[0.06] bg-white/90 dark:bg-[#0A111D] ${
            compact ? "px-4 py-3" : "px-5 py-3.5"
          }`}
        >
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
            {summary}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 divide-y md:divide-y-0 md:divide-x divide-slate-200/70 dark:divide-white/[0.06]">
            {details.map((item, idx) => (
              <div
                key={item.heading}
                className={idx > 0 ? "pt-3 md:pt-0 md:pl-3.5" : ""}
              >
                <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {item.heading}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
