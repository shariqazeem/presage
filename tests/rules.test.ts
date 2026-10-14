import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSetup, resolveDirection } from '../lib/calls/rules'
import { commitmentOf, serializePayload, type SetupPayload, type DirectionPayload } from '../lib/calls/payload'

const T0 = 1_760_000_400 // a 15-minute boundary
const k = (i: number, o: number, h: number, l: number, c: number) => ({ ts: (T0 + i * 900) * 1000, o, h, l, c, v: 1 })

const setup = (over: Partial<SetupPayload> = {}): SetupPayload => ({
  v: 1,
  rules: 'presage/setup-v1',
  agent: 7,
  asset: { symbol: 'TEST', source: 'binance', market: 'TESTUSDT' },
  side: 'long',
  entry: { type: 'limit', price: 100 },
  stop: 95,
  target: 110,
  conviction: 4,
  issuedAt: T0,
  priceAtIssue: 102,
  fillBy: T0 + 86_400,
  maxHoldSec: 172_800,
  why: [],
  ...over,
})

const later = T0 + 10 * 86_400

test('limit fills, then target: win at +2R', () => {
  const r = resolveSetup(setup(), [k(0, 102, 103, 99.5, 101), k(1, 101, 111, 100.5, 109)], T0, later)
  assert.equal(r?.outcome, 'win')
  assert.equal(r?.result, 200)
})

test('stop and target in one candle counts as a loss', () => {
  const r = resolveSetup(setup(), [k(0, 102, 103, 99.5, 101), k(1, 101, 112, 94, 100)], T0, later)
  assert.equal(r?.outcome, 'loss')
  assert.equal(r?.result, -100)
})

test('fill and stop in the same candle is a loss', () => {
  const r = resolveSetup(setup(), [k(0, 102, 103, 94, 96)], T0, later)
  assert.equal(r?.outcome, 'loss')
})

test('target touched in the fill candle is ignored', () => {
  const r = resolveSetup(setup(), [k(0, 102, 111, 99, 101)], T0, T0 + 900 * 2)
  assert.equal(r, null)
})

test('never filled before the deadline is a no-fill', () => {
  const candles = Array.from({ length: 100 }, (_, i) => k(i, 103, 104, 101, 103))
  const r = resolveSetup(setup(), candles, T0, later)
  assert.equal(r?.outcome, 'nofill')
  assert.equal(r?.result, 0)
})

test('hold window ends flat at the close with partial R', () => {
  const p = setup({ maxHoldSec: 3600 })
  const candles = [k(0, 102, 102, 99, 100), k(1, 100, 101, 99, 100), k(2, 100, 101, 99, 100), k(3, 100, 103, 100, 102.5), k(4, 102.5, 104, 101, 103)]
  const r = resolveSetup(p, candles, T0, later)
  assert.equal(r?.outcome, 'flat')
  assert.equal(r?.result, 50)
})

test('candles before the seal do not count', () => {
  const r = resolveSetup(setup(), [k(0, 102, 120, 99, 101)], T0 + 900, later)
  assert.equal(r, null)
})

test('a forming candle is not used', () => {
  const r = resolveSetup(setup({ entry: { type: 'market', price: 102 } }), [k(0, 102, 120, 101, 118)], T0, T0 + 600)
  assert.equal(r, null)
})

test('market entry fills at the issue price', () => {
  const r = resolveSetup(setup({ entry: { type: 'market', price: 102 }, stop: 97, target: 112 }), [k(0, 102, 112.5, 101, 112)], T0, later)
  assert.equal(r?.outcome, 'win')
  assert.equal(r?.result, 200)
})

const direction = (over: Partial<DirectionPayload> = {}): DirectionPayload => ({
  v: 1,
  rules: 'presage/direction-v1',
  agent: 1,
  asset: { symbol: 'BTC', source: 'binance', market: 'BTCUSDT' },
  direction: 'up',
  confidence: 60,
  horizonSec: 3600,
  issuedAt: T0,
  priceAtIssue: 100_000,
  flatBandBps: 10,
  why: '',
  models: [],
  ...over,
})

test('direction: up call, price up 0.5% is a win of 50bps', () => {
  const r = resolveDirection(direction(), 100_500)
  assert.equal(r.outcome, 'win')
  assert.equal(r.result, 50)
})

test('direction: down call, price up is a loss', () => {
  const r = resolveDirection(direction({ direction: 'down' }), 100_500)
  assert.equal(r.outcome, 'loss')
  assert.equal(r.result, -50)
})

test('direction: inside the band is flat', () => {
  assert.equal(resolveDirection(direction(), 100_050).outcome, 'flat')
})

test('commitment matches Solidity keccak256(abi.encodePacked(salt, payload))', () => {
  // Same salt and payload as contracts/test/Presage.t.sol; expected value computed with Foundry's cast.
  const salt = '0xa05e334153147e75f3f416139b5109d1179cb56fef6a4ecb4c4cbc92a7c37b70' as const
  const json = '{"v":1,"asset":"BTC","side":"long","entry":61250,"stop":60400,"target":63100}'
  assert.equal(commitmentOf(salt, json), '0x851924963793c71bff1c04d0156a920205e82c6575cf65b667b55a41c0bbf286')
})
