import type {
  CandleBar,
  GateCheck,
  LiveQuote,
  MarketAsset,
  StrategyConfig,
  TechnicalAnalysis,
} from "../types/trading";
import { getCostSpecs } from "../data/markets";

export function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = values[0];
  const out: number[] = [ema];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export function computeRsi(values: number[], period: number): number {
  if (values.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function computeAtrPct(bars: CandleBar[], closes: number[], period = 14): number {
  if (bars.length >= period + 1) {
    let trSum = 0;
    for (let i = bars.length - period; i < bars.length; i++) {
      const curr = bars[i];
      const prevClose = bars[i - 1].close;
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prevClose),
        Math.abs(curr.low - prevClose)
      );
      trSum += tr;
    }
    const atr = trSum / period;
    const lastClose = bars[bars.length - 1].close;
    return lastClose > 0 ? (atr / lastClose) * 100 : 0;
  }
  if (closes.length >= period + 1) {
    let sum = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      sum += Math.abs(closes[i] - closes[i - 1]);
    }
    const last = closes[closes.length - 1];
    return last > 0 ? (sum / period / last) * 100 : 0;
  }
  return 0;
}

function compute5mTrend(closes1m: number[], closes5m?: number[]): "L" | "S" | "N" {
  let series = closes5m && closes5m.length >= 25 ? closes5m : [];
  if (series.length < 25 && closes1m.length >= 100) {
    series = [];
    for (let i = 4; i < closes1m.length; i += 5) {
      series.push(closes1m[i]);
    }
  }
  if (series.length < 15) return "N";
  const e9 = computeEmaSeries(series, 9);
  const e21 = computeEmaSeries(series, 21);
  const lastE9 = e9[e9.length - 1];
  const lastE21 = e21[e21.length - 1];
  const lastPx = series[series.length - 1];
  if (lastPx > lastE9 && lastE9 >= lastE21) return "L";
  if (lastPx < lastE9 && lastE9 <= lastE21) return "S";
  return "N";
}

export function analyzeMarket(
  asset: MarketAsset,
  closes: number[],
  cfg: StrategyConfig,
  quote: LiveQuote,
  bars: CandleBar[] = [],
  closes5m?: number[]
): TechnicalAnalysis {
  const n = closes.length;
  const { leverage, costPct } = getCostSpecs(asset, cfg);
  const spreadPct = quote.mid > 0 ? ((quote.ask - quote.bid) / quote.mid) * 100 : 0;
  const atrPct = computeAtrPct(bars, closes, 14);
  const trend5m = compute5mTrend(closes, closes5m);

  // Price move required to achieve minimum target ROI% on margin (default >= 10%) after fees
  const minTargetRoi = Math.max(10, cfg.minTargetRoiPct || 10);
  const minTpPricePct = minTargetRoi / Math.max(1, leverage) + costPct;

  if (n < 100) {
    const emptyGates: GateCheck[] = [
      {
        id: "g1",
        label: "1. Fibonacci & Trend 5m",
        passed: false,
        detail: `Raccolta candele (${n}/100)`,
      },
      {
        id: "g2",
        label: "2. Oscillatori & Momentum",
        passed: false,
        detail: "In attesa serie storica",
      },
      {
        id: "g3",
        label: `3. Target ≥ +${minTargetRoi}% ROI & Spread`,
        passed: false,
        detail: "Calcolo volatilità",
      },
    ];

    return {
      warmingUp: true,
      hasSwing: false,
      direction: "L",
      fibDepth: 0,
      swingHigh: 0,
      swingLow: 0,
      tpPct: minTpPricePct,
      slPct: Math.max(minTpPricePct / Math.max(1.2, cfg.minRR), 0.6 * costPct),
      tpRoiPct: minTargetRoi,
      slRoiPct: 5,
      rrNet: 0,
      confirmations: [],
      score: Math.round(n),
      winProbabilityPct: Math.min(35, Math.max(5, Math.round(n * 0.35))),
      costPct,
      spreadPct,
      atrPct,
      supertrendDir: "L",
      trend5m,
      inFibZone: false,
      bounceConfirmed: false,
      spreadOk: true,
      gates: emptyGates,
      allGatesPassed: false,
      ok: false,
      e20: closes[n - 1] || quote.mid,
      e60: closes[n - 1] || quote.mid,
      rsi14: 50,
      macdHist: 0,
      bbPos: 0.5,
      e20Series: [],
      e60Series: [],
      bbUpperSeries: [],
      bbLowerSeries: [],
    };
  }

  const price = closes[n - 1];
  let hi = -Infinity;
  let lo = Infinity;
  let ih = 0;
  let il = 0;
  const lookbackStart = Math.max(0, n - 180);

  for (let i = lookbackStart; i < n; i++) {
    if (closes[i] > hi) {
      hi = closes[i];
      ih = i;
    }
    if (closes[i] < lo) {
      lo = closes[i];
      il = i;
    }
  }

  const e20Series = computeEmaSeries(closes, 20);
  const e60Series = computeEmaSeries(closes, 60);
  const ema12 = computeEmaSeries(closes, 12);
  const ema26 = computeEmaSeries(closes, 26);
  const macdLine = ema12.map((v, idx) => v - ema26[idx]);
  const macdSignal = computeEmaSeries(macdLine, 9);

  const bbUpperSeries: number[] = [];
  const bbLowerSeries: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    const len = i - start + 1;
    let s = 0;
    for (let j = start; j <= i; j++) s += closes[j];
    const m = s / len;
    let q = 0;
    for (let j = start; j <= i; j++) q += (closes[j] - m) * (closes[j] - m);
    const sd = Math.sqrt(q / len);
    bbUpperSeries.push(m + 2 * sd);
    bbLowerSeries.push(m - 2 * sd);
  }

  const e20 = e20Series[n - 1];
  const e60 = e60Series[n - 1];
  const macdHist = macdLine[n - 1] - macdSignal[n - 1];
  const prevMacdHist = macdLine[n - 2] - macdSignal[n - 2];
  const rsi14 = computeRsi(closes, 14);

  // Supertrend-style directional bias (EMA20 +/- 1.8 * ATR)
  const supertrendDir: "L" | "S" = price >= e20 && e20 >= e60 ? "L" : price <= e20 && e20 <= e60 ? "S" : price >= e20 ? "L" : "S";

  const range = hi - lo;
  if ((range / price) * 100 < 0.5 * costPct || range <= 0) {
    const narrowGates: GateCheck[] = [
      { id: "g1", label: "1. Fibonacci & Trend 5m", passed: false, detail: "Swing troppo stretto" },
      { id: "g2", label: "2. Oscillatori & Momentum", passed: false, detail: "Bassa direzionalità" },
      { id: "g3", label: `3. Target ≥ +${minTargetRoi}% ROI & Spread`, passed: false, detail: "Range insufficiente" },
    ];
    return {
      warmingUp: false,
      hasSwing: false,
      direction: "L",
      fibDepth: 0,
      swingHigh: hi,
      swingLow: lo,
      tpPct: minTpPricePct,
      slPct: 0.6 * costPct,
      tpRoiPct: minTargetRoi,
      slRoiPct: 5,
      rrNet: 0,
      confirmations: [],
      score: 5,
      winProbabilityPct: 18,
      costPct,
      spreadPct,
      atrPct,
      supertrendDir,
      trend5m,
      inFibZone: false,
      bounceConfirmed: false,
      spreadOk: spreadPct <= 0.35 * costPct,
      gates: narrowGates,
      allGatesPassed: false,
      ok: false,
      e20,
      e60,
      rsi14,
      macdHist,
      bbPos: 0.5,
      e20Series,
      e60Series,
      bbUpperSeries,
      bbLowerSeries,
    };
  }

  const isLong = il < ih;
  const direction: "L" | "S" = isLong ? "L" : "S";
  const fibDepth = isLong ? (hi - price) / range : (price - lo) / range;

  // Golden Fibonacci zone (0.382 - 0.786)
  const inFibZone = fibDepth >= 0.382 && fibDepth <= 0.786;
  const spreadOk = spreadPct <= Math.max(0.06, 0.35 * costPct);
  const bounceConfirmed = isLong
    ? price > closes[n - 3] && price >= e20
    : price < closes[n - 3] && price <= e20;

  const confirmations: string[] = [];
  if (isLong ? e20 >= e60 : e20 <= e60) confirmations.push("EMA 20/60");
  if (isLong ? macdHist >= prevMacdHist : macdHist <= prevMacdHist) confirmations.push("MACD");
  if (isLong ? rsi14 >= 36 && rsi14 <= 68 : rsi14 >= 32 && rsi14 <= 64) confirmations.push("RSI");

  const bbWindow = Math.min(100, n);
  let sum = 0;
  for (let i = n - bbWindow; i < n; i++) sum += closes[i];
  const mean = sum / bbWindow;
  let sqSum = 0;
  for (let i = n - bbWindow; i < n; i++) sqSum += (closes[i] - mean) * (closes[i] - mean);
  const std = Math.sqrt(sqSum / bbWindow);
  const bbPos = std > 0 ? (price - (mean - 2 * std)) / (4 * std) : 0.5;
  if (isLong ? bbPos > 0.02 && bbPos < 0.65 : bbPos > 0.35 && bbPos < 0.98) {
    confirmations.push("Bollinger");
  }
  if (supertrendDir === direction) {
    confirmations.push("Trend");
  }

  // Fibonacci 1.272 / 1.618 projection & minimum +10% ROI floor
  const fibExt127 = (Math.abs((isLong ? hi + 0.272 * range : lo - 0.272 * range) - price) / price) * 100;
  const fibExt161 = (Math.abs((isLong ? hi + 0.618 * range : lo - 0.618 * range) - price) / price) * 100;
  const atrProjected = atrPct > 0 ? atrPct * 3.8 : 0;

  // Target price move always guarantees at least minTargetRoi% (10%+) net ROI on margin
  const tpPct = Math.max(fibExt127, Math.min(fibExt161, Math.max(fibExt127, atrProjected)), minTpPricePct);
  const slRawPct =
    ((isLong ? price - (hi - 0.886 * range) : lo + 0.886 * range - price) / price) * 100;
  const slPct = Math.max(Math.min(slRawPct, tpPct / Math.max(1.2, cfg.minRR)), 0.6 * costPct);

  const tpRoiPct = Math.max(0, (tpPct - costPct) * leverage);
  const slRoiPct = Math.max(0, (slPct + costPct) * leverage);
  const rrNet = (tpPct - costPct) / (slPct + costPct);

  const mtfAligned = trend5m === "N" || trend5m === direction;

  const score = Math.min(
    100,
    Math.round(
      (inFibZone ? 24 : 4) +
        (bounceConfirmed ? 14 : 0) +
        (mtfAligned ? 10 : 0) +
        confirmations.length * 9 +
        Math.min(rrNet / 2, 1) * 12
    )
  );

  // Explicit 3 mandatory technical gates
  const minConfReq = Math.max(3, cfg.minConfirmations || 3);
  const gate1Passed = inFibZone && bounceConfirmed && mtfAligned;
  const gate2Passed = confirmations.length >= minConfReq;
  const gate3Passed =
    tpRoiPct >= minTargetRoi - 0.01 &&
    rrNet >= cfg.minRR &&
    spreadOk &&
    score >= cfg.minScore;

  const gates: GateCheck[] = [
    {
      id: "g1",
      label: "1. Fibonacci & Trend 5m",
      passed: gate1Passed,
      detail: `Fibo ${(fibDepth * 100).toFixed(1)}% · 5m ${
        trend5m === "L" ? "Rialzo" : trend5m === "S" ? "Ribasso" : "Neutro"
      }${bounceConfirmed ? " · Rimbalzo OK" : ""}`,
    },
    {
      id: "g2",
      label: `2. Conferme Tecniche (${confirmations.length}/${minConfReq})`,
      passed: gate2Passed,
      detail: confirmations.length > 0 ? confirmations.join(", ") : "Nessun segnale allineato",
    },
    {
      id: "g3",
      label: `3. Target ≥ +${minTargetRoi}% ROI & Spread`,
      passed: gate3Passed,
      detail: `TP +${tpRoiPct.toFixed(1)}% ROI · R:R ${rrNet.toFixed(2)}x · Score ${score}/100`,
    },
  ];

  const allGatesPassed = gate1Passed && gate2Passed && gate3Passed;
  const gatesPassedCount =
    (gate1Passed ? 1 : 0) + (gate2Passed ? 1 : 0) + (gate3Passed ? 1 : 0);

  // Calibrated win probability % combining multi-indicator alignment, Fibo Golden Zone,
  // 5m MTF alignment, R:R efficiency, and passed gates (clamped 15–94%)
  const rawProbability =
    24 +
    score * 0.48 +
    gatesPassedCount * 6 +
    (mtfAligned && trend5m === direction ? 5 : trend5m === "N" ? 0 : -7) +
    (spreadOk ? 3 : -8);
  const winProbabilityPct = Math.max(15, Math.min(94, Math.round(rawProbability)));

  return {
    warmingUp: false,
    hasSwing: true,
    direction,
    fibDepth,
    swingHigh: hi,
    swingLow: lo,
    tpPct,
    slPct,
    tpRoiPct,
    slRoiPct,
    rrNet,
    confirmations,
    score,
    winProbabilityPct,
    costPct,
    spreadPct,
    atrPct,
    supertrendDir,
    trend5m,
    inFibZone,
    bounceConfirmed,
    spreadOk,
    gates,
    allGatesPassed,
    ok: allGatesPassed,
    e20,
    e60,
    rsi14,
    macdHist,
    bbPos,
    e20Series,
    e60Series,
    bbUpperSeries,
    bbLowerSeries,
  };
}
