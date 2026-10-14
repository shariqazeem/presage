// Ported from ST Quant (okxtradingagent/src/charts.js) on 14 Oct 2026.
// The trading logic is unchanged; Presage-specific edits are marked "Presage:".

// Chart renderer — turns candles into the picture a trader actually looks at.
// Pure SVG -> PNG (no browser). A 2x2 grid of timeframes, each with a price
// panel (candles + mapped structure) and an MFI panel underneath, so the model
// sees the same multi-timeframe view the user reads by eye.

import { Resvg } from '@resvg/resvg-js';
import { mfi } from './indicators.js';
import { supportZones, resistanceZones, fitBoundary } from './structure.js';

const C = {
  bg: '#0d1117', grid: '#1c2333', text: '#c9d1d9', sub: '#7d8590',
  up: '#26a69a', down: '#ef5350', mfiLine: '#b388ff',
  support: '#3fb950', resistance: '#f85149', level: '#58a6ff',
};

const esc = (s) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function panel(candles, label, x0, y0, w, h, maxBars = 120) {
  if (!candles?.length) return '';
  const n = Math.min(candles.length, maxBars);
  const data = candles.slice(-n);
  const priceH = Math.round(h * 0.68);
  const mfiH = h - priceH - 26;

  const highs = data.map(k => k.h), lows = data.map(k => k.l);
  const hi = Math.max(...highs), lo = Math.min(...lows);
  const pad = (hi - lo) * 0.08 || hi * 0.01;
  const top = hi + pad, bot = lo - pad;
  const yOf = (p) => y0 + 22 + priceH * (1 - (p - bot) / (top - bot));
  const cw = w / n;
  const xOf = (i) => x0 + i * cw + cw / 2;

  const last0 = data.at(-1).c;
  let s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${C.bg}" stroke="${C.grid}"/>`;
  s += `<text x="${x0 + 8}" y="${y0 + 15}" fill="${C.text}" font-family="monospace" font-size="13" font-weight="bold">${esc(label)}</text>`;

  // horizontal gridlines + price labels
  for (let g = 0; g <= 4; g++) {
    const p = bot + (top - bot) * (g / 4);
    const y = yOf(p);
    s += `<line x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<text x="${x0 + w - 4}" y="${y - 2}" fill="${C.sub}" font-family="monospace" font-size="10" text-anchor="end">${p.toPrecision(5)}</text>`;
  }

  // mapped structure: respected support / resistance zones
  for (const z of supportZones(data).filter(z => z.touches >= 2).slice(0, 3)) {
    if (z.price < bot || z.price > top) continue;
    const y = yOf(z.price);
    s += `<line x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}" stroke="${C.support}" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.9"/>`;
    s += `<text x="${x0 + 4}" y="${y - 3}" fill="${C.support}" font-family="monospace" font-size="9">S ${z.price.toPrecision(4)} (${z.touches}x)</text>`;
  }
  for (const z of resistanceZones(data).filter(z => z.touches >= 2).slice(0, 3)) {
    if (z.price < bot || z.price > top) continue;
    const y = yOf(z.price);
    s += `<line x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}" stroke="${C.resistance}" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.9"/>`;
    s += `<text x="${x0 + 4}" y="${y - 3}" fill="${C.resistance}" font-family="monospace" font-size="9">R ${z.price.toPrecision(4)} (${z.touches}x)</text>`;
  }

  // diagonal trendlines — the channel boundaries a trader actually draws.
  // Without these the model can only infer channels from candle shapes, which
  // made it miss a rising-support hug that was obvious by eye (MOR 1H, 18 touches).
  for (const [side, colr, tag] of [['lower', C.support, 'SUP'], ['upper', C.resistance, 'RES']]) {
    const b = fitBoundary(data, side);
    if (!b) continue;
    const i0 = Math.max(0, b.startIdx);
    const y1 = b.valueAt(i0), y2 = b.valueAt(n - 1);
    if (!(y1 > 0 && y2 > 0)) continue;
    const cy1 = Math.min(Math.max(yOf(y1), y0 + 22), y0 + 22 + priceH);
    const cy2 = Math.min(Math.max(yOf(y2), y0 + 22), y0 + 22 + priceH);
    s += `<line x1="${xOf(i0)}" y1="${cy1}" x2="${xOf(n - 1)}" y2="${cy2}" stroke="${colr}" stroke-width="2" opacity="0.95"/>`;
    const dist = ((last0 - y2) / last0) * 100;
    s += `<text x="${xOf(n - 1) - 4}" y="${cy2 - 5}" fill="${colr}" font-family="monospace" font-size="10" text-anchor="end">${tag} ${b.direction} ${b.touches}x ${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%</text>`;
  }

  // candles
  data.forEach((k, i) => {
    const col = k.c >= k.o ? C.up : C.down;
    const x = xOf(i);
    const bw = Math.max(1.2, cw * 0.62);
    s += `<line x1="${x}" y1="${yOf(k.h)}" x2="${x}" y2="${yOf(k.l)}" stroke="${col}" stroke-width="1"/>`;
    const yTop = yOf(Math.max(k.o, k.c));
    const bh = Math.max(1, Math.abs(yOf(k.o) - yOf(k.c)));
    s += `<rect x="${x - bw / 2}" y="${yTop}" width="${bw}" height="${bh}" fill="${col}"/>`;
  });

  // last price marker
  const last = last0;
  const ly = yOf(last);
  s += `<line x1="${x0}" y1="${ly}" x2="${x0 + w}" y2="${ly}" stroke="${C.level}" stroke-width="1" stroke-dasharray="2 3"/>`;
  s += `<text x="${x0 + w - 4}" y="${ly + 11}" fill="${C.level}" font-family="monospace" font-size="10" text-anchor="end">${last.toPrecision(5)}</text>`;

  // MFI panel
  const mv = mfi(data);
  if (mv) {
    const my0 = y0 + 22 + priceH + 8;
    const myOf = (v) => my0 + mfiH * (1 - v / 100);
    s += `<rect x="${x0}" y="${my0}" width="${w}" height="${mfiH}" fill="#0a0e14" stroke="${C.grid}"/>`;
    for (const lvl of [20, 80]) {
      s += `<line x1="${x0}" y1="${myOf(lvl)}" x2="${x0 + w}" y2="${myOf(lvl)}" stroke="${C.grid}" stroke-width="1" stroke-dasharray="3 3"/>`;
      s += `<text x="${x0 + 3}" y="${myOf(lvl) - 2}" fill="${C.sub}" font-family="monospace" font-size="8">${lvl}</text>`;
    }
    const pts = mv.map((v, i) => (v == null ? null : `${xOf(i)},${myOf(v)}`)).filter(Boolean).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${C.mfiLine}" stroke-width="1.4"/>`;
    const lastMfi = mv.filter(v => v != null).at(-1);
    s += `<text x="${x0 + w - 4}" y="${my0 + 11}" fill="${C.mfiLine}" font-family="monospace" font-size="10" text-anchor="end">MFI ${lastMfi?.toFixed(1)}</text>`;
  }
  return s;
}

// Render a 2x2 multi-timeframe view to PNG. Returns the PNG bytes.
export function renderChart({ symbol, frames }) {
  const W = 1600, H = 1160, cellW = 780, cellH = 545;
  // Bars per panel differ by timeframe: a 1D trendline is anchored months back,
  // so showing only 120 daily candles hid the very structure the user draws
  // (this caused a false AVOID on MOR — its channel started outside the window).
  const tfs = [
    ['1D', frames.d1, 240], ['4H', frames.h4, 160],
    ['1H', frames.h1, 130], ['15m', frames.m15, 120],
  ];
  let body = `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  body += `<text x="16" y="24" fill="${C.text}" font-family="monospace" font-size="16" font-weight="bold">${esc(symbol)} — multi-timeframe</text>`;
  tfs.forEach(([label, data, maxBars], i) => {
    const x = 12 + (i % 2) * (cellW + 16);
    const y = 38 + Math.floor(i / 2) * (cellH + 16);
    const span = data?.length ? `${new Date(data[Math.max(0, data.length - maxBars)].ts).toISOString().slice(0, 10)} to now` : '';
    body += panel(data, `${symbol} ${label}  [${span}]`, x, y, cellW, cellH, maxBars);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  // Presage: return the PNG instead of writing it to disk.
  return png;
}
