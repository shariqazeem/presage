// Self-test for pings: send one real, encrypted Web Push message to a local endpoint and check it
// arrives with VAPID auth. Run against a throwaway database: PRESAGE_DB_PATH=/tmp/x.db npx tsx scripts/ping-selftest.ts
import './../engine/env'
import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { createECDH, randomBytes } from 'node:crypto'
import { getDb, schema } from '../lib/db'
import { notifyWatchers } from '../engine/pings'

const got: { headers: Record<string, unknown>; bytes: number }[] = []
// TLS with a throwaway self-signed certificate: PING_TEST_TLS=<dir with key.pem and cert.pem>, NODE_TLS_REJECT_UNAUTHORIZED=0
const tls = process.env.PING_TEST_TLS ?? '.'
const server = createServer({ key: readFileSync(`${tls}/key.pem`), cert: readFileSync(`${tls}/cert.pem`) }, (req, res) => {
  let n = 0
  req.on('data', c => (n += c.length))
  req.on('end', () => {
    got.push({ headers: req.headers, bytes: n })
    res.writeHead(201).end()
  })
})
await new Promise<void>(r => server.listen(9911, '127.0.0.1', () => r()))

const ecdh = createECDH('prime256v1')
ecdh.generateKeys()
const endpoint = `https://127.0.0.1:9911/push/${randomBytes(6).toString('hex')}`
const db = getDb()
const now = Math.floor(Date.now() / 1000)
db.insert(schema.pushSubs).values({ endpoint, p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url'), createdAt: now }).run()
db.insert(schema.watches).values({ channel: 'push', address: endpoint, target: 'call', targetId: 999_001, createdAt: now }).run()

await notifyWatchers(1, 'resolved', { callId: 999_001, chainCallId: 7, symbol: 'METIS', outcome: 'win', result: 103, kind: 'direction' })
server.close()
const w = db.select().from(schema.watches).all().find(x => x.address === endpoint)
console.log(JSON.stringify({ delivered: got.length, encoding: got[0]?.headers['content-encoding'], vapid: String(got[0]?.headers.authorization ?? '').startsWith('vapid t='), bytes: got[0]?.bytes, watchDone: Boolean(w?.doneAt) }))
process.exit(got.length === 1 ? 0 : 1)
