import { NextResponse, type NextRequest } from 'next/server'
import type { Hex } from 'viem'
import { clearSession, setSession, signInMessage, verifySignIn, viewer } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** GET: who is signed in, plus a fresh message to sign. POST: sign in. DELETE: sign out. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  const nonce = crypto.randomUUID()
  return NextResponse.json({
    wallet: await viewer(),
    message: address ? signInMessage(address, nonce, new Date().toISOString()) : null,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { address, message, signature } = (await req.json()) as { address: string; message: string; signature: Hex }
    const wallet = await verifySignIn(address, message, signature)
    await setSession(wallet)
    return NextResponse.json({ wallet })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sign-in failed' }, { status: 401 })
  }
}

export async function DELETE() {
  await clearSession()
  return NextResponse.json({ wallet: null })
}
