import { concat, hexToBytes, keccak256, stringToBytes, toHex, type Hex } from 'viem'
import type { AssetRef } from '../market/types'

/** A trade setup: entry, stop and target. ST Quant and creator agents publish these. */
export type SetupPayload = {
  v: 1
  rules: 'presage/setup-v1'
  agent: number
  asset: AssetRef
  side: 'long'
  entry: { type: 'market' | 'limit'; price: number }
  stop: number
  target: number
  /** ST Quant's 1-5 grade. Creator agents don't grade setups, so they leave it out. */
  conviction?: number
  issuedAt: number
  priceAtIssue: number
  /** A limit entry that has not filled by this time is a no-fill. */
  fillBy: number
  /** After the fill, the call closes at the candle close once this long has passed. */
  maxHoldSec: number
  why: string[]
}

/** A direction call: up or down over a horizon. The Oracle publishes these. */
export type DirectionPayload = {
  v: 1
  rules: 'presage/direction-v1'
  agent: number
  asset: AssetRef
  direction: 'up' | 'down'
  confidence: number
  horizonSec: number
  issuedAt: number
  priceAtIssue: number
  /** Moves smaller than this (in basis points) count as flat, neither right nor wrong. */
  flatBandBps: number
  /** The reason in one plain sentence. */
  why: string
  /** The facts behind it, in the market's own terms. Calls sealed before 17 Oct 2026 put these in `why`. */
  detail?: string
  models: { model: string; direction: 'up' | 'down'; confidence: number }[]
  /** The paid request this call answers, when it was bought. */
  request?: Hex
  /** The asker's own call, made before the Oracle answered and sealed with it. */
  asker?: { direction: 'up' | 'down' }
}

export type CallPayload = SetupPayload | DirectionPayload

/** The exact bytes that get sealed. Stored as-is and revealed as-is, never re-serialised. */
export const serializePayload = (p: CallPayload): string => JSON.stringify(p)

export function newSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/** Matches PresageCalls: keccak256(abi.encodePacked(bytes32 salt, bytes payload)). */
export function commitmentOf(salt: Hex, payloadJson: string): Hex {
  return keccak256(concat([hexToBytes(salt), stringToBytes(payloadJson)]))
}

export function parsePayload(json: string): CallPayload {
  const p = JSON.parse(json) as CallPayload
  if (p.v !== 1 || (p.rules !== 'presage/setup-v1' && p.rules !== 'presage/direction-v1')) {
    throw new Error('Unknown call format')
  }
  return p
}
