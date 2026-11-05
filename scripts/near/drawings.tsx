/**
 * Renders ParallaxPay's drawings of every coin on every timeframe to PNG, to check by eye that the
 * lines sit on the candles. Uses the candles the agent saved (var/charts/near-<COIN>.json) or a frames
 * file from `--frames <dir>` (files named <COIN>.frames.json with {m15,h1,h4,d1}).
 *
 *   npx tsx scripts/near/drawings.tsx --out <dir> [--frames <dir>] [--w 900 --h 520]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { DrawingPicture } from '../../components/near/AgentDrawing'
import { COINS } from '../../lib/near/config'
import { readChart, type DrawTf } from '../../lib/near/drawing'
import type { Candle } from '../../lib/market/types'

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const out = resolve(arg('out', 'var/drawings')!)
const framesDir = arg('frames')
const W = Number(arg('w', '900'))
const H = Number(arg('h', '520'))
mkdirSync(out, { recursive: true })

const KEYS: Record<DrawTf, string> = { '15m': 'm15', '1h': 'h1', '4h': 'h4', '1d': 'd1' }
for (const coin of COINS) {
  let frames: Record<string, Candle[]> | null = null
  if (framesDir && existsSync(`${framesDir}/${coin.symbol}.frames.json`)) frames = JSON.parse(readFileSync(`${framesDir}/${coin.symbol}.frames.json`, 'utf8'))
  else if (existsSync(`var/charts/near-${coin.symbol}.json`)) {
    const f = JSON.parse(readFileSync(`var/charts/near-${coin.symbol}.json`, 'utf8')).frames
    frames = { m15: f['15m'], h1: f['1h'], h4: f['4h'], d1: f['1d'] }
  }
  if (!frames) continue
  for (const tf of ['1d', '4h', '1h', '15m'] as DrawTf[]) {
    const d = readChart(frames[KEYS[tf]] ?? [], tf)
    if (!d) continue
    for (const allLevels of [false, true]) {
      const html = renderToStaticMarkup(
        <DrawingPicture d={d} older={[]} tf={tf} w={W} h={H} size="stage" animate={false} allLevels={allLevels} canHold={false} onNeedOlder={() => {}} label="" />,
      )
      const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>') + 6).replace(/var\(--font-mono\)/g, 'Menlo').replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg"`)
      const bg = `<rect width="${W}" height="${H}" fill="#0E0E10"/>`
      if (process.env.SVG_ONLY) {
        writeFileSync(`${out}/${coin.symbol}-${tf}${allLevels ? '-all' : ''}.svg`, svg)
        continue
      }
      const png = new Resvg(svg.replace(/(<svg[^>]*>)/, `$1${bg}`), { fitTo: { mode: 'width', value: W * 2 }, font: { loadSystemFonts: true, defaultFontFamily: 'Menlo' } }).render().asPng()
      writeFileSync(`${out}/${coin.symbol}-${tf}${allLevels ? '-all' : ''}.png`, png)
    }
  }
  console.log(`${coin.symbol} drawn`)
}
