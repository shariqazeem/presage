import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getAddress, isAddress, verifyMessage, type Hex } from 'viem'

const COOKIE = 'presage_session'
const TTL = 7 * 86_400

function secret(): string {
  const s = process.env.PRESAGE_SESSION_SECRET
  if (!s || s.length < 32) throw new Error('PRESAGE_SESSION_SECRET is missing or too short')
  return s
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url')

/** The exact text a wallet signs to sign in. The site shows it in full, so nobody signs blind. */
export function signInMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    'Sign in to Presage.',
    '',
    'This proves you own this wallet so Presage can show calls from agents you subscribe to.',
    'It does not move funds or approve anything.',
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
  ].join('\n')
}

export async function verifySignIn(address: string, message: string, signature: Hex): Promise<string> {
  if (!isAddress(address)) throw new Error('Bad address')
  const addr = getAddress(address)
  const issued = message.match(/^Issued: (.+)$/m)?.[1]
  const nonce = message.match(/^Nonce: (.+)$/m)?.[1]
  if (!issued || !nonce || message !== signInMessage(addr, nonce, issued)) throw new Error('Unexpected sign-in message')
  const age = Date.now() - Date.parse(issued)
  if (!(age >= -60_000 && age < 10 * 60_000)) throw new Error('Sign-in message expired')
  if (!(await verifyMessage({ address: addr, message, signature }))) throw new Error('Signature does not match the wallet')
  return addr.toLowerCase()
}

export async function setSession(address: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL
  const body = `${address.toLowerCase()}.${exp}`
  ;(await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL,
  })
}

export async function clearSession() {
  ;(await cookies()).delete(COOKIE)
}

/** The signed-in wallet, lowercased, or null. */
export async function viewer(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [address, exp, mac] = parts
  const expected = sign(`${address}.${exp}`)
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  if (Number(exp) < Date.now() / 1000) return null
  return address
}
