import { FailoverRpcProvider, JsonRpcProvider } from 'near-api-js'
import { verifyMessage } from 'near-api-js/nep413'
import { NEAR_RPCS } from './config'
import type { StrategyIntent } from './strategy'

/**
 * Changes to a member's agent are signed with their own account (a NEP-413 message, no gas): the key must
 * be a full-access key of the account, the message must be for ParallaxPay, name that account and action,
 * be at most five minutes old, and never be used twice.
 */

export const RECIPIENT = 'parallaxpay'
const FRESH_SEC = 5 * 60

export type SignedIntent = { accountId: string; publicKey: string; signature: string; nonce: string; message: string }

const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
const used = new Map<string, number>()

let provider: FailoverRpcProvider | null = null
const rpc = () => (provider ??= new FailoverRpcProvider(NEAR_RPCS.map(url => new JsonRpcProvider({ url }))))

export class SignatureError extends Error {}

export async function verifyIntent(s: SignedIntent | undefined, action: StrategyIntent['action']): Promise<StrategyIntent> {
  if (!s || typeof s.message !== 'string' || typeof s.signature !== 'string' || typeof s.nonce !== 'string' || typeof s.publicKey !== 'string' || typeof s.accountId !== 'string') throw new SignatureError('Sign this with your account first.')
  let intent: StrategyIntent
  try {
    intent = JSON.parse(s.message) as StrategyIntent
  } catch {
    throw new SignatureError('That message isn’t one ParallaxPay asked for.')
  }
  const now = Math.floor(Date.now() / 1000)
  if (intent.app !== 'parallaxpay' || intent.action !== action || intent.account !== s.accountId) throw new SignatureError('That signature is for something else.')
  if (!(Math.abs(now - intent.at) <= FRESH_SEC)) throw new SignatureError('That signature has expired. Sign again.')
  for (const [k, at] of used) if (now - at > FRESH_SEC * 2) used.delete(k)
  if (used.has(s.signature)) throw new SignatureError('That signature was already used.')
  const nonce = fromB64(s.nonce)
  if (nonce.length !== 32) throw new SignatureError('Bad signature nonce.')
  try {
    await verifyMessage({ signerAccountId: s.accountId, signerPublicKey: s.publicKey, payload: { message: s.message, recipient: RECIPIENT, nonce }, signature: fromB64(s.signature), provider: rpc() })
  } catch (e) {
    throw new SignatureError(e instanceof Error && /FullAccess/.test(e.message) ? 'Sign with the account’s own wallet key.' : 'The signature didn’t check out.')
  }
  used.set(s.signature, now)
  return intent
}
