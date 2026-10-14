// Ported from ST Quant (okxtradingagent/src/indicators.js) on 14 Oct 2026.
// The trading logic is unchanged; Presage-specific edits are marked "Presage:".

// Core indicators for ST Quant. Candles are {ts, o, h, l, c, v} oldest-first.

export function typicalPrice(k) {
  return (k.h + k.l + k.c) / 3;
}

// Money Flow Index — the strategy's primary trigger.
export function mfi(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const out = new Array(candles.length).fill(null);
  for (let i = period; i < candles.length; i++) {
    let pos = 0, neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = typicalPrice(candles[j]);
      const prevTp = typicalPrice(candles[j - 1]);
      const flow = tp * candles[j].v;
      if (tp > prevTp) pos += flow;
      else if (tp < prevTp) neg += flow;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const k = candles[i];
    trs.push(Math.max(k.h - k.l, Math.abs(k.h - prev.c), Math.abs(k.l - prev.c)));
  }
  // Wilder smoothing
  let a = trs.slice(0, period).reduce((s, x) => s + x, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

export function ema(candles, period) {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let e = candles.slice(0, period).reduce((s, c) => s + c.c, 0) / period;
  for (let i = period; i < candles.length; i++) e = candles[i].c * k + e * (1 - k);
  return e;
}

export function sma(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((s, x) => s + x, 0) / period;
}

// Swing highs/lows with a lookback wing (fractal pivots).
export function swings(candles, wing = 3) {
  const highs = [], lows = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let isHigh = true, isLow = true;
    for (let w = 1; w <= wing; w++) {
      if (candles[i].h < candles[i - w].h || candles[i].h < candles[i + w].h) isHigh = false;
      if (candles[i].l > candles[i - w].l || candles[i].l > candles[i + w].l) isLow = false;
    }
    if (isHigh) highs.push({ i, ts: candles[i].ts, price: candles[i].h });
    if (isLow) lows.push({ i, ts: candles[i].ts, price: candles[i].l });
  }
  return { highs, lows };
}

// Fit a descending resistance line through the two most recent lower swing-highs
// (or ascending support through higher swing-lows). Returns value at index x.
export function trendline(pivots, direction /* 'down' | 'up' */) {
  if (pivots.length < 2) return null;
  const pts = pivots.slice(-4); // recent pivots matter
  let best = null;
  for (let a = 0; a < pts.length - 1; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const slope = (pts[b].price - pts[a].price) / (pts[b].i - pts[a].i);
      if (direction === 'down' && slope >= 0) continue;
      if (direction === 'up' && slope <= 0) continue;
      best = { slope, anchor: pts[b] }; // latest qualifying pair wins
    }
  }
  if (!best) return null;
  return (atIndex) => best.anchor.price + best.slope * (atIndex - best.anchor.i);
}

// Volume confirmation: last bar's volume vs 20-bar average.
export function volumeSpike(candles, mult = 1.5, lookback = 20) {
  if (candles.length < lookback + 1) return false;
  const recent = candles.slice(-(lookback + 1), -1);
  const avg = recent.reduce((s, k) => s + k.v, 0) / recent.length;
  return candles.at(-1).v >= mult * avg;
}

// Bullish reversal on the confirmation timeframe:
// close above prior high, or bullish engulfing.
export function bullishReversal(candles) {
  if (candles.length < 2) return false;
  const [prev, last] = candles.slice(-2);
  const engulfing = last.c > last.o && prev.c < prev.o && last.c > prev.o && last.o < prev.c;
  const breakHigh = last.c > prev.h;
  return engulfing || breakHigh;
}

// Bullish divergence: price makes a LOWER low while MFI makes a HIGHER low.
//
// This is the fix for the weakest part of a pure "MFI is low" trigger — MFI can
// sit at an extreme simply because nobody is trading, which is not the same as
// buyers absorbing supply. Divergence is evidence of absorption: sellers pushed
// price lower and could not push money-flow lower with it.
export function bullishDivergence(candles, { lookback = 60, wing = 2, minGapBars = 4 } = {}) {
  if (candles.length < lookback) return null;
  const win = candles.slice(-lookback);
  const series = mfi(win);
  if (!series) return null;

  // Pivot lows in price within the window.
  const pivots = [];
  for (let i = wing; i < win.length - wing; i++) {
    let isLow = true;
    for (let w = 1; w <= wing; w++) {
      if (win[i].l > win[i - w].l || win[i].l > win[i + w].l) { isLow = false; break; }
    }
    if (isLow && series[i] != null) pivots.push({ i, price: win[i].l, mfi: series[i] });
  }
  if (pivots.length < 2) return null;

  const last = pivots.at(-1);
  // Compare against the most recent prior pivot that is far enough away to be
  // a distinct swing rather than the same low re-counted.
  const prior = [...pivots].reverse().find(p => last.i - p.i >= minGapBars);
  if (!prior) return null;

  const priceLower = last.price < prior.price;
  const mfiHigher = last.mfi > prior.mfi;
  return {
    diverging: priceLower && mfiHigher,
    priceChangePct: Number((((last.price - prior.price) / prior.price) * 100).toFixed(2)),
    mfiChange: Number((last.mfi - prior.mfi).toFixed(1)),
    barsAgo: win.length - 1 - last.i,
  };
}

// A hug is a wick touch that the BODY respects — price dipped to the line and
// closed back above it. A body close below is a break, not a hug.
export function hugsLine(candle, lineValue, { breakTolerance = 0.012 } = {}) {
  if (!(lineValue > 0)) return null;
  const bodyLow = Math.min(candle.o, candle.c);
  const touched = candle.l <= lineValue * 1.002;
  const bodyAbove = bodyLow >= lineValue * (1 - 0.002);
  const brokenBy = (lineValue - candle.c) / lineValue;
  return {
    hugging: touched && bodyAbove,
    broken: brokenBy > breakTolerance,
    closeVsLinePct: Number((((candle.c - lineValue) / lineValue) * 100).toFixed(2)),
  };
}
