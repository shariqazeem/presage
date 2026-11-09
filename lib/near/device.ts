import { NEAR_RPCS } from './config'
import type { WalletTx } from './tx'

/**
 * The built-in account: a NEAR implicit account whose key is made and kept in this browser. Nobody else,
 * ParallaxPay included, can move what's in it. Its name is the hex of its public key, so it exists on
 * NEAR the moment someone sends it NEAR. The key can be backed up, imported into any NEAR wallet, or
 * restored here on another device.
 *
 * near-api-js loads only when the account is used, so it costs nothing on the first screen.
 */

const KEY = 'parallaxpay_device_key'

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

export function storedKey(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function store(secret: string | null) {
  try {
    if (secret) localStorage.setItem(KEY, secret)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage refused (private window): the account still works until the tab closes.
  }
}

const lib = () => import('near-api-js')

/** The account name for a key: the hex of its ed25519 public key. */
export async function accountFor(secret: string): Promise<string> {
  const { KeyPair } = await lib()
  return hex(KeyPair.fromString(secret as `ed25519:${string}`).getPublicKey().data)
}

/** Makes a new key on this device and keeps it. */
export async function createKey(): Promise<{ accountId: string; secret: string }> {
  const { KeyPair } = await lib()
  const kp = KeyPair.fromRandom('ed25519')
  const secret = kp.toString()
  store(secret)
  return { accountId: hex(kp.getPublicKey().data), secret }
}

/** Restores a key backed up from another device. */
export async function importKey(secret: string): Promise<string> {
  const clean = secret.trim()
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(clean)) throw new Error('That isn’t a NEAR account key. It starts with ed25519:')
  const accountId = await accountFor(clean)
  store(clean)
  return accountId
}

export const forgetKey = () => store(null)

let cached: { secret: string; account: import('near-api-js').Account } | null = null

async function account(secret: string) {
  if (cached?.secret === secret) return cached.account
  const { Account, FailoverRpcProvider, JsonRpcProvider } = await lib()
  const provider = new FailoverRpcProvider(NEAR_RPCS.map(url => new JsonRpcProvider({ url })))
  const acc = new Account(await accountFor(secret), provider, secret as `ed25519:${string}`)
  cached = { secret, account: acc }
  return acc
}

type Outcome = { transaction?: { hash?: string }; status?: { Failure?: unknown } }

/** Signs and sends the app's transactions with this device's key, in order, stopping at the first failure. */
export async function sendWithKey(secret: string, txs: WalletTx[]): Promise<(string | null)[]> {
  const { actions } = await lib()
  const acc = await account(secret)
  const hashes: (string | null)[] = []
  for (const tx of txs) {
    const list = tx.actions.map(a => actions.functionCall(a.params.methodName, a.params.args as Record<string, unknown>, BigInt(a.params.gas), BigInt(a.params.deposit)))
    const r = (await acc.signAndSendTransaction({ receiverId: tx.receiverId, actions: list, waitUntil: 'FINAL', throwOnFailure: false })) as unknown as Outcome
    hashes.push(r.transaction?.hash ?? null)
    if (r.status && typeof r.status === 'object' && 'Failure' in r.status && r.status.Failure) throw new Error(`The transaction failed on NEAR${r.transaction?.hash ? ` (${r.transaction.hash.slice(0, 10)}…)` : ''}.`)
  }
  return hashes
}

/** Sends NEAR itself, e.g. moving out of the built-in account. */
export async function sendNear(secret: string, to: string, yocto: bigint): Promise<string | null> {
  const { actions } = await lib()
  const acc = await account(secret)
  const r = (await acc.signAndSendTransaction({ receiverId: to, actions: [actions.transfer(yocto)], waitUntil: 'FINAL', throwOnFailure: true })) as unknown as Outcome
  return r.transaction?.hash ?? null
}

/** Signs a NEP-413 message with this device's key: proof the request comes from this account, no gas. */
export async function signWithKey(secret: string, payload: { message: string; recipient: string; nonce: Uint8Array }): Promise<{ accountId: string; publicKey: string; signature: string }> {
  const { signMessage } = await import('near-api-js/nep413')
  const acc = await account(secret)
  const r = await signMessage({ signerAccount: acc, payload })
  return { accountId: r.accountId, publicKey: r.publicKey.toString(), signature: btoa(String.fromCharCode(...r.signature)) }
}
