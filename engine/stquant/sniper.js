// Ported from ST Quant (okxtradingagent/src/sniper.js) on 14 Oct 2026.
// The trading logic is unchanged; Called-specific edits are marked "Called:".

// Sniper entry detector — Shariq's final synthesis of the method:
//
//   "Most of the time when MFI drops to its LEAST LOW, from there it stops and
//    tries to pull back. Sniper entry — but only if there's a support there.
//    Maybe the uptrend support line, rising or falling — there should be SOME
//    support. It should, on every timeframe, draw the key areas of support,
//    even of patterns or basic support."
//
// Two things matter and both must be true:
//   1. MFI at a local EXTREME (not merely "below 20" — the lowest it has been
//      in recent memory, because that is where it stops and reverses).
//   2. Price sitting at SOME kind of support — rising trendline, falling
//      channel support, pattern boundary, or a plain horizontal level.
//
// It is a waiting game: most scans produce nothing, and that is correct.

import { mfi, atr, bullishDivergence, hugsLine } from './indicators.js';
import { ord } from './indicators.js';
import { supportZones, fitBoundary } from './structure.js';

export const SNIPER = {
  extremePercentile: 0.12,   // MFI in the bottom 12% of its recent range
  extremeLookback: 100,      // "recent memory" in bars
  supportTolerance: 0.025,   // price within 2.5% of a support to count as "at" it
  hugTolerance: 0.01,        // within 1% = hugging the line
  m15Weight: 3,              // 15m is the primary trigger ("mainly at 15 min")
  h1Weight: 2,
  minSupports: 1,            // at least one support of any kind must be present
  minAtrPct: 0.004,
  // Divergence is not required, but it is the difference between "MFI is low
  // because buyers are absorbing" and "MFI is low because nobody is trading".
  divergenceBonus: 3,
  requireBodyRespectsLine: true,
};

// How extreme is the latest MFI relative to its own recent history?
// Returns { value, percentile, isExtreme } — percentile 0 = lowest in lookback.
export function mfiExtreme(candles, lookback = SNIPER.extremeLookback) {
  const series = mfi(candles);
  if (!series) return null;
  const vals = series.filter(v => v != null);
  if (vals.length < 20) return null;
  const recent = vals.slice(-lookback);
  const cur = vals.at(-1);
  const below = recent.filter(v => v < cur).length;
  const percentile = below / recent.length;
  return {
    value: Number(cur.toFixed(1)),
    percentile: Number(percentile.toFixed(3)),
    isExtreme: percentile <= SNIPER.extremePercentile,
    min: Number(Math.min(...recent).toFixed(1)),
    // Has it started to curl up off the low?
    turningUp: vals.length >= 3 && cur > vals.at(-2) && vals.at(-2) <= vals.at(-3),
  };
}

// Every kind of support Shariq recognises, on one timeframe.
export function keySupports(candles) {
  const out = [];
  const price = candles.at(-1).c;

  // 1. Horizontal memory levels (respected more than once).
  for (const z of supportZones(candles).filter(z => z.touches >= 2)) {
    if (z.price > price * 1.005) continue;       // must be at/below price
    out.push({ type: 'horizontal', price: z.price, strength: z.touches });
  }
  // 2. Trendline support — rising OR falling, both count as structure.
  const lo = fitBoundary(candles, 'lower');
  if (lo) {
    const v = lo.valueAt(candles.length - 1);
    if (v > 0) out.push({ type: `trendline-${lo.direction}`, price: v, strength: lo.touches });
  }
  // 3. Pattern boundary: the lower edge of a converging range (wedge/triangle),
  //    which is support even when the overall trend is down.
  const up = fitBoundary(candles, 'upper');
  if (lo && up) {
    const gapNow = up.valueAt(candles.length - 1) - lo.valueAt(candles.length - 1);
    const gapThen = up.valueAt(0) - lo.valueAt(0);
    if (gapNow > 0 && gapThen > gapNow * 1.25) {
      out.push({ type: 'pattern-apex', price: lo.valueAt(candles.length - 1), strength: Math.max(lo.touches, up.touches) });
    }
  }
  return out
    .filter(s => s.price > 0 && s.price <= price * 1.005)
    .sort((a, b) => b.price - a.price);   // nearest below price first
}

// Full multi-timeframe support map — "on every timeframe draw the key areas".
export function supportMap(frames) {
  const map = {};
  // Windows are long on purpose: a trendline the trader draws is anchored weeks
  // back. Fitting 15m over only 120 bars (~30h) found the line 5 touches deep;
  // over 299 bars it finds the same line with 7 touches, matching what he draws.
  for (const [tf, arr, bars] of [
    ['1D', frames.d1, 240], ['4H', frames.h4, 299],
    ['1H', frames.h1, 299], ['15m', frames.m15, 299],
  ]) {
    if (!arr?.length) continue;
    map[tf] = keySupports(arr.slice(-bars));
  }
  return map;
}

// The sniper trigger.
export function sniperSignal(frames) {
  const price = frames.m15.at(-1).c;
  const a = atr(frames.m15);
  if (!a || a / price < SNIPER.minAtrPct) {
    return { fire: false, reason: 'too quiet to cover costs' };
  }

  const x15 = mfiExtreme(frames.m15);
  const x1h = mfiExtreme(frames.h1);
  if (!x15) return { fire: false, reason: 'insufficient data' };

  const map = supportMap(frames);
  // Which supports is price actually sitting on, across ALL timeframes?
  const at = [];
  for (const [tf, list] of Object.entries(map)) {
    for (const s of list) {
      const dist = (price - s.price) / price;
      if (dist >= -SNIPER.hugTolerance && dist <= SNIPER.supportTolerance) {
        at.push({ tf, ...s, distPct: Number((dist * 100).toFixed(2)) });
      }
    }
  }

  const notes = [];
  let score = 0;

  // Absorption evidence: price pushed to a lower low, money-flow would not follow.
  const div15 = bullishDivergence(frames.m15);
  const div1h = bullishDivergence(frames.h1);
  if (div15?.diverging) { score += SNIPER.divergenceBonus; notes.push(`15m bullish divergence (price ${div15.priceChangePct}%, MFI +${div15.mfiChange})`); }
  if (div1h?.diverging) { score += 2; notes.push(`1H bullish divergence (price ${div1h.priceChangePct}%, MFI +${div1h.mfiChange})`); }
  if (x15.isExtreme) { score += SNIPER.m15Weight; notes.push(`15m MFI ${x15.value} at ${ord(Math.round(x15.percentile * 100))} pct (low ${x15.min})`); }
  if (x15.turningUp) { score += 1; notes.push('15m MFI curling up off the low'); }
  if (x1h?.isExtreme) { score += SNIPER.h1Weight; notes.push(`1H MFI ${x1h.value} at ${ord(Math.round(x1h.percentile * 100))} pct`); }
  else if (x1h && x1h.percentile <= 0.3) { score += 1; notes.push(`1H MFI low-ish (${x1h.value})`); }

  // A trendline "hug" requires the BODY to respect the line, not just a wick
  // poking through it. A body close below is a break, and breaks are vetoes.
  let lineBroken = null;
  for (const s2 of at) {
    if (!s2.type.startsWith('trendline') && s2.type !== 'pattern-apex') continue;
    const h = hugsLine(frames.m15.at(-1), s2.price);
    if (!h) continue;
    if (h.broken) { lineBroken = { ...s2, closeVsLinePct: h.closeVsLinePct }; break; }
    if (h.hugging) { score += 2; notes.push(`${s2.tf} body respects the line (close ${h.closeVsLinePct}% vs line)`); }
  }
  if (lineBroken) {
    return {
      fire: false, score, notes,
      reason: `${lineBroken.tf} ${lineBroken.type} broken — 15m closed ${lineBroken.closeVsLinePct}% below it`,
      supports: at, supportMap: map, price, mfi15: x15, mfi1h: x1h,
    };
  }

  if (at.length) {
    const best = at.sort((p, q) => q.strength - p.strength)[0];
    score += Math.min(3, best.strength);
    notes.push(`at ${best.tf} ${best.type} ${best.price.toPrecision(5)} (${best.distPct}%, ${best.strength} touches)`);
    if (at.length > 1) { score += 1; notes.push(`${at.length} supports stacked across timeframes`); }
  }

  // Both conditions are mandatory: extreme MFI AND some support present.
  const fire = x15.isExtreme && at.length >= SNIPER.minSupports;

  const nearest = at.sort((p, q) => q.price - p.price)[0];
  const stop = nearest ? Math.min(nearest.price * (1 - 0.006), price - 2 * a) : price - 2 * a;

  return {
    fire, score, notes,
    divergence: { m15: div15?.diverging ?? false, h1: div1h?.diverging ?? false },
    mfi15: x15, mfi1h: x1h,
    supports: at,
    supportMap: map,
    price,
    stop,
    reason: fire ? 'sniper: MFI extreme at support'
      : !x15.isExtreme ? `15m MFI not extreme (${x15.value}, ${ord(Math.round(x15.percentile * 100))} pct)`
      : 'no support at this price',
  };
}
