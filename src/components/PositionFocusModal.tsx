import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  Layers,
  Power,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type {
  BotPositionItem,
  MultiHorizonEstimate,
  OpenPosition,
} from "../types/trading";
import { formatEur, formatPrice, formatSignedEur } from "../data/markets";
import { SectionInfoBar } from "./SectionInfoBar";

export type FocusedPositionTarget =
  | {
      kind: "bot";
      botIndex: 1 | 2 | 3;
      position: BotPositionItem;
    }
  | {
      kind: "terminal";
      position: OpenPosition;
      assetName: string;
      instId?: string;
      livePrice?: number;
      bid?: number;
      ask?: number;
    };

interface LiveQuotePayload {
  instId: string;
  last: number;
  bid: number;
  ask: number;
  open24h: number;
  high24h: number;
  low24h: number;
  spreadPct: number;
  changePct24h: number;
  sparkline: number[];
  multiHorizon: MultiHorizonEstimate | null;
  ts: number;
}

interface PositionFocusModalProps {
  target: FocusedPositionTarget | null;
  tickNow: number;
  onClose: () => void;
  onCloseBotSlot?: (botIndex: 1 | 2 | 3) => Promise<void>;
  onCloseTerminalPosition?: (posId: string) => void;
  onOpenFullChart: (target: FocusedPositionTarget) => void;
}

function formatDurationSec(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const PositionFocusModal: React.FC<PositionFocusModalProps> = ({
  target,
  tickNow,
  onClose,
  onCloseBotSlot,
  onCloseTerminalPosition,
  onOpenFullChart,
}) => {
  const [liveQuote, setLiveQuote] = useState<LiveQuotePayload | null>(null);
  const [closing, setClosing] = useState(false);
  const [tickFlash, setTickFlash] = useState<"up" | "down" | null>(null);
  const [tickKey, setTickKey] = useState(0);
  const prevPriceRef = useRef<number | null>(null);

  const instId =
    target?.kind === "bot" ? target.position.instId : target?.instId;
  const direction: "L" | "S" =
    target?.kind === "bot"
      ? target.position.direction
      : target?.position.side || "L";
  const isOpenStatus =
    target?.kind === "bot" ? target.position.status === "open" : true;

  // High-frequency 1.2s live quote polling while Focus Modal is open
  useEffect(() => {
    if (!target || !instId) {
      setLiveQuote(null);
      return;
    }

    let cancelled = false;
    const fetchLive = async () => {
      try {
        const res = await fetch(
          `/api/bots/live-quote?instId=${encodeURIComponent(
            instId
          )}&direction=${direction}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as LiveQuotePayload;
        if (cancelled || !json?.last) return;
        setLiveQuote(json);
      } catch {
        // keep last valid tick
      }
    };

    void fetchLive();
    const timer = window.setInterval(() => {
      if (!document.hidden && isOpenStatus) {
        void fetchLive();
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [target?.kind, instId, direction, isOpenStatus]);

  // Compute unified real-time numbers
  const computed = useMemo(() => {
    if (!target) return null;

    if (target.kind === "bot") {
      const pos = target.position;
      const isLong = pos.direction === "L";
      const livePx =
        pos.status === "open" && liveQuote?.last && liveQuote.last > 0
          ? liveQuote.last
          : pos.currentPrice || pos.entryPrice;
      const bidPx = liveQuote?.bid || pos.bidPrice || livePx;
      const askPx = liveQuote?.ask || pos.askPrice || livePx;
      const spreadPct =
        liveQuote?.spreadPct ??
        (livePx > 0 ? ((askPx - bidPx) / livePx) * 100 : 0);

      const rawMove =
        pos.entryPrice > 0
          ? isLong
            ? (livePx - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - livePx) / pos.entryPrice
          : 0;
      const feeEur = pos.allocatedMarginEur * pos.leverage * 0.0008;
      const livePnlEur =
        pos.status === "open"
          ? Number((pos.allocatedMarginEur * pos.leverage * rawMove - feeEur).toFixed(2))
          : pos.livePnlEur;
      const liveRoiPct =
        pos.allocatedMarginEur > 0
          ? Number(((livePnlEur / pos.allocatedMarginEur) * 100).toFixed(2))
          : 0;
      const costEur = pos.allocatedMarginEur;
      const livePositionValueEur = Number((costEur + livePnlEur).toFixed(2));
      const entryNotionalEur = Number((costEur * pos.leverage).toFixed(2));
      const liveNotionalEur = Number(
        Math.max(0, livePositionValueEur * pos.leverage).toFixed(2)
      );
      const priceChangePct =
        pos.entryPrice > 0
          ? ((livePx - pos.entryPrice) / pos.entryPrice) * 100
          : 0;
      const favorableMovePct = rawMove * 100;

      const tpDistPct =
        livePx > 0
          ? isLong
            ? ((pos.targetPrice - livePx) / livePx) * 100
            : ((livePx - pos.targetPrice) / livePx) * 100
          : 0;
      const slDistPct =
        livePx > 0
          ? isLong
            ? ((livePx - pos.stopPrice) / livePx) * 100
            : ((pos.stopPrice - livePx) / livePx) * 100
          : 0;

      const span = isLong
        ? pos.targetPrice - pos.stopPrice
        : pos.stopPrice - pos.targetPrice;
      const progressPct =
        span > 0
          ? Math.max(
              0,
              Math.min(
                100,
                isLong
                  ? ((livePx - pos.stopPrice) / span) * 100
                  : ((pos.stopPrice - livePx) / span) * 100
              )
            )
          : 50;
      const entryMarkerPct =
        span > 0
          ? Math.max(
              6,
              Math.min(
                94,
                isLong
                  ? ((pos.entryPrice - pos.stopPrice) / span) * 100
                  : ((pos.stopPrice - pos.entryPrice) / span) * 100
              )
            )
          : 40;

      return {
        title: pos.name,
        symbol: pos.symbol,
        badge: `BOT #${pos.botIndex}`,
        isLong,
        isOpen: pos.status === "open",
        exitReason: pos.exitReason,
        leverage: pos.leverage,
        entryPrice: pos.entryPrice,
        livePrice: livePx,
        bidPrice: bidPx,
        askPrice: askPx,
        spreadPct,
        targetPrice: pos.targetPrice,
        stopPrice: pos.stopPrice,
        costEur,
        livePositionValueEur,
        entryNotionalEur,
        liveNotionalEur,
        feeEur,
        livePnlEur,
        liveRoiPct,
        peakPnlEur: Math.max(pos.peakPnlEur, livePnlEur),
        priceChangePct,
        favorableMovePct,
        tpDistPct,
        slDistPct,
        progressPct,
        entryMarkerPct,
        openedAt: pos.openedAt,
        expiresAt: pos.expiresAt,
        technique: pos.technique,
        reasoning: pos.reasoning,
        multiHorizon: pos.entryMeta?.multiHorizon || liveQuote?.multiHorizon || null,
      };
    }

    // Terminal open position
    const pos = target.position;
    const isLong = pos.side === "L";
    const livePx =
      liveQuote?.last && liveQuote.last > 0
        ? liveQuote.last
        : target.livePrice || pos.entryPrice;
    const bidPx = liveQuote?.bid || target.bid || livePx;
    const askPx = liveQuote?.ask || target.ask || livePx;
    const spreadPct =
      liveQuote?.spreadPct ??
      (livePx > 0 ? ((askPx - bidPx) / livePx) * 100 : 0);

    const exitPx = isLong ? bidPx : askPx;
    const rawMove =
      pos.entryPrice > 0
        ? isLong
          ? (exitPx - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPx) / pos.entryPrice
        : 0;
    const feeEur = 2 * pos.feePerSide;
    const livePnlEur = Number((pos.notionalEur * rawMove - feeEur).toFixed(2));
    const liveRoiPct =
      pos.sizeEur > 0 ? Number(((livePnlEur / pos.sizeEur) * 100).toFixed(2)) : 0;
    const costEur = pos.sizeEur;
    const livePositionValueEur = Number((costEur + livePnlEur).toFixed(2));
    const entryNotionalEur = Number(pos.notionalEur.toFixed(2));
    const liveNotionalEur = Number(
      Math.max(0, livePositionValueEur * pos.leverage).toFixed(2)
    );
    const priceChangePct =
      pos.entryPrice > 0 ? ((livePx - pos.entryPrice) / pos.entryPrice) * 100 : 0;

    const targetPrice = isLong
      ? pos.entryPrice * (1 + Math.abs(pos.tpPct) / 100)
      : pos.entryPrice * (1 - Math.abs(pos.tpPct) / 100);
    const stopPrice = isLong
      ? pos.entryPrice * (1 + pos.slPct / 100)
      : pos.entryPrice * (1 - pos.slPct / 100);

    const tpDistPct =
      livePx > 0
        ? isLong
          ? ((targetPrice - livePx) / livePx) * 100
          : ((livePx - targetPrice) / livePx) * 100
        : 0;
    const slDistPct =
      livePx > 0
        ? isLong
          ? ((livePx - stopPrice) / livePx) * 100
          : ((stopPrice - livePx) / livePx) * 100
        : 0;

    const span = isLong ? targetPrice - stopPrice : stopPrice - targetPrice;
    const progressPct =
      span > 0
        ? Math.max(
            0,
            Math.min(
              100,
              isLong
                ? ((livePx - stopPrice) / span) * 100
                : ((stopPrice - livePx) / span) * 100
            )
          )
        : 50;
    const entryMarkerPct =
      span > 0
        ? Math.max(
            6,
            Math.min(
              94,
              isLong
                ? ((pos.entryPrice - stopPrice) / span) * 100
                : ((stopPrice - pos.entryPrice) / span) * 100
            )
          )
        : 40;

    return {
      title: target.assetName,
      symbol: pos.pair,
      badge: "TERMINALE",
      isLong,
      isOpen: true,
      exitReason: undefined,
      leverage: pos.leverage,
      entryPrice: pos.entryPrice,
      livePrice: livePx,
      bidPrice: bidPx,
      askPrice: askPx,
      spreadPct,
      targetPrice,
      stopPrice,
      costEur,
      livePositionValueEur,
      entryNotionalEur,
      liveNotionalEur,
      feeEur,
      livePnlEur,
      liveRoiPct,
      peakPnlEur: Number(((pos.peakRoiPct / 100) * pos.sizeEur).toFixed(2)),
      priceChangePct,
      favorableMovePct: rawMove * 100,
      tpDistPct,
      slDistPct,
      progressPct,
      entryMarkerPct,
      openedAt: pos.openedAt,
      expiresAt: 0,
      technique: pos.reason || "Operazione Diretta Terminale",
      reasoning:
        pos.aiReasoning ||
        `Posizione ${isLong ? "LONG" : "SHORT"} aperta sul terminale a ${formatPrice(
          pos.entryPrice
        )} con leva ${pos.leverage}x.`,
      multiHorizon: liveQuote?.multiHorizon || null,
    };
  }, [target, liveQuote]);

  // Detect live price tick direction for crisp visual feedback
  useEffect(() => {
    if (!computed) return;
    const prev = prevPriceRef.current;
    if (prev !== null && computed.livePrice !== prev) {
      setTickFlash(computed.livePrice > prev ? "up" : "down");
      setTickKey((k) => k + 1);
    }
    prevPriceRef.current = computed.livePrice;
  }, [computed?.livePrice]);

  useEffect(() => {
    prevPriceRef.current = null;
    setTickFlash(null);
  }, [target?.kind, instId]);

  // Close on Escape
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const sparkPoints = useMemo(() => {
    if (!computed) {
      return { polyline: "0,42 440,42", entryY: 42, lastX: 440, lastY: 42, min: 0, max: 0 };
    }
    const raw = liveQuote?.sparkline || [];
    const arr =
      raw.length >= 2
        ? [...raw.slice(0, -1), computed.livePrice]
        : [computed.entryPrice, computed.livePrice];
    const min = Math.min(...arr, computed.entryPrice);
    const max = Math.max(...arr, computed.entryPrice);
    const range = max - min || computed.entryPrice * 0.002 || 1;
    const width = 440;
    const height = 84;
    const padY = 8;

    const coords = arr.map((val, idx) => {
      const x = (idx / Math.max(1, arr.length - 1)) * width;
      const y = height - padY - ((val - min) / range) * (height - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const entryY =
      height -
      padY -
      ((computed.entryPrice - min) / range) * (height - padY * 2);
    const lastCoord = coords[coords.length - 1].split(",");
    return {
      polyline: coords.join(" "),
      entryY,
      lastX: Number(lastCoord[0]),
      lastY: Number(lastCoord[1]),
      min,
      max,
    };
  }, [liveQuote?.sparkline, computed]);

  if (!target || !computed) return null;

  const isWinning = computed.livePnlEur >= 0;

  const handleCloseAction = async () => {
    if (closing) return;
    setClosing(true);
    try {
      if (target.kind === "bot" && onCloseBotSlot) {
        await onCloseBotSlot(target.botIndex);
        onClose();
      } else if (target.kind === "terminal" && onCloseTerminalPosition) {
        onCloseTerminalPosition(target.position.pair);
        onClose();
      }
    } finally {
      setClosing(false);
    }
  };

  const horizonCells = computed.multiHorizon
    ? [
        { key: "1H", title: "Ultime Ore", stat: computed.multiHorizon.hours },
        { key: "1D", title: "Ultimi Giorni", stat: computed.multiHorizon.days },
        { key: "1W", title: "Settimane", stat: computed.multiHorizon.weeks },
        { key: "1M", title: "Mesi / Anni", stat: computed.multiHorizon.monthsYears },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0B111C] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Identification Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-200 shrink-0">
              {computed.badge}
            </span>
            <h3 className="font-display text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">
              {computed.title}{" "}
              <span className="font-mono text-sm font-semibold text-slate-500 dark:text-slate-400">
                ({computed.symbol})
              </span>
            </h3>
            <span
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-mono text-[11px] font-bold shrink-0 ${
                computed.isLong
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {computed.isLong ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {computed.isLong ? "LONG" : "SHORT"} ×{computed.leverage}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi focus posizione"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Focus Body */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          {/* 1. UNMISTAKABLE LIVE PROFIT / LOSS HERO */}
          <div
            className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
              isWinning
                ? "bg-emerald-500/[0.07] border-emerald-500/30"
                : "bg-red-500/[0.07] border-red-500/30"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                {isWinning ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                <span
                  className={`font-mono text-xs font-extrabold tracking-wider uppercase ${
                    isWinning
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-700 dark:text-red-300"
                  }`}
                >
                  {computed.isOpen
                    ? isWinning
                      ? "IN GUADAGNO LIVE"
                      : "IN PERDITA LIVE"
                    : `CHIUSA (${computed.exitReason || "Completata"})`}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2.5 font-mono tabular-nums">
                <span
                  className={`text-3xl font-extrabold tracking-tight ${
                    isWinning
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatSignedEur(computed.livePnlEur)}
                </span>
                <span
                  className={`text-base font-bold ${
                    isWinning
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-700 dark:text-red-300"
                  }`}
                >
                  ({computed.liveRoiPct >= 0 ? "+" : ""}
                  {computed.liveRoiPct.toFixed(2)}% ROI)
                </span>
              </div>
            </div>

            <div className="text-right font-mono text-xs tabular-nums space-y-1">
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                Prob. vittoria live:{" "}
                <strong
                  className={
                    computed.progressPct >= 55
                      ? "text-emerald-600 dark:text-emerald-400"
                      : computed.progressPct >= 35
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {Math.round(
                    Math.max(
                      16,
                      Math.min(
                        97,
                        (computed.multiHorizon?.alignmentScore ?? 72) * 0.5 +
                          computed.progressPct * 0.5 +
                          (isWinning ? 5 : -4)
                      )
                    )
                  )}
                  %
                </strong>
              </div>
              <div className="flex items-center justify-end gap-1.5 text-slate-600 dark:text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Aperta da {formatDurationSec(tickNow - computed.openedAt)}</span>
              </div>
              {computed.expiresAt > 0 && computed.isOpen && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Scadenza ciclo:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {formatDurationSec(computed.expiresAt - tickNow)}
                  </strong>
                </div>
              )}
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Picco max:{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {formatSignedEur(computed.peakPnlEur)}
                </strong>
              </div>
            </div>
          </div>

          {/* 2. LIVE CRYPTO PRICE & LIVE POSITION COST/VALUE (SIDE BY SIDE) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Left: Live Crypto / Asset Price */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  Costo Crypto / Asset Live
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Agg. 1.2s
                </span>
              </div>

              <div
                key={`px-${tickKey}`}
                className={`rounded-lg px-2 py-1 -mx-2 transition-colors ${
                  tickFlash === "up"
                    ? "tick-flash-up"
                    : tickFlash === "down"
                    ? "tick-flash-down"
                    : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {formatPrice(computed.livePrice)}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      computed.priceChangePct >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {tickFlash === "up" ? "▲ " : tickFlash === "down" ? "▼ " : ""}
                    {computed.priceChangePct >= 0 ? "+" : ""}
                    {computed.priceChangePct.toFixed(3)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70 dark:border-white/[0.06] font-mono text-[11px] tabular-nums">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Ingresso</div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {formatPrice(computed.entryPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Spread Live</div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {computed.spreadPct.toFixed(3)}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Bid / Ask</div>
                  <div className="text-slate-700 dark:text-slate-300 truncate">
                    {formatPrice(computed.bidPrice)} / {formatPrice(computed.askPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Distanza TP / SL</div>
                  <div className="text-slate-700 dark:text-slate-300">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{Math.max(0, computed.tpDistPct).toFixed(2)}%
                    </span>{" "}
                    /{" "}
                    <span className="text-red-500">
                      -{Math.max(0, computed.slDistPct).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Live Position Cost vs Live Value */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  Costo &amp; Valore Posizione Live
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Leva ×{computed.leverage}
                </span>
              </div>

              <div
                key={`val-${tickKey}`}
                className={`rounded-lg px-2 py-1 -mx-2 transition-colors ${
                  tickFlash === "up"
                    ? isWinning
                      ? "tick-flash-up"
                      : "tick-flash-down"
                    : tickFlash === "down"
                    ? isWinning
                      ? "tick-flash-up"
                      : "tick-flash-down"
                    : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span
                    className={`text-2xl font-extrabold ${
                      isWinning
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatEur(computed.livePositionValueEur)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    valore attuale
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70 dark:border-white/[0.06] font-mono text-[11px] tabular-nums">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Costo Posizione</div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {formatEur(computed.costEur)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Esposizione Live</div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {formatEur(computed.liveNotionalEur)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Nozionale Apertura</div>
                  <div className="text-slate-700 dark:text-slate-300">
                    {formatEur(computed.entryNotionalEur)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Fee Stimate</div>
                  <div className="text-slate-700 dark:text-slate-300">
                    -{formatEur(computed.feeEur)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. LIVE PRICE SPARKLINE & SL -> ENTRY -> TP TRAJECTORY */}
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.015] p-4 space-y-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Andamento Prezzo Live (Ultime 24 Candele 1m)</span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                Movimento favorevole: {computed.favorableMovePct >= 0 ? "+" : ""}
                {computed.favorableMovePct.toFixed(3)}%
              </span>
            </div>

            <div className="w-full h-[84px] rounded-lg bg-white dark:bg-[#070B12] border border-slate-200/70 dark:border-white/[0.06] overflow-hidden">
              <svg
                viewBox="0 0 440 84"
                preserveAspectRatio="none"
                className="w-full h-full"
              >
                <line
                  x1="0"
                  y1={sparkPoints.entryY}
                  x2="440"
                  y2={sparkPoints.entryY}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  className="text-slate-300 dark:text-slate-600"
                  strokeWidth="1"
                />
                <polyline
                  fill="none"
                  stroke={isWinning ? "#10b981" : "#ef4444"}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={sparkPoints.polyline}
                />
                <circle
                  cx={sparkPoints.lastX}
                  cy={sparkPoints.lastY}
                  r="4"
                  fill={isWinning ? "#10b981" : "#ef4444"}
                />
              </svg>
            </div>

            {/* SL -> Entry -> TP Trajectory */}
            <div className="space-y-1.5">
              <div className="relative h-2 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isWinning ? "bg-emerald-500" : "bg-red-500"
                  }`}
                  style={{ width: `${computed.progressPct}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white"
                  style={{ left: `${computed.entryMarkerPct}%` }}
                  title={`Ingresso ${formatPrice(computed.entryPrice)}`}
                />
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                <span className="text-red-600 dark:text-red-400">
                  SL {formatPrice(computed.stopPrice)}
                </span>
                <span>Ingresso {formatPrice(computed.entryPrice)}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  TP {formatPrice(computed.targetPrice)}
                </span>
              </div>
            </div>
          </div>

          {/* 4. PRE-ENTRY MULTI-HORIZON CANDLE ESTIMATE (ORE / GIORNI / SETTIMANE / MESI-ANNI) */}
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.015] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Valutazione Candele Pre-Apertura (Ore · Giorni · Settimane · Mesi/Anni)
              </div>
              {computed.multiHorizon && (
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  Allineamento {computed.multiHorizon.alignmentScore}%
                </span>
              )}
            </div>

            {horizonCells.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {horizonCells.map(({ key, title, stat }) => (
                  <div
                    key={key}
                    className="rounded-lg border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#080D16] p-2.5 font-mono tabular-nums"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{title}</span>
                      <span className="font-bold">{key}</span>
                    </div>
                    {stat ? (
                      <>
                        <div
                          className={`mt-1 text-sm font-extrabold ${
                            stat.changePct >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {stat.changePct >= 0 ? "+" : ""}
                          {stat.changePct.toFixed(1)}%
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {stat.trend === "L"
                            ? "Rialzista"
                            : stat.trend === "S"
                            ? "Ribassista"
                            : "Laterale"}{" "}
                          · Pos {stat.rangePosPct}%
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-xs text-slate-400">N/D</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Caricamento stima storica candele 1H / 1D / 1W / 1M…
              </div>
            )}

            <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] space-y-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Tecnica applicata:{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  {computed.technique}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {computed.reasoning}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
            <SectionInfoBar
              compact
              title="Come leggere il Focus Live"
              summary="Monitoraggio ad alta frequenza (1,2s) di prezzo reale, valore della posizione, probabilità dinamica di vittoria e contesto candele pre-apertura."
              details={[
                {
                  heading: "Prezzo Asset vs Valore Posizione",
                  body: "A sinistra vedi la quotazione live della cripto/asset con scostamento percentuale dall'ingresso e spread Bid/Ask. A destra vedi il Costo investito e il Valore attuale (Costo + P&L netto) che sale e scende in tempo reale.",
                },
                {
                  heading: "Grafico 1m & Barra SL → TP",
                  body: "La curva traccia le ultime 24 candele da 1 minuto rispetto alla linea tratteggiata di ingresso. La barra sotto mostra esattamente quanto manca al Take Profit o allo Stop Loss.",
                },
                {
                  heading: "Chiusura immediata",
                  body: "Puoi lasciare la gestione automatica ai Bot oppure cliccare 'Chiudi Posizione Ora' per incassare o tagliare subito la posizione al prezzo di mercato live, registrando automaticamente la lezione.",
                },
              ]}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/[0.07] bg-slate-50/70 dark:bg-[#080D16] flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              onOpenFullChart(target);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
            Apri Grafico Completo
          </button>

          <div className="flex items-center gap-2">
            {computed.isOpen && (
              <button
                type="button"
                disabled={closing}
                onClick={() => void handleCloseAction()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Power className="w-3.5 h-3.5" />
                {closing ? "Chiusura…" : "Chiudi Posizione Ora"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Chiudi Finestra
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
