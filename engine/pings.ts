import webpush from 'web-push'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, schema } from '../lib/db'
import type { EventKind } from '../lib/floor-types'
import { errMsg, log } from './log'
import { send as sendTelegram } from './telegram'

const l = log('pings')
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')

let ready: boolean | null = null
function pushReady(): boolean {
  if (ready != null) return ready
  const pub = process.env.NEXT_PUBLIC_WEB_PUSH_KEY
  const priv = process.env.WEB_PUSH_PRIVATE_KEY
  ready = Boolean(pub && priv)
  if (ready) webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || site || 'https://called.80.225.209.190.sslip.io', pub!, priv!)
  return ready
}

type Ping = { title: string; body: string; url: string; tag?: string }

function words(kind: 'direction' | 'setup', outcome: string): string {
  if (outcome === 'nofill') return 'expired unfilled'
  if (kind === 'direction') return outcome === 'win' ? 'RIGHT' : outcome === 'loss' ? 'WRONG' : 'FLAT'
  return outcome === 'win' ? 'WIN' : outcome === 'loss' ? 'LOSS' : 'FLAT'
}

function result(kind: 'direction' | 'setup', v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return kind === 'setup' ? ` ${n >= 0 ? '+' : '−'}${Math.abs(n / 100).toFixed(2)}R` : ` ${n >= 0 ? '+' : '−'}${Math.abs(n / 100).toFixed(2)}%`
}

/**
 * Someone asked to hear about this: a call opening, or an agent sealing or closing a call. Calls are
 * pinged once; agents every time. Only what is already public goes into a ping.
 */
export async function notifyWatchers(agentId: number, kind: EventKind, data: Record<string, unknown>): Promise<void> {
  if (kind !== 'resolved' && kind !== 'forfeited' && kind !== 'sealed') return
  const db = getDb()
  const agent = db.select({ name: schema.agents.name, slug: schema.agents.slug }).from(schema.agents).where(eq(schema.agents.id, agentId)).get()
  const name = agent?.name ?? 'An agent'
  const callId = typeof data.callId === 'number' ? data.callId : null
  const sym = typeof data.symbol === 'string' ? data.symbol : null
  const callKind = data.kind === 'setup' ? 'setup' : 'direction'

  let ping: Ping
  if (kind === 'sealed') {
    // The coin of a sealed setup belongs to its backers until it closes; the ping says only that it happened.
    ping = { title: `${name} sealed a ${callKind === 'setup' ? 'setup' : 'call'}`, body: 'Sealed on Metis before the move. Backers see the levels now; everyone sees them when it closes.', url: `/agents/${agent?.slug ?? agentId}`, tag: `agent-${agentId}` }
  } else if (kind === 'forfeited') {
    ping = { title: `${name} missed an opening`, body: 'It counts as a loss on its record, and anyone who paid gets their money back.', url: callId ? `/calls/${callId}` : '/', tag: `call-${callId}` }
  } else {
    const w = words(callKind, String(data.outcome))
    ping = { title: `${sym ?? 'A'} call opened: ${w}${data.outcome === 'nofill' ? '' : result(callKind, data.result)}`, body: `${name} · sealed on Metis before the move. Tap for the receipt.`, url: callId ? `/calls/${callId}` : '/', tag: `call-${callId}` }
  }

  const rows = db
    .select()
    .from(schema.watches)
    .where(
      and(
        isNull(schema.watches.doneAt),
        kind === 'sealed' ? and(eq(schema.watches.target, 'agent'), eq(schema.watches.targetId, agentId)) : callId != null ? inArray(schema.watches.targetId, [callId, agentId]) : eq(schema.watches.targetId, agentId),
      ),
    )
    .all()
    .filter(w => (w.target === 'call' ? kind !== 'sealed' && w.targetId === callId : w.targetId === agentId))
  if (!rows.length) return

  const now = Math.floor(Date.now() / 1000)
  for (const w of rows) {
    try {
      if (w.channel === 'push') {
        if (!pushReady()) continue
        const sub = db.select().from(schema.pushSubs).where(eq(schema.pushSubs.endpoint, w.address)).get()
        if (!sub || sub.failedAt) continue
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(ping), { TTL: 6 * 3600 })
      } else {
        const link = db.select({ chatId: schema.telegramLinks.chatId }).from(schema.telegramLinks).where(eq(schema.telegramLinks.wallet, w.address)).get()
        if (!link) continue
        await sendTelegram(link.chatId, `<b>${ping.title}</b>\n${ping.body}\n${site}${ping.url}`)
      }
      if (w.target === 'call') db.update(schema.watches).set({ doneAt: now }).where(eq(schema.watches.id, w.id)).run()
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // The browser unsubscribed or the subscription expired: stop trying it.
      if (w.channel === 'push' && (status === 404 || status === 410)) db.update(schema.pushSubs).set({ failedAt: now }).where(eq(schema.pushSubs.endpoint, w.address)).run()
      l.warn(`ping ${w.id} failed: ${errMsg(e)}`)
    }
  }
}
