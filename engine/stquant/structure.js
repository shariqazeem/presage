// Ported from ST Quant (okxtradingagent/src/structure.js) on 14 Oct 2026.
// The trading logic is unchanged; Called-specific edits are marked "Called:".

// Structure mapping: the "memory levels" from Shariq's methodology.
// 1D macro trendline -> long-term TP. 4H channel -> trade zone.
// First rejection point = tip of last major pump candle.

import { swings, trendline } from './indicators.js';

// Cluster swing lows into horizontal support zones (within tol %).
export function supportZones(candles, tol = 0.015) {
  const { lows } = swings(candles, 3);
  const zones = [];
  for (const lo of lows) {
    const zone = zones.find(z => Math.abs(z.price - lo.price) / z.price <= tol);
    if (zone) {
      zone.touches++;
      zone.price = (zone.price * (zone.touches - 1) + lo.price) / zone.touches;
      zone.lastTouch = lo.ts;
    } else {
      zones.push({ price: lo.price, touches: 1, lastTouch: lo.ts });
    }
  }
  // Respected zones (2+ touches) rank higher.
  return zones.sort((a, b) => b.touches - a.touches);
}

export function resistanceZones(candles, tol = 0.015) {
  const { highs } = swings(candles, 3);
  const zones = [];
  for (const hi of highs) {
    const zone = zones.find(z => Math.abs(z.price - hi.price) / z.price <= tol);
    if (zone) {
      zone.touches++;
      zone.price = (zone.price * (zone.touches - 1) + hi.price) / zone.touches;
    } else {
      zones.push({ price: hi.price, touches: 1 });
    }
  }
  return zones.sort((a, b) => b.touches - a.touches);
}

// First rejection point: high of the largest-range bullish candle in the window.
export function firstRejectionPoint(candles, window = 120) {
  const slice = candles.slice(-window);
  let best = null;
  for (const k of slice) {
    const range = k.h - k.l;
    if (k.c > k.o && (!best || range > best.range)) best = { range, price: k.h, ts: k.ts };
  }
  return best?.price ?? null;
}

// Full structure map for a token across timeframes.
export function mapStructure({ d1, h4 }) {
  const { highs: d1Highs } = swings(d1, 3);
  const { highs: h4Highs, lows: h4Lows } = swings(h4, 3);

  const macroResistLine = trendline(d1Highs, 'down'); // long-term TP line
  const channelResistLine = trendline(h4Highs, 'down');
  const channelSupportLine = trendline(h4Lows, 'down') || trendline(h4Lows, 'up');

  const lastIdx = h4.length - 1;
  return {
    macroTp: macroResistLine ? macroResistLine(d1.length - 1) : null,
    channelResistance: channelResistLine ? channelResistLine(lastIdx) : null,
    channelSupport: channelSupportLine ? channelSupportLine(lastIdx) : null,
    supports: supportZones(h4),
    resistances: resistanceZones(h4),
    firstRejection: firstRejectionPoint(h4),
  };
}

// Fit a boundary trendline the way a trader draws one: pick the pair of swing
// pivots whose connecting line the most OTHER pivots touch, while never being
// meaningfully violated by price. 'lower' = support beneath price,
// 'upper' = resistance above. Returns index-space slope/intercept so the
// renderer can extend it to the right edge.
// --- shelves: levels price RESTED on, not just bounced off -----------------
//
// supportZones/resistanceZones are built from pivot touches, so a price band
// that the market simply sat in for days is invisible to them. That is how the
// agent looked at BLESS and reported its nearest support 12% away while a shelf
// it had been consolidating on sat ~2% below. Shariq reads those: "I remember
// which price range is good and last time from there it pumped."
//
// A shelf is a price band where an unusual share of recent closes clustered.
export function shelves(candles, { bins = 40, minSharePct = 0.06 } = {}) {
  if (!candles?.length) return [];
  const closes = candles.map(k => k.c).filter(Number.isFinite);
  if (closes.length < bins) return [];
  const lo = Math.min(...closes), hi = Math.max(...closes);
  if (!(hi > lo)) return [];
  const width = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const c of closes) {
    const i = Math.min(bins - 1, Math.floor((c - lo) / width));
    counts[i]++;
  }
  const out = [];
  for (let i = 0; i < bins; i++) {
    const share = counts[i] / closes.length;
    if (share < minSharePct) continue;
    // Merge into an adjacent shelf rather than emitting neighbouring bins twice.
    const price = lo + width * (i + 0.5);
    const near = out.find(o => Math.abs(o.price - price) / price <= 0.015);
    if (near) {
      if (share > near.share) { near.price = price; near.share = share; }
      near.bars += counts[i];
    } else {
      out.push({ price, share, bars: counts[i] });
    }
  }
  return out.sort((a, b) => b.share - a.share);
}

// --- the one level that matters ------------------------------------------
//
// Entry, stop and exit were each deciding "where is support" separately, with
// different windows and thresholds. That is how a position ended up with its
// support recorded at a 15m artifact 4% below price while the pattern it was
// actually bought for sat 11% lower on three higher timeframes — the exit would
// have sold the retest that the setup was waiting for.
//
// One definition, used by all three. A level counts when more than one
// timeframe agrees on it, and levels far from price lose out to nearer ones:
// a line 40% away is not the pattern being traded.
function levelsOn(frames, side, price) {
  const out = [];
  const zones = side === 'lower' ? supportZones : resistanceZones;
  const wanted = side === 'lower' ? (v) => v < price : (v) => v > price;
  for (const [tf, arr, bars, weight] of [
    ['1D', frames.d1, 240, 3], ['4H', frames.h4, 160, 2], ['1H', frames.h1, 130, 1],
  ]) {
    if (!arr?.length) continue;
    const win = arr.slice(-bars);
    const line = fitBoundary(win, side);
    if (line) {
      const v = line.valueAt(win.length - 1);
      if (v > 0 && wanted(v)) out.push({ tf, weight, kind: `trendline-${line.direction}`, price: v, touches: line.touches });
    }
    for (const z of zones(win)) {
      if (z.touches >= 2 && wanted(z.price)) out.push({ tf, weight, kind: 'horizontal', price: z.price, touches: z.touches });
    }
    // Bands price rested in. Counted as 2 touches so a shelf can compete with a
    // pivot level without automatically outranking one.
    for (const s of shelves(win)) {
      if (!wanted(s.price)) continue;
      if (out.some(o => Math.abs(o.price - s.price) / s.price <= 0.015)) continue;
      out.push({ tf, weight, kind: 'shelf', price: s.price, touches: 2, restShare: Number(s.share.toFixed(3)) });
    }
  }
  if (!out.length) return null;
  for (const c of out) {
    c.confirms = out.filter(o => o !== c && o.tf !== c.tf && Math.abs(o.price - c.price) / c.price <= 0.02).length;
    c.distPct = Math.abs(price - c.price) / price;
    c.score = c.confirms * 3 + Math.min(c.touches, 8) + c.weight - c.distPct * 20;
    if (side === 'lower') {
      // Support is where you ENTER, so a level you cannot reach is close to
      // useless however well-confirmed it is. At the old weighting a 12%-away
      // line outranked a shelf 1.3% under price by 3:1, which is how BLESS kept
      // reporting "support 12% below" while price sat on an obvious base.
      if (c.distPct > 0.06) c.score -= 8;
      // A FALLING line used as support is a dip inside a downtrend — the mirror
      // image of the setup, per the rubric's own veto.
      if (String(c.kind).includes('falling')) c.score -= 2;
    }
  }
  out.sort((a, b) => b.score - a.score);
  return { ...out[0], confirmed: out[0].confirms > 0, all: out.slice(0, 6) };
}

// Where the pattern holds. Below this by a margin, the reason for the trade is
// gone. Above it and near it is where entries belong.
export function patternSupport(frames, price) { return levelsOn(frames, 'lower', price); }

// Where the pattern has been selling. This is the profit target — Shariq's
// sell rule is "at the resistance of the pattern it is making", not a fixed R.
export function patternResistance(frames, price) { return levelsOn(frames, 'upper', price); }

// --- targets ---------------------------------------------------------------
//
// levelsOn() penalises distance, which is correct for support (you must enter
// AT it) and wrong for a target: it made the agent call a 1.5% intraday shelf
// the objective while the pattern's actual resistance sat +145% and +291% away.
//
// A target has to be a level that ALREADY rejected a real move. Shariq's two:
//   R1 — the first major resistance, the tip of a move that got sold hard
//   R2 — the pattern's own upper boundary, projected to now
//
// "would sell it either at resistance one ... otherwise at resistance 2"
// Calibrated against Shariq's own chart: he marked R1 on 人生K线 at the tip of a
// ~280% rally that was then sold 66%, and ignored every smaller bump between.
// At 20%/15% the agent called a 23%-rally blip 2% overhead a "major resistance".
const MAJOR_DROP = 0.30;   // price fell this far away from the level

const MAJOR_RALLY = 0.50;  // and price must have RALLIED into it to begin with
const PIVOT_SPAN = 12;     // highest bar within +/- this many bars

function majorRejections(candles, price, tolerance = 0.025) {
  const out = [];
  for (let i = PIVOT_SPAN; i < candles.length - 3; i++) {
    const h = candles[i].h;
    if (!(h > price)) continue;

    // A genuine pivot: the highest bar in its neighbourhood, not a micro-bump.
    // Without this, every wobble inside a consolidation registered as a level.
    const span = candles.slice(Math.max(0, i - PIVOT_SPAN), i + PIVOT_SPAN + 1);
    if (h < Math.max(...span.map(k => k.h))) continue;

    // Price must have RALLIED into it. This is what separates the tip of a real
    // move — the thing that gets sold — from a shelf inside chop that merely
    // happens to sit above a later drift.
    const before = candles.slice(Math.max(0, i - PIVOT_SPAN * 2), i);
    if (!before.length) continue;
    const base = Math.min(...before.map(k => k.l));
    const rally = (h - base) / Math.max(base, 1e-18);
    if (rally < MAJOR_RALLY) continue;

    // And it must then have been rejected.
    const after = candles.slice(i + 1, i + 40);
    if (!after.length) continue;
    const low = Math.min(...after.map(k => k.l));
    const drop = (h - low) / h;
    if (drop < MAJOR_DROP) continue;

    const hit = out.find(o => Math.abs(o.price - h) / h <= tolerance);
    if (hit) { hit.touches++; hit.price = Math.max(hit.price, h); }
    else out.push({ price: h, touches: 1, dropPct: drop, rallyPct: rally });
  }
  return out;
}

export function patternTargets(frames, price) {
  const pool = [];
  for (const [tf, arr, bars] of [['1D', frames.d1, 240], ['4H', frames.h4, 300], ['1H', frames.h1, 400]]) {
    if (!arr?.length) continue;
    for (const r of majorRejections(arr.slice(-bars), price)) {
      pool.push({ tf, kind: 'major-rejection', ...r, distPct: (r.price - price) / price });
    }
  }
  // R1 = the nearest level that actually rejected a real move.
  pool.sort((a, b) => a.price - b.price);
  const r1 = pool[0] ?? null;

  // R2 = the pattern boundary, projected to the current bar. Prefer the highest
  // timeframe that produces a rising line above price — that is the line the
  // triangle/wedge is actually drawn on.
  let r2 = null;
  for (const [tf, arr, bars] of [['1D', frames.d1, 240], ['4H', frames.h4, 300]]) {
    if (!arr?.length) continue;
    const win = arr.slice(-bars);
    const line = fitBoundary(win, 'upper');
    if (!line) continue;
    const v = line.valueAt(win.length - 1);
    if (v > price && (!r2 || v > r2.price)) {
      r2 = { tf, kind: `pattern-boundary-${line.direction}`, price: v, touches: line.touches, distPct: (v - price) / price };
    }
  }
  // A boundary below R1 is not a second target.
  if (r1 && r2 && r2.price <= r1.price) r2 = null;
  return { r1, r2, all: pool.slice(0, 6) };
}

export function fitBoundary(candles, side = 'lower', { tol = 0.02, minTouches = 2 } = {}) {
  const { highs, lows } = swings(candles, 3);
  const pivots = side === 'lower' ? lows : highs;
  if (pivots.length < 2) return null;

  const priceAt = (a, b, i) => a.price + ((b.price - a.price) / (b.i - a.i)) * (i - a.i);
  let best = null;

  for (let x = 0; x < pivots.length - 1; x++) {
    for (let y = x + 1; y < pivots.length; y++) {
      const a = pivots[x], b = pivots[y];
      if (b.i === a.i) continue;

      // The line must act as a boundary: price should not sit far beyond it.
      let violated = false;
      for (let i = a.i; i < candles.length; i++) {
        const line = priceAt(a, b, i);
        if (line <= 0) { violated = true; break; }
        const v = side === 'lower'
          ? (line - candles[i].l) / line   // low below the support line
          : (candles[i].h - line) / line;  // high above the resistance line
        if (v > tol) { violated = true; break; }
      }
      if (violated) continue;

      // Count pivots that sit ON the line (a "touch").
      let touches = 0;
      for (const p of pivots) {
        if (p.i < a.i) continue;
        const line = priceAt(a, b, p.i);
        if (line > 0 && Math.abs(p.price - line) / line <= tol) touches++;
      }
      if (touches < minTouches) continue;

      const slope = (b.price - a.price) / (b.i - a.i);
      const nowVal = a.price + slope * (candles.length - 1 - a.i);
      if (!(nowVal > 0)) continue;
      const lastPrice = candles.at(-1).c;
      const distPct = Math.abs(lastPrice - nowVal) / lastPrice;
      const cand = { slope, anchor: a, touches, lastIdx: b.i, distPct };
      // A trader draws the line price is actually INTERACTING with, not merely
      // the one with the most historical touches. Optimising touches alone
      // picked a 1D line 30% below price while the operative channel support
      // sat just under it. Proximity gates first, touches rank within.
      const near = (c) => c.distPct <= 0.15;
      const better =
        !best ? true :
        near(cand) !== near(best) ? near(cand) :
        cand.touches !== best.touches ? cand.touches > best.touches :
        cand.lastIdx > best.lastIdx;
      if (better) best = cand;
    }
  }
  if (!best) return null;
  return {
    slope: best.slope,
    touches: best.touches,
    startIdx: best.anchor.i,
    valueAt: (i) => best.anchor.price + best.slope * (i - best.anchor.i),
    direction: best.slope > 0 ? 'rising' : best.slope < 0 ? 'falling' : 'flat',
  };
}
