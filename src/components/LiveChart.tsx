import React, { useMemo, useState } from "react";
import type {
  CandleBar,
  LiveQuote,
  MarketAsset,
  OpenPosition,
  PriceAlert,
  TechnicalAnalysis,
} from "../types/trading";
import { formatPrice } from "../data/markets";

interface LiveChartProps {
  asset: MarketAsset;
  bars: CandleBar[];
  closes: number[];
  quote?: LiveQuote;
  analysis?: TechnicalAnalysis;
  position?: OpenPosition | null;
  alerts?: PriceAlert[];
}

export const LiveChart: React.FC<LiveChartProps> = ({
  asset,
  bars,
  closes,
  quote,
  analysis,
  position,
  alerts = [],
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showIndicators, setShowIndicators] = useState(true);
  const [showFibo, setShowFibo] = useState(true);

  const visibleCount = 90;

  const chartData = useMemo(() => {
    // Prefer OHLC bars if aligned; otherwise synthesize clean line points from closes
    const hasBars = bars.length >= 20;
    const seriesLen = hasBars ? bars.length : closes.length;
    const start = Math.max(0, seriesLen - visibleCount);

    const points = hasBars
      ? bars.slice(start).map((b, idx) => ({
          idx: start + idx,
          ts: b.ts,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }))
      : closes.slice(start).map((c, idx) => ({
          idx: start + idx,
          ts: Date.now() - (closes.length - (start + idx)) * 60000,
          open: c,
          high: c,
          low: c,
          close: c,
        }));

    if (points.length === 0) return null;

    // Align indicator slices to the tail of points
    const e20Offset = Math.max(0, (analysis?.e20Series.length || 0) - points.length);
    const e60Offset = Math.max(0, (analysis?.e60Series.length || 0) - points.length);
    const bbUOffset = Math.max(0, (analysis?.bbUpperSeries.length || 0) - points.length);
    const bbLOffset = Math.max(0, (analysis?.bbLowerSeries.length || 0) - points.length);

    const e20 = analysis?.e20Series.slice(e20Offset) || [];
    const e60 = analysis?.e60Series.slice(e60Offset) || [];
    const bbU = analysis?.bbUpperSeries.slice(bbUOffset) || [];
    const bbL = analysis?.bbLowerSeries.slice(bbLOffset) || [];

    let minP = Infinity;
    let maxP = -Infinity;
    for (const pt of points) {
      if (pt.low < minP) minP = pt.low;
      if (pt.high > maxP) maxP = pt.high;
    }

    if (showIndicators) {
      for (const v of bbU) if (v > maxP) maxP = v;
      for (const v of bbL) if (v < minP) minP = v;
    }

    if (position) {
      const tpPrice =
        position.side === "L"
          ? position.entryPrice * (1 + position.tpPct / 100)
          : position.entryPrice * (1 - position.tpPct / 100);
      const slPrice =
        position.side === "L"
          ? position.entryPrice * (1 + position.slPct / 100)
          : position.entryPrice * (1 - position.slPct / 100);
      minP = Math.min(minP, position.entryPrice, tpPrice, slPrice);
      maxP = Math.max(maxP, position.entryPrice, tpPrice, slPrice);
    }

    const pad = (maxP - minP) * 0.08 || maxP * 0.005 || 1;
    minP -= pad;
    maxP += pad;

    return {
      points,
      hasBars,
      minP,
      maxP,
      e20,
      e60,
      bbU,
      bbL,
    };
  }, [bars, closes, analysis, position, showIndicators]);

  if (!chartData || chartData.points.length < 2) {
    return (
      <div className="h-[290px] flex flex-col items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-sm text-slate-500 dark:text-slate-400">
        <span>Caricamento candele live per {asset.name}…</span>
        <span className="text-xs mt-1 text-slate-400 dark:text-slate-500">
          {asset.okxId ? `Feed OKX ${asset.okxId}` : `Feed Yahoo ${asset.yahooSymbol}`}
        </span>
      </div>
    );
  }

  const width = 760;
  const height = 270;
  const padL = 8;
  const padR = 76;
  const padT = 16;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { points, hasBars, minP, maxP, e20, e60, bbU, bbL } = chartData;
  const rangeP = maxP - minP || 1;

  const toX = (i: number) =>
    padL + (i / Math.max(1, points.length - 1)) * plotW;
  const toY = (p: number) =>
    padT + ((maxP - p) / rangeP) * plotH;

  const buildPath = (arr: number[]) =>
    arr
      .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(" ");

  const priceLinePath = buildPath(points.map((p) => p.close));
  const areaPath =
    priceLinePath +
    ` L${toX(points.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  const lastPt = points[points.length - 1];
  const activePt = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : lastPt;
  const currentMid = quote?.mid || lastPt.close;

  // Fibonacci zone band (0.382 - 0.700)
  let fibTopY: number | null = null;
  let fibBotY: number | null = null;
  if (showFibo && analysis && analysis.hasSwing && analysis.swingHigh > analysis.swingLow) {
    const swRange = analysis.swingHigh - analysis.swingLow;
    const isLong = analysis.direction === "L";
    const lvl382 = isLong
      ? analysis.swingHigh - 0.382 * swRange
      : analysis.swingLow + 0.382 * swRange;
    const lvl700 = isLong
      ? analysis.swingHigh - 0.7 * swRange
      : analysis.swingLow + 0.7 * swRange;
    const yA = toY(Math.max(lvl382, lvl700));
    const yB = toY(Math.min(lvl382, lvl700));
    fibTopY = Math.max(padT, Math.min(padT + plotH, yA));
    fibBotY = Math.max(padT, Math.min(padT + plotH, yB));
  }

  // Position overlay prices
  const posTpPrice = position
    ? position.side === "L"
      ? position.entryPrice * (1 + position.tpPct / 100)
      : position.entryPrice * (1 - position.tpPct / 100)
    : null;
  const posSlPrice = position
    ? position.side === "L"
      ? position.entryPrice * (1 + position.slPct / 100)
      : position.entryPrice * (1 - position.slPct / 100)
    : null;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxP - t * rangeP);
  const candleWidth = Math.max(2, Math.min(6, plotW / points.length - 1.5));

  return (
    <div className="select-none">
      {/* Compact Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span>
            O <strong className="text-slate-800 dark:text-slate-200">{formatPrice(activePt.open)}</strong>
          </span>
          <span>
            H <strong className="text-slate-800 dark:text-slate-200">{formatPrice(activePt.high)}</strong>
          </span>
          <span>
            L <strong className="text-slate-800 dark:text-slate-200">{formatPrice(activePt.low)}</strong>
          </span>
          <span>
            C <strong className="text-slate-800 dark:text-slate-200">{formatPrice(activePt.close)}</strong>
          </span>
          {analysis && !analysis.warmingUp && (
            <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
              · RSI {analysis.rsi14.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowIndicators((v) => !v)}
            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
              showIndicators
                ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            EMA + BB
          </button>
          <button
            type="button"
            onClick={() => setShowFibo((v) => !v)}
            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
              showFibo
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Zona Fibo
          </button>
        </div>
      </div>

      {/* SVG Viewport */}
      <div className="relative rounded-xl border border-slate-200/70 dark:border-white/[0.07] bg-slate-50/75 dark:bg-[#070B13]/85 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px] sm:h-[296px] block"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const norm = Math.max(0, Math.min(1, (relX - padL) / plotW));
            const idx = Math.round(norm * (points.length - 1));
            setHoverIdx(idx);
          }}
        >
          <defs>
            <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines + Price Axis */}
          {yTicks.map((val, i) => {
            const y = toY(val);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200/80 dark:text-slate-800/80"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
                <text
                  x={width - padR + 6}
                  y={y + 3.5}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  className="fill-slate-400 dark:fill-slate-500"
                >
                  {formatPrice(val)}
                </text>
              </g>
            );
          })}

          {/* Fibonacci Retracement Zone */}
          {fibTopY !== null && fibBotY !== null && fibBotY > fibTopY && (
            <g>
              <rect
                x={padL}
                y={fibTopY}
                width={plotW}
                height={fibBotY - fibTopY}
                fill="#F59E0B"
                fillOpacity="0.07"
              />
              <line
                x1={padL}
                y1={fibTopY}
                x2={width - padR}
                y2={fibTopY}
                stroke="#F59E0B"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <line
                x1={padL}
                y1={fibBotY}
                x2={width - padR}
                y2={fibBotY}
                stroke="#F59E0B"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            </g>
          )}

          {/* Bollinger Bands */}
          {showIndicators && bbU.length === points.length && (
            <>
              <path
                d={buildPath(bbU)}
                fill="none"
                stroke="#64748B"
                strokeOpacity="0.3"
                strokeWidth="1"
              />
              <path
                d={buildPath(bbL)}
                fill="none"
                stroke="#64748B"
                strokeOpacity="0.3"
                strokeWidth="1"
              />
            </>
          )}

          {/* Area under line when no candlesticks or subtle line */}
          {!hasBars && <path d={areaPath} fill="url(#priceAreaGrad)" />}

          {/* Candlesticks or Close Line */}
          {hasBars ? (
            points.map((pt, i) => {
              const x = toX(i);
              const isUp = pt.close >= pt.open;
              const color = isUp ? "#16A34A" : "#DC2626";
              const yOpen = toY(pt.open);
              const yClose = toY(pt.close);
              const yHigh = toY(pt.high);
              const yLow = toY(pt.low);
              const bodyTop = Math.min(yOpen, yClose);
              const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
              return (
                <g key={pt.ts + "-" + i}>
                  <line
                    x1={x}
                    y1={yHigh}
                    x2={x}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="1"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyH}
                    fill={color}
                    rx="0.5"
                  />
                </g>
              );
            })
          ) : (
            <path d={priceLinePath} fill="none" stroke="#2563EB" strokeWidth="1.75" />
          )}

          {/* EMA 20 & EMA 60 */}
          {showIndicators && e60.length === points.length && (
            <path
              d={buildPath(e60)}
              fill="none"
              stroke="#6366F1"
              strokeWidth="1.25"
              strokeOpacity="0.85"
            />
          )}
          {showIndicators && e20.length === points.length && (
            <path
              d={buildPath(e20)}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1.35"
              strokeOpacity="0.9"
            />
          )}

          {/* Active Position Entry / TP / SL Markers */}
          {position && (
            <g>
              {posTpPrice !== null && (
                <>
                  <line
                    x1={padL}
                    y1={toY(posTpPrice)}
                    x2={width - padR}
                    y2={toY(posTpPrice)}
                    stroke="#16A34A"
                    strokeWidth="1.2"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={padL + 6}
                    y={toY(posTpPrice) - 4}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fill="#16A34A"
                    fontWeight="600"
                  >
                    TP {formatPrice(posTpPrice)}
                  </text>
                </>
              )}
              <line
                x1={padL}
                y1={toY(position.entryPrice)}
                x2={width - padR}
                y2={toY(position.entryPrice)}
                stroke="#3B82F6"
                strokeWidth="1.3"
              />
              <text
                x={padL + 6}
                y={toY(position.entryPrice) - 4}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#3B82F6"
                fontWeight="600"
              >
                ENTRY {formatPrice(position.entryPrice)}
              </text>
              {posSlPrice !== null && (
                <>
                  <line
                    x1={padL}
                    y1={toY(posSlPrice)}
                    x2={width - padR}
                    y2={toY(posSlPrice)}
                    stroke="#DC2626"
                    strokeWidth="1.2"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={padL + 6}
                    y={toY(posSlPrice) + 11}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fill="#DC2626"
                    fontWeight="600"
                  >
                    {position.breakEvenProtected ? "SL PROTETTO " : "SL "}
                    {formatPrice(posSlPrice)}
                  </text>
                </>
              )}
            </g>
          )}

          {/* Active Price Alert Threshold Lines */}
          {alerts
            .filter(
              (a) =>
                a.enabled &&
                !a.triggeredAt &&
                a.targetPrice >= minP &&
                a.targetPrice <= maxP
            )
            .map((al) => {
              const y = toY(al.targetPrice);
              const color = al.condition === "above" ? "#F59E0B" : "#A855F7";
              return (
                <g key={al.id}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={width - padR}
                    y2={y}
                    stroke={color}
                    strokeWidth="1.25"
                    strokeDasharray="5 3"
                    strokeOpacity="0.85"
                  />
                  <text
                    x={width - padR - 6}
                    y={y - 4}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fill={color}
                    fontWeight="700"
                  >
                    ALLARME {al.condition === "above" ? "≥" : "≤"}{" "}
                    {formatPrice(al.targetPrice)}
                  </text>
                </g>
              );
            })}

          {/* Current Live Price Line & Tag */}
          {currentMid >= minP && currentMid <= maxP && (
            <g>
              <line
                x1={padL}
                y1={toY(currentMid)}
                x2={width - padR}
                y2={toY(currentMid)}
                stroke="#2563EB"
                strokeOpacity="0.5"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <rect
                x={width - padR + 2}
                y={toY(currentMid) - 9}
                width={padR - 4}
                height={18}
                rx="3"
                fill="#2563EB"
              />
              <text
                x={width - padR + 6}
                y={toY(currentMid) + 3.5}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#FFFFFF"
                fontWeight="600"
              >
                {formatPrice(currentMid)}
              </text>
            </g>
          )}

          {/* Hover Crosshair */}
          {hoverIdx !== null && points[hoverIdx] && (
            <g>
              <line
                x1={toX(hoverIdx)}
                y1={padT}
                x2={toX(hoverIdx)}
                y2={padT + plotH}
                stroke="currentColor"
                className="text-slate-400/50 dark:text-slate-500/50"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <circle
                cx={toX(hoverIdx)}
                cy={toY(points[hoverIdx].close)}
                r="3.5"
                fill="#2563EB"
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Legend Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-amber-500 inline-block" /> EMA 20
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-indigo-500 inline-block" /> EMA 60
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2 bg-amber-500/20 border border-amber-500/40 inline-block" /> Fibo 0.382–0.70
            </span>
            {alerts.filter((a) => a.enabled && !a.triggeredAt).length > 0 && (
              <span className="font-mono text-amber-600 dark:text-amber-400">
                Allarmi: {alerts
                  .filter((a) => a.enabled && !a.triggeredAt)
                  .slice(0, 2)
                  .map((a) => `${a.condition === "above" ? "≥" : "≤"}${formatPrice(a.targetPrice)}`)
                  .join(" · ")}
              </span>
            )}
          </div>
          <span className="font-mono tabular-nums">
            Timeframe 1m · {points.length} barre
          </span>
        </div>
      </div>
    </div>
  );
};
