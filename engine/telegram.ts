import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import { parsePayload } from '../lib/calls/payload'
import { txUrl } from '../lib/chain'
import { getDb, schema } from '../lib/db'
import { errMsg, log } from './log'

const l = log('telegram')
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const API = `https://api.telegram.org/bot${TOKEN}`
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const CHART_DIR = resolve(process.env.PRESAGE_CHART_DIR ?? 'var/charts')
const OFFSET_KEY = 'telegram:offset'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function tg(method: string, body: Record<string, unknown> | FormData) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(65_000),
  })
  const j = (await res.json()) as { ok: boolean; result?: unknown; description?: string }
  if (!j.ok) throw new Error(`${method}: ${j.description}`)
  return j.result
}

export async function send(chatId: string, html: string, photoPath?: string) {
  if (photoPath && existsSync(photoPath)) {
    const form = new FormData()
    form.set('chat_id', chatId)
    form.set('caption', html.slice(0, 1024))
    form.set('parse_mode', 'HTML')
    form.set('photo', new Blob([readFileSync(photoPath)], { type: 'image/png' }), 'chart.png')
    return tg('sendPhoto', form)
  }
  return tg('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true })
}

/** /start <code>: bind this chat to the wallet that asked for the code on the website. */
async function onMessage(m: { chat: { id: number }; from?: { username?: string }; text?: string }) {
  const db = getDb()
  const text = (m.text ?? '').trim()
  const chatId = String(m.chat.id)
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1]
    if (!code) {
      await send(chatId, 'Presage sends live calls from the agents you subscribe to. Link your wallet from the agent page on the website to start.')
      return
    }
    const row = db.select().from(schema.telegramCodes).where(eq(schema.telegramCodes.code, code)).get()
    if (!row || row.usedAt || Date.now() / 1000 - row.createdAt > 15 * 60) {
      await send(chatId, 'That link has expired. Open the website and press “Link Telegram” again.')
      return
    }
    db.update(schema.telegramCodes).set({ usedAt: Math.floor(Date.now() / 1000) }).where(eq(schema.telegramCodes.code, code)).run()
    db.insert(schema.telegramLinks)
      .values({ wallet: row.wallet, chatId, username: m.from?.username ?? null, linkedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({ target: schema.telegramLinks.wallet, set: { chatId, username: m.from?.username ?? null } })
      .run()
    await send(chatId, `Linked to <code>${row.wallet.slice(0, 6)}…${row.wallet.slice(-4)}</code>. Calls from agents you subscribe to will arrive here the moment they are sealed on chain.`)
    return
  }
  if (text === '/help') {
    await send(chatId, `Every call here was sealed on Metis before the market moved, and every one is scored in public, losses included.\n\nRecords: ${SITE}/agents`)
  }
}

async function pollOnce() {
  const db = getDb()
  const stored = db.select().from(schema.kv).where(eq(schema.kv.key, OFFSET_KEY)).get()
  const offset = stored ? Number(stored.value) : 0
  const updates = (await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] })) as {
    update_id: number
    message?: Parameters<typeof onMessage>[0]
  }[]
  for (const u of updates) {
    try {
      if (u.message) await onMessage(u.message)
    } catch (e) {
      l.warn(`update ${u.update_id}: ${errMsg(e)}`)
    }
    db.insert(schema.kv)
      .values({ key: OFFSET_KEY, value: String(u.update_id + 1) })
      .onConflictDoUpdate({ target: schema.kv.key, set: { value: String(u.update_id + 1) } })
      .run()
  }
}

function describeCall(row: typeof schema.calls.$inferSelect, agentName: string): string {
  const p = parsePayload(row.payload)
  const head = `<b>${esc(agentName)}</b> · call #${row.chainCallId}`
  const sealed = row.sealTx ? `\nSealed on Metis: ${txUrl(row.sealTx)}` : ''
  if (p.rules === 'presage/setup-v1') {
    const where = p.asset.source === 'geckoterminal' ? `${p.asset.network} · <code>${p.asset.token}</code>` : p.asset.market
    return [
      head,
      `<b>${esc(p.asset.symbol)}</b> long · ${where}`,
      `Entry ${p.entry.type === 'market' ? 'now at' : 'limit'} ${p.entry.price}`,
      `Stop ${p.stop} · Target ${p.target}${p.conviction ? ` · Conviction ${p.conviction}/5` : ''}`,
      p.why.slice(0, 3).map(w => `· ${esc(w)}`).join('\n'),
      `Not financial advice. The outcome is scored in public either way.${sealed}`,
    ].join('\n')
  }
  return [head, `<b>${esc(p.asset.symbol)}</b> ${p.direction} over ${p.horizonSec / 3600}h · ${p.confidence}%`, esc(p.why), sealed].join('\n')
}

/** Send newly sealed calls to their agent's live subscribers who linked Telegram. */
async function alertNewCalls() {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const fresh = await db
    .select()
    .from(schema.calls)
    .where(and(eq(schema.calls.status, 'sealed'), isNull(schema.calls.alertedAt), isNull(schema.calls.requestId)))
  for (const row of fresh) {
    const agent = db.select().from(schema.agents).where(eq(schema.agents.id, row.agentId)).get()
    const subs = await db
      .select({ chatId: schema.telegramLinks.chatId })
      .from(schema.subscriptions)
      .innerJoin(schema.telegramLinks, eq(schema.telegramLinks.wallet, schema.subscriptions.subscriber))
      .where(and(eq(schema.subscriptions.agentId, row.agentId), gt(schema.subscriptions.until, now)))
    const text = describeCall(row, agent?.name ?? `Agent ${row.agentId}`)
    const chart = `${CHART_DIR}/call-${row.id}.png`
    for (const s of subs) {
      try {
        await send(s.chatId, text, chart)
      } catch (e) {
        l.warn(`alert to ${s.chatId} failed: ${errMsg(e)}`)
      }
    }
    // The public channel only ever sees a sealed placeholder; the content is for subscribers.
    const channel = process.env.TELEGRAM_CHANNEL_ID
    if (channel && agent) {
      try {
        await send(channel, `<b>${esc(agent.name)}</b> sealed call #${row.chainCallId} on Metis. It reveals when it resolves.\n${row.sealTx ? txUrl(row.sealTx) : ''}`)
      } catch (e) {
        l.warn(`channel post failed: ${errMsg(e)}`)
      }
    }
    db.update(schema.calls).set({ alertedAt: now }).where(eq(schema.calls.id, row.id)).run()
  }
}

const OUTCOME_WORD: Record<string, string> = { win: 'WIN', loss: 'LOSS', flat: 'FLAT', nofill: 'NO FILL' }

/** Tell subscribers, and the payer of a paid call, how each call turned out. Losses go out the same way. */
async function alertOutcomes() {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const done = await db
    .select()
    .from(schema.calls)
    .where(and(inArray(schema.calls.status, ['revealed', 'forfeited']), isNull(schema.calls.resultAlertedAt)))
  for (const row of done) {
    const agent = db.select().from(schema.agents).where(eq(schema.agents.id, row.agentId)).get()
    const chats = new Set<string>()
    const subs = await db
      .select({ chatId: schema.telegramLinks.chatId })
      .from(schema.subscriptions)
      .innerJoin(schema.telegramLinks, eq(schema.telegramLinks.wallet, schema.subscriptions.subscriber))
      .where(and(eq(schema.subscriptions.agentId, row.agentId), gt(schema.subscriptions.until, now)))
    for (const s of subs) chats.add(s.chatId)
    if (row.requestId) {
      const req = db.select().from(schema.oracleRequests).where(eq(schema.oracleRequests.requestId, row.requestId)).get()
      const payer = req?.payer ? db.select().from(schema.telegramLinks).where(eq(schema.telegramLinks.wallet, req.payer)).get() : undefined
      if (payer) chats.add(payer.chatId)
    }
    if (chats.size) {
      const p = parsePayload(row.payload)
      const what = p.rules === 'presage/setup-v1' ? `${p.asset.symbol} long from ${p.entry.price}` : `${p.asset.symbol} ${p.direction} over ${p.horizonSec / 3600}h`
      const result =
        row.status === 'forfeited'
          ? 'FORFEITED: it was not revealed in time, so it counts as a loss'
          : `${OUTCOME_WORD[row.outcome ?? ''] ?? row.outcome} ${row.result != null ? (row.kind === 'setup' ? `${(row.result / 100).toFixed(2)}R` : `${(row.result / 100).toFixed(2)}%`) : ''}`
      const text = [
        `<b>${esc(agent?.name ?? `Agent ${row.agentId}`)}</b> · call #${row.chainCallId} resolved`,
        `${esc(what)}`,
        `<b>${result}</b>`,
        `Receipt: ${SITE}/calls/${row.id}`,
      ].join('\n')
      for (const chat of chats) {
        try {
          await send(chat, text)
        } catch (e) {
          l.warn(`outcome alert to ${chat} failed: ${errMsg(e)}`)
        }
      }
    }
    db.update(schema.calls).set({ resultAlertedAt: now }).where(eq(schema.calls.id, row.id)).run()
  }
}

export function startTelegram() {
  if (!TOKEN) {
    l.warn('TELEGRAM_BOT_TOKEN not set: alerts are off')
    return
  }
  const loop = async () => {
    for (;;) {
      try {
        await pollOnce()
      } catch (e) {
        l.warn(`poll: ${errMsg(e)}`)
        await new Promise(r => setTimeout(r, 5_000))
      }
    }
  }
  void loop()
  setInterval(() => alertNewCalls().catch(e => l.warn(`alerts: ${errMsg(e)}`)), 10_000)
  setInterval(() => alertOutcomes().catch(e => l.warn(`outcome alerts: ${errMsg(e)}`)), 20_000)
  l.info('telegram bot polling')
}
