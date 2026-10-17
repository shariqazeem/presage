// Ported from ST Quant (okxtradingagent/src/arming.js) on 14 Oct 2026.
// The trading logic is unchanged; Called-specific edits are marked "Called:".

// Deciding where to REST an order, which is a different question from "should
// I buy now".
//
// The sniper fires when price is already at support with MFI extreme. But by
// then the wick may already have bounced. To actually catch it, the order must
// be placed while price is still ABOVE support — so this module answers:
// "is this chart set up such that a touch of that level would be a trade?"
//
// The order cannot check MFI when it fills. So everything MFI-related has to be
// judged at arming time (is momentum already falling toward exhaustion?) and
// re-judged every scan until it fills or is cancelled.

import { atr, mfi, bullishDivergence, hugsLine, ema } from './indicators.js';
import { ord } from './indicators.js';
import { supportMap, mfiExtreme, keySupports } from './sniper.js';
import { supportZones } from './structure.js';
import { resistanceZones, fitBoundary, patternSupport } from './structure.js';
// Called: settings come from ./settings.js instead of ST Quant's config.json.
import { SETTINGS as CFG } from './settings.js';

// Day-1 posture is deliberately strict: with no proven edge, the cheapest way
// to protect capital is to take fewer, better trades and scale up only once
// live results justify it.
const MIN_ARM_CONVICTION = Number(CFG.minArmConviction ?? 4);
// In hold mode the trade is not closed at the first obstacle — it trails and
// exits on momentum exhaustion. So reward must be measured against where the
// move could actually run to, not the nearest speed bump. Measuring a
// conviction hold against the nearest 1H level made every one of them look
// like a losing trade (BLESS scored 0.99R against a level 4% away).
const HOLD_MODE = CFG.holdMode === true;

export const ARM = {
  maxTargetPct: 0.30,  // a FIRST target beyond +30% is a moonshot, not a target
  rrCapForConviction: 5,
  minDistPct: 0.003,   // support must be at least 0.3% below — else just buy now
  maxDistPct: 0.08,    // more than 8% away is a different chart, not a setup
  // "not here, bcs here it can retest -10% support" — Shariq, on an entry taken
  // 11% above the real trendline. Buying mid-range means the honest stop sits
  // down at the pattern, so the trade risks the whole retest it should have
  // waited for. Measured against the higher-timeframe-confirmed level, not the
  // nearest 15m squiggle.
  maxDistToPatternSupport: Number(CFG.maxDistToPatternSupport ?? 0.05),
  // Reward floor, measured against the run-to level in hold mode. Operator-set
  // in config.json — 2.0 was an arbitrary round number, not a derived value.
  minRR: Number(CFG.minRR ?? 2.0),
  // THE core of the method, which the order path was missing entirely:
  // "I just take entry in oversold AND when price is at bottom support."
  // Structure alone is half the setup. MFI must already be in the lower part
  // of its own range — a mid-range MFI means no exhaustion is happening.
  maxMfiPercentileAtArm: Number(CFG.maxMfiPercentileAtArm ?? 0.40),
  // Percentile alone is not enough. On a coin whose MFI rarely drops, 45 can
  // sit in the bottom quartile of its own range while being plainly not
  // oversold — Shariq rejected exactly that ("its mfi not even low"). He asks
  // for 15m MFI below 20 at entry; the order rests above support, so the arm
  // ceiling is looser and MFI falls further as price dips into the level.
  maxMfiAbsoluteAtArm: Number(CFG.maxMfiAbsoluteAtArm ?? 35),
  idealMfiAtEntry: 20,
  // ...but MFI is evidence, not law. Shariq: "not everytime MFI works" and
  // "structure outranks the oscillator" — he took BLESS with 15m MFI elevated
  // because an 8-touch rising line across 6 timeframes WAS the signal. A hard
  // MFI gate blocks exactly that trade. So exceptional structure earns its own
  // path, with a deliberately high bar so it cannot become a loophole.
  // If the level was ALREADY tested and price is turning up off it, the setup
  // is confirmed — waiting for a second retest that may never come is how the
  // BLESS move was missed. Buy at market, but only while price is still within
  // this distance of where the limit would have sat. Beyond it, it's a chase.
  maxChaseAfterTestPct: Number(CFG.maxChaseAfterTestPct ?? 0.05),
  testLookbackBars: 30,
  // MFI must be at the BOTTOM of its own recent range, not merely low-ish.
  // Shariq: "same it first drops to full down of any coin we will wait".
  bottomPercentile: Number(CFG.mfiBottomPercentile ?? 0.15),
  // The 1H route needs a real extreme too, just measured on the timeframe the
  // rubric calls the reliable one.
  hourlyBottomMfi: Number(CFG.hourlyBottomMfi ?? 25),
  structureOverride: {
    // Disabled by default from 2026-08-12. This is the rule that bought 人生K线
    // at MFI 43 on a "16-touch" 15m line. Structure can no longer substitute
    // for a bottomed oscillator — both conditions are mandatory now.
    enabled: CFG.structureOverrideEnabled === true,
    minTouches: Number(CFG.structureOverrideTouches ?? 6),
    minConfluence: 3,
    maxMfi: 60,            // still not buying into an overbought push
    requiresRisingLine: true,
  },
  minTouches: 3,       // a line needs 3+ contacts to be real
  triggerBufferPct: 0.003,  // rest slightly above the line so a wick fills it
  stopAtrMult: 1.8,
  // A stop must survive normal noise. Shariq: "5-7% temporary drawdown is
  // normal, just a wick in this type of setup." On a low-ATR token 1.8x ATR
  // came out at 2%, which guarantees being wicked out of the exact setups the
  // strategy is built to hold. The floor is what makes the stop structural.
  minStopPct: Number(CFG.minStopPct ?? 0.06),
  maxStopPct: 0.14,
};

// The level that would actually reject a rally — TP must clear this test.
function overheadResistance(frames, price) {
  const zones = resistanceZones(frames.h4.slice(-160)).filter(z => z.touches >= 2);
  const above = zones.filter(z => z.price > price * 1.005).sort((a, b) => a.price - b.price);
  const line = fitBoundary(frames.h4.slice(-160), 'upper');
  const lineVal = line ? line.valueAt(159) : null;
  const candidates = [...above.map(z => ({ price: z.price, touches: z.touches, kind: 'horizontal' }))];
  if (lineVal && lineVal > price * 1.005) candidates.push({ price: lineVal, touches: line.touches, kind: `trendline-${line.direction}` });
  candidates.sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}

// Called: exported so a sniper-route call can take the same TP1 the rubric names.
// "First rejection point" — his TP1. The tip of the last big pump candle, but
// only if it is a plausible FIRST target. Taking the largest pump in 120 bars
// regardless of distance produced a 17R "target" 142% above entry: a number
// that flatters conviction and a trade that never gets there.
export function firstRejection(frames, price) {
  const win = frames.h4.slice(-120);
  const ceiling = price * (1 + ARM.maxTargetPct);
  let best = null;
  for (const k of win) {
    const range = k.h - k.l;
    if (k.c > k.o && k.h > price * 1.01 && k.h <= ceiling && (!best || range > best.range)) {
      best = { range, price: k.h };
    }
  }
  return best?.price ?? null;
}

// Nearest level that has actually rejected price, searched on 1H as well as 4H
// so the target is the next real obstacle rather than a distant one.
export function nearestRejector(frames, price) {
  const out = [];
  for (const [tf, arr, bars] of [['4H', frames.h4, 160], ['1H', frames.h1, 130]]) {
    if (!arr?.length) continue;
    const win = arr.slice(-bars);
    for (const z of resistanceZones(win).filter(z => z.touches >= 2)) {
      if (z.price > price * 1.01 && z.price <= price * (1 + ARM.maxTargetPct)) {
        out.push({ price: z.price, touches: z.touches, kind: `${tf} horizontal` });
      }
    }
    const line = fitBoundary(win, 'upper');
    if (line) {
      const v = line.valueAt(win.length - 1);
      if (v > price * 1.01 && v <= price * (1 + ARM.maxTargetPct)) {
        out.push({ price: v, touches: line.touches, kind: `${tf} trendline-${line.direction}` });
      }
    }
  }
  out.sort((a, b) => a.price - b.price);
  return out[0] ?? null;
}

// Is this level STRUCTURAL, or a short-window artifact?
//
// The agent bought 人生K线 on a "16-touch rising trendline" that was really a
// steep line fitted through 2.5 days of lows. The structural support Shariq
// reads sat ~11% lower. Counting touches on one timeframe is not enough — a
// real level shows up on a HIGHER timeframe at roughly the same price.
export function isStructural(level, frames, tolerance = 0.015) {
  for (const [tf, arr, bars] of [['1H', frames.h1, 130], ['4H', frames.h4, 160], ['1D', frames.d1, 240]]) {
    if (!arr || arr.length < 40) continue;
    const win = arr.slice(-bars);
    for (const z of supportZones(win).filter(z => z.touches >= 2)) {
      if (Math.abs(z.price - level.price) / level.price <= tolerance) {
        return { ok: true, confirmedOn: `${tf} horizontal`, touches: z.touches };
      }
    }
    const lo = fitBoundary(win, 'lower');
    if (lo) {
      const v = lo.valueAt(win.length - 1);
      if (v > 0 && Math.abs(v - level.price) / level.price <= tolerance) {
        return { ok: true, confirmedOn: `${tf} trendline-${lo.direction}`, touches: lo.touches };
      }
    }
  }
  return { ok: false };
}

// Is the BIG picture actually constructive? Shariq on B vs BLESS: "B seems
// bearish cuz higher tf pattern is not a good pattern like bless is." A good
// 15m setup inside a deteriorating 1D/4H structure is a worse trade than the
// same setup inside a rising one, and the agent had no way to tell them apart.
export function higherTfQuality(frames) {
  let score = 0;
  const notes = [];
  for (const [tf, arr, bars, weight] of [['1D', frames.d1, 240, 3], ['4H', frames.h4, 160, 2]]) {
    if (!arr || arr.length < 40) continue;
    const win = arr.slice(-bars);
    const lo = fitBoundary(win, 'lower');
    if (!lo) continue;
    if (lo.direction === 'rising') {
      const pts = weight + (lo.touches >= 4 ? 1 : 0);
      score += pts;
      notes.push(`${tf} rising support (${lo.touches} touches)`);
    } else {
      score -= weight;
      notes.push(`${tf} support is FALLING (${lo.touches} touches)`);
    }
  }
  // Higher lows on the daily = the structure is still building.
  const d = frames.d1?.slice(-12) ?? [];
  if (d.length >= 9) {
    const recentLow = Math.min(...d.slice(-4).map(k => k.l));
    const priorLow = Math.min(...d.slice(-9, -4).map(k => k.l));
    if (recentLow > priorLow) { score += 2; notes.push('1D making higher lows'); }
    else if (recentLow < priorLow * 0.97) { score -= 2; notes.push('1D making lower lows'); }
  }
  return { score, notes, strong: score >= 3, weak: score <= 0 };
}

export function armPlan(frames, token) {
  const price = frames.m15.at(-1).c;
  const a = atr(frames.m15);
  const reasons = [];
  const blockers = [];

  if (!a || a / price < 0.004) return { arm: false, blockers: ['too quiet to cover costs'] };

  // --- the level to rest on: strongest support in the arming band ------------
  const map = supportMap(frames);
  const candidates = [];
  for (const [tf, list] of Object.entries(map)) {
    for (const s of list) {
      const dist = (price - s.price) / price;
      // Include levels price is sitting ON (dist near zero, or slightly under).
      // Those are market-entry candidates, not limit-rest candidates.
      if (dist >= -0.01 && dist <= ARM.maxDistPct) candidates.push({ tf, ...s, dist });
    }
  }
  if (!candidates.length) return { arm: false, blockers: ['no support within reach (price is not near any level)'] };

  // Confluence: levels within 1% of each other across timeframes are one level.
  for (const c of candidates) {
    c.confluence = candidates.filter(o => Math.abs(o.price - c.price) / c.price < 0.01).length;
  }
  // Rank levels by how much they ARE the trade, not merely how many exist.
  // A rising trendline with real touches is setup A — the thing he actually
  // trades. Ranking purely by confluence let a cluster of horizontals outvote
  // the line on BLESS and put the entry 1.6% lower than the actual structure.
  const levelScore = (c) => {
    let s2 = c.confluence + Math.min(c.strength, 6);
    if (c.type === 'trendline-rising') s2 += 4;       // the thesis
    else if (c.type === 'pattern-apex') s2 += 2;
    else if (c.type === 'trendline-falling') s2 -= 1; // dip-in-downtrend
    // Nearer levels are more actionable: an order 6% away may never fill.
    if (c.dist <= 0.02) s2 += 2;
    // Confirmed on a higher timeframe, or just a lower-TF drawing? The rubric is
    // explicit — "strong support means STRUCTURAL, not just many touches" — but
    // touch count alone could still win. On BLESS a 6-touch 15m pattern-apex
    // outranked the nearer 4H rising trendline, and because the apex fails the
    // structural test it killed the 1H-MFI entry route on a setup the chart read
    // scored 5/5. Structure now dominates touch count, as it is supposed to.
    c.structural = isStructural(c, frames).ok;
    s2 += c.structural ? 5 : -5;
    return s2;
  };
  candidates.sort((x, y) => (levelScore(y) - levelScore(x)) || (y.strength - x.strength));
  const level = candidates[0];

  if (level.strength < ARM.minTouches && level.confluence < 2) {
    blockers.push(`level has only ${level.strength} touches and no confluence`);
  }
  reasons.push(`${level.tf} ${level.type} at ${level.price.toPrecision(5)} — ${level.strength} touches, ${level.confluence} timeframe(s) agreeing, ${(level.dist * 100).toFixed(1)}% below price`);

  // Are we actually AT the pattern, or floating above it? Same function the
  // exit uses, so entry and exit can no longer disagree about where support is.
  const pattern = patternSupport(frames, price);
  if (pattern) {
    reasons.push(`pattern support ${pattern.tf} ${pattern.kind} at ${pattern.price.toPrecision(5)} — ${(pattern.distPct * 100).toFixed(1)}% below price, ${pattern.confirms} other timeframe(s) agree`);
    if (pattern.distPct > ARM.maxDistToPatternSupport) {
      blockers.push(`price is ${(pattern.distPct * 100).toFixed(1)}% above the real pattern support ${pattern.price.toPrecision(5)} — mid-range, not at support (max ${(ARM.maxDistToPatternSupport * 100).toFixed(0)}%)`);
    }
  }

  // --- the line must not already be broken ----------------------------------
  if (level.type.startsWith('trendline') || level.type === 'pattern-apex') {
    const h = hugsLine(frames.m15.at(-1), level.price);
    if (h?.broken) blockers.push(`line already broken — 15m closed ${h.closeVsLinePct}% below it`);
  }

  // --- his hostile-downtrend veto -------------------------------------------
  // "Collapse" must mean STRUCTURE IS BREAKING, not "price fell back from a
  // spike". A single spike inflates the EMA, so a distance-from-EMA test alone
  // flags every healthy retrace as a collapse — it vetoed BLESS while price was
  // sitting ON a rising 4H support with 3 touches. Holding a rising lower
  // boundary is the opposite of collapsing.
  const e50 = ema(frames.h4.slice(-160), 50);
  const d1 = frames.d1.slice(-30);
  const h4win = frames.h4.slice(-160);
  const rising4h = fitBoundary(h4win, 'lower');
  const holdingRisingSupport = rising4h && rising4h.direction === 'rising' &&
    price >= rising4h.valueAt(h4win.length - 1) * 0.985;

  const fallingCloses = d1.length >= 6 &&
    d1.at(-1).c < d1.at(-3).c && d1.at(-3).c < d1.at(-6).c;
  const farBelowMean = e50 && price < e50 * 0.85;
  const collapsing = fallingCloses && farBelowMean && !holdingRisingSupport;

  if (collapsing) blockers.push('1D in active collapse — his hostile-downtrend veto');
  else if (holdingRisingSupport && farBelowMean) {
    reasons.push(`retrace from a spike, not a collapse — holding rising 4H support (${rising4h.touches} touches)`);
  }

  // --- risk tight: is the reward worth it? ----------------------------------
  // Price already AT the level with deep exhaustion = take it now. Resting a
  // limit below in that state either misses the trade or asks for a worse fill
  // than the one on offer. Shariq: "if mfi is really lower hugging, it should
  // buy at market, not at limit."
  // How close counts as "at the level" for a market entry. Tight by default:
  // buying 2% above support means paying 2% more and widening the real stop by
  // the same amount. Operator-tunable via config.marketEntryProximityPct.
  const atLevelNow = level.dist < Number(CFG.marketEntryProximityPct ?? ARM.minDistPct);
  const trigger = atLevelNow ? price : level.price * (1 + ARM.triggerBufferPct);
  // Widest of: ATR-based, the noise floor, and just under the level itself.
  // Capped so a wild token cannot produce an absurd risk.
  const atrStop = level.price - a * ARM.stopAtrMult;
  const floorStop = level.price * (1 - ARM.minStopPct);
  const ceilStop = level.price * (1 - ARM.maxStopPct);
  const stop = Math.max(Math.min(atrStop, floorStop), ceilStop);
  // Target = the nearest thing that will actually reject price. Never the
  // furthest thing we can find.
  const rejecting = nearestRejector(frames, trigger) ?? overheadResistance(frames, trigger);
  const pumpTip = firstRejection(frames, trigger);
  // Fixed-TP mode: the nearest thing that rejects is the target.
  // Hold mode: the run-to level — the highest structure within the 30% ceiling.
  const target = HOLD_MODE
    ? (pumpTip ?? rejecting?.price ?? trigger * 1.12)
    : (rejecting && pumpTip ? Math.min(rejecting.price, pumpTip)
       : (rejecting?.price ?? pumpTip ?? trigger * 1.06));
  const rr = (target - trigger) / (trigger - stop);
  const targetPct = ((target - trigger) / trigger) * 100;
  if (!(rr >= ARM.minRR)) {
    blockers.push(`risk tight — only ${rr.toFixed(2)}R to ${rejecting ? rejecting.kind : 'target'} at ${target.toPrecision(5)}`);
  } else if (HOLD_MODE && rejecting && rejecting.price < target) {
    reasons.push(`first obstacle ${rejecting.kind} ${rejecting.price.toPrecision(5)} (+${(((rejecting.price - trigger) / trigger) * 100).toFixed(1)}%) — trailing through it, not selling into it`);
  } else {
    reasons.push(`${rr.toFixed(1)}R to ${target.toPrecision(5)} (+${targetPct.toFixed(1)}%)${rejecting ? ` — ${rejecting.kind}, ${rejecting.touches} touches` : ''}`);
  }

  // --- MFI must be low. This is half the method, not a tiebreaker. ----------
  const m1h = mfi(frames.h1)?.at(-1);
  const m15 = mfi(frames.m15)?.at(-1);
  const x15 = mfiExtreme(frames.m15);
  const x1h = mfiExtreme(frames.h1);

  // Structure quality and the override rule are needed by the MFI decision
  // below, so both must be resolved first.
  const SO = ARM.structureOverride;
  const HTF_EARLY = higherTfQuality(frames);

  const structural = isStructural(level, frames);
  // Same rubric hierarchy as the entry-trigger gate below: a genuine 1H extreme
  // on confirmed structure satisfies "MFI is low", because 1H is the reliable
  // momentum read and 15m is timing. Without this the two gates disagreed —
  // one would pass a setup and the other would still veto it on the 15m alone.
  const hourlyBottomed = m1h != null && m1h <= ARM.hourlyBottomMfi
    && x1h && x1h.percentile <= ARM.bottomPercentile
    && structural.ok;
  const mfiFailed = !hourlyBottomed && (!x15
    || (m15 != null && m15 > ARM.maxMfiAbsoluteAtArm)
    || x15.percentile > ARM.maxMfiPercentileAtArm);
  const structureCarries =
    SO.enabled &&                          // off by default: MFI bottom is mandatory
    structural.ok &&                       // must exist on a higher timeframe too
    level.strength >= SO.minTouches &&
    level.confluence >= SO.minConfluence &&
    (!SO.requiresRisingLine || level.type === 'trendline-rising' || level.type === 'pattern-apex') &&
    !HTF_EARLY.weak &&
    m15 != null && m15 <= SO.maxMfi;

  if (!x15) {
    blockers.push('cannot read 15m MFI');
  } else if (mfiFailed && !structureCarries) {
    if (m15 != null && m15 > ARM.maxMfiAbsoluteAtArm) {
      blockers.push(`15m MFI ${m15.toFixed(0)} is not low (needs <= ${ARM.maxMfiAbsoluteAtArm}, ideally <= ${ARM.idealMfiAtEntry}) and the structure is not strong enough to carry the trade alone`);
    } else {
      blockers.push(`15m MFI ${m15?.toFixed(0)} sits at the ${ord(Math.round(x15.percentile * 100))} percentile — not oversold, no exhaustion to buy`);
    }
  } else if (mfiFailed && structureCarries) {
    reasons.push(`STRUCTURE OVERRIDE: MFI ${m15?.toFixed(0)} is not low, but ${level.tf} ${level.type} has ${level.strength} touches and is confirmed by ${structural.confirmedOn} — the structure is the signal here`);
  } else {
    reasons.push(`15m MFI ${m15?.toFixed(0)} at the ${ord(Math.round(x15.percentile * 100))} percentile of its own range (low ${x15.min})`);
  }
  if (m1h != null && m1h > 65) blockers.push(`1H MFI ${m1h.toFixed(0)} — momentum still hot, a dip here is not exhaustion`);
  else if (x1h) reasons.push(`1H MFI ${m1h?.toFixed(0)} at the ${ord(Math.round(x1h.percentile * 100))} percentile`);

  const htf = HTF_EARLY;
  if (htf.weak) blockers.push(`higher timeframe is not constructive — ${htf.notes.join('; ')}`);
  else reasons.push(`higher timeframe: ${htf.notes.join('; ')}`);

  const div = bullishDivergence(frames.h1);
  if (div?.diverging) reasons.push(`1H bullish divergence (price ${div.priceChangePct}%, MFI +${div.mfiChange})`);

  // --- conviction ------------------------------------------------------------
  let conviction = 2;
  if (level.confluence >= 2) conviction++;
  if (level.strength >= 4) conviction++;
  if (div?.diverging) conviction++;
  if (x15?.isExtreme) conviction++;            // MFI at its least low — the trigger
  if (m15 != null && m15 <= ARM.idealMfiAtEntry) conviction++;   // his stated ideal
  if (x1h?.isExtreme) conviction++;            // both timeframes exhausted
  if (Math.min(rr, ARM.rrCapForConviction) >= 3) conviction++;

  // Evidence-based discount: resting on a FALLING trendline is buying a dip in
  // a downtrend, which backtested at -0.30 to -0.45 R. His method allows it
  // ("rising or falling, there should be some support"), so it is not vetoed —
  // but it must clear a higher bar than a rising line or a held horizontal.
  if (level.type === 'trendline-falling') {
    conviction--;
    reasons.push('discounted: support is a FALLING trendline (dip-in-downtrend pattern)');
  }
  // Price spiking right now makes a near-term pullback to the level less likely.
  if (m15 != null && m15 > 80) { conviction--; reasons.push(`15m MFI ${m15.toFixed(0)} — spiking, the dip may not come soon`); }
  // Closer levels fill sooner; a 7% gap may never be reached inside 24h.
  if (level.dist > 0.05) { conviction--; reasons.push(`level is ${(level.dist * 100).toFixed(1)}% away — may not fill before expiry`); }

  conviction = Math.max(1, Math.min(5, conviction));

  // Market entry demands deep MFI and a constructive higher timeframe: there is
  // no waiting for confirmation once the order is a market order.
  // Two ways to earn a market entry, both from his own words:
  //   1. MFI still deeply oversold ("mfi dropped below 20")
  //   2. MFI was at an extreme and is now CURLING UP off it after the retest
  //      ("when mfi drops to least low, from there it stops and tries to pull
  //       back") — the turn is the trigger, not the depth.
  // "Tested and rising off the level" used to be its own road to a market
  // entry. It is retired: rising off a level is the move already happening,
  // which is the thing Shariq said not to buy. Kept only as an observation so
  // the log still explains what the chart is doing.
  const testWin = frames.m15.slice(-ARM.testLookbackBars);
  const touchedRecently = testWin.some(k => k.l <= level.price * 1.005 && k.l >= level.price * 0.97);
  const last3 = frames.m15.slice(-3);
  const risingOffLevel = last3.length === 3 && price > level.price && last3.at(-1).c > last3[0].c;
  if (touchedRecently && risingOffLevel) {
    reasons.push(`level was tested and price is rising off it — noted, but the move has started; entry requires MFI at its bottom`);
  }

  // ONE road to an entry: MFI at its bottom, at the level. Shariq, after
  // watching 人生K线 bottom out and rally without us:
  //
  //   "we have to take entries at this mfi low ... we take entry in mfi bottom
  //    ... currently this mfi rising i said to you earlier which agent thought
  //    its a buying sign, no we will only take entries from now at mfi lower,
  //    not on rising or anywhere"
  //
  // The two other roads — MFI curling up off the low, and a level already
  // tested with price rising off it — are both "MFI is rising" in disguise.
  // They are the reason the agent entered 11% above support on a mid-range
  // oscillator. Removed, not merely down-weighted.
  // MFI must be AT ITS BOTTOM — but the rubric's own hierarchy decides WHICH
  // timeframe answers that. "MFI is evidence, not law": structure is strongest,
  // 1H MFI is the reliable momentum read, and 15m is timing only and "may be
  // ignored when 1 and 2 are strong". The code used to hard-require the 15m,
  // which vetoed setups that were bottomed on the 1H and sitting on confirmed
  // structure — BLESS at the 2nd percentile on 1H, 1.7% off its shelf.
  //
  // This is NOT a relaxation of "only buy at MFI lower". Both paths demand a
  // genuine extreme; they differ only in which timeframe prints it.
  const deepMfi = m15 != null && m15 <= ARM.idealMfiAtEntry;
  const bottom15 = deepMfi && x15 && x15.percentile <= ARM.bottomPercentile;
  const bottom1h = m1h != null && m1h <= ARM.hourlyBottomMfi
    && x1h && x1h.percentile <= ARM.bottomPercentile
    && structural.ok;                      // 1H only counts on confirmed structure
  const atBottom = bottom15 || bottom1h;
  const entryType = atLevelNow && atBottom && !htf.weak ? 'market' : 'limit';

  if (bottom1h && !bottom15) {
    reasons.push(`1H MFI ${m1h?.toFixed(0)} at the ${ord(Math.round(x1h.percentile * 100))} percentile of its own range — bottomed on the reliable timeframe while sitting on confirmed structure, so the 15m (${m15?.toFixed(0)}) is timing noise here`);
  }
  if (atLevelNow && !atBottom) {
    blockers.push(`price is at the level but MFI is not at its bottom on either timeframe — 15m ${m15?.toFixed(0)} (${ord(Math.round((x15?.percentile ?? 1) * 100))} pct), 1H ${m1h?.toFixed(0)} (${ord(Math.round((x1h?.percentile ?? 1) * 100))} pct). MFI rising is not a signal`);
  }
  if (entryType === 'market') {
    reasons.push(`MARKET ENTRY: price is on the level with 15m MFI ${m15?.toFixed(0)} at the ${ord(Math.round((x15?.percentile ?? 0) * 100))} percentile — MFI is at its bottom, not merely rising`);
  }

  return {
    entryType,
    arm: blockers.length === 0 && conviction >= MIN_ARM_CONVICTION,
    conviction,
    supportPrice: level.price,
    triggerPrice: Number(trigger.toPrecision(8)),
    stop: Number(stop.toPrecision(8)),
    tp1: Number(target.toPrecision(8)),
    rr: Number(rr.toFixed(2)),
    level,
    reasons,
    blockers,
    price,
  };
}
