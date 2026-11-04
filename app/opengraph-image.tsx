import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ImageResponse } from 'next/og'
import { FOIL, INK, INK_2, INK_3, OG_SIZE, OgLabel, OgMark, ogFonts } from '@/lib/og'
import { agentSnapshot } from '@/lib/near/snapshot'

export const alt = 'ParallaxPay: an AI trader that works in the open on NEAR. Its latest chart read, with the support, resistance and money flow it drew.'
export const size = OG_SIZE
export const contentType = 'image/png'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The exact chart image the agent last read for a coin, as a data URL, if it has one. */
function chartOf(coin: string): string | null {
  const path = resolve(process.env.PARALLAXPAY_CHART_DIR ?? 'var/charts', `near-${coin}.png`)
  return existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : null
}

/** The card a ParallaxPay link shows on X and Telegram: the line, and the agent's latest real chart read. */
export default async function OpenGraphImage() {
  const [fonts, agent] = await Promise.all([ogFonts(), agentSnapshot().catch(() => null)])
  const reads = agent?.reads ?? []
  const lead = reads.find(r => r.setup) ?? [...reads].sort((a, b) => (b.checks ?? []).filter(c => c.ok).length - (a.checks ?? []).filter(c => c.ok).length)[0]
  const coin = lead?.coin ?? 'NEAR'
  const chart = chartOf(coin)
  const passed = lead ? (lead.checks ?? []).filter(c => c.ok).length : null
  const line = { display: 'flex', fontSize: 62, fontWeight: 900, color: INK, lineHeight: 1.04, letterSpacing: -2.2 } as const
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#ffffff', fontFamily: 'Inter Tight' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 560, padding: '52px 0 48px 60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <OgMark size={52} />
            <div style={{ display: 'flex', fontSize: 36, fontWeight: 900, color: INK, letterSpacing: -1.1 }}>ParallaxPay</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={line}>An AI trader</div>
            <div style={line}>that works</div>
            <div style={{ ...line, flexDirection: 'column', alignItems: 'flex-start' }}>
              in the open.
              <div style={{ display: 'flex', width: 300, height: 7, marginTop: 2, borderRadius: 999, backgroundImage: FOIL }} />
            </div>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 500, color: INK_2, lineHeight: 1.3, marginTop: 22, width: 470 }}>Reads the chart like a trader, seals every plan on NEAR before it trades, and only ever trades inside your mandate.</div>
          </div>
          <OgLabel color={INK_3} size={15}>
            Live on NEAR · NEAR AI · Rhea · Intents
          </OgLabel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, margin: '28px 28px 28px 0', borderRadius: 32, background: INK, padding: 22, position: 'relative' }}>
          <div style={{ display: 'flex', position: 'absolute', top: 0, left: 40, right: 40, height: 4, backgroundImage: FOIL, borderRadius: 999 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: '#3DDC84' }} />
              <div style={{ display: 'flex', fontSize: 22, fontWeight: 900, color: '#ffffff' }}>{`Reading ${coin}`}</div>
            </div>
            {passed != null && <OgLabel color="#A1A1AA" size={16}>{`${passed} of 6 checks`}</OgLabel>}
          </div>
          <div style={{ display: 'flex', flex: 1, marginTop: 16, borderRadius: 18, overflow: 'hidden', background: '#0d1117' }}>
            {chart ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={chart} width={556} height={403} style={{ objectFit: 'cover' }} />
            ) : (
              <div style={{ display: 'flex', margin: 'auto', fontSize: 22, color: '#8A8A92' }}>Its chart appears here after its next read</div>
            )}
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#A1A1AA', marginTop: 14 }}>The exact chart it read: support, resistance, trendlines and money flow on four timeframes.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
