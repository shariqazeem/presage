'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { NearConnector } from '@hot-labs/near-connect'
import { NEAR_RPCS } from '@/lib/near/config'
import { accountFor, createKey, forgetKey, importKey, sendWithKey, storedKey } from '@/lib/near/device'
import type { WalletTx } from '@/lib/near/tx'

/** A transaction's hash, from whatever shape the wallet returned. */
type Outcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }
const hashOf = (o: Outcome | undefined) => o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null

/** Which account the app acts as: a connected wallet, or the built-in account on this device. */
export type AccountKind = 'wallet' | 'device'
const KIND = 'parallaxpay_account_kind'

type NearWallet = {
  accountId: string | null
  kind: AccountKind | null
  ready: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Signs and sends, in order. Resolves with each transaction's hash. */
  send: (txs: WalletTx[]) => Promise<(string | null)[]>
  /** Makes the built-in account on this device and switches to it. */
  createDevice: () => Promise<string>
  /** Restores a built-in account from its backed-up key. */
  importDevice: (secret: string) => Promise<string>
  /** Removes the built-in account's key from this device. Only after it's backed up. */
  forgetDevice: () => void
  /** The built-in account's key, for backing it up. */
  deviceSecret: () => string | null
}

const Ctx = createContext<NearWallet>({
  accountId: null,
  kind: null,
  ready: false,
  connect: async () => {},
  disconnect: async () => {},
  send: async () => [],
  createDevice: async () => '',
  importDevice: async () => '',
  forgetDevice: () => {},
  deviceSecret: () => null,
})

function savedKind(): AccountKind | null {
  try {
    const k = localStorage.getItem(KIND)
    return k === 'wallet' || k === 'device' ? k : null
  } catch {
    return null
  }
}

function saveKind(k: AccountKind | null) {
  try {
    if (k) localStorage.setItem(KIND, k)
    else localStorage.removeItem(KIND)
  } catch {}
}

/** NEAR Connect (HOT, Meteor, Intear, MyNearWallet, …), loaded in the browser only, or the built-in account. */
export function NearWalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [device, setDevice] = useState<{ secret: string; accountId: string } | null>(null)
  const [kind, setKind] = useState<AccountKind | null>(null)
  const [ready, setReady] = useState(false)

  const get = useCallback(async () => {
    if (connector.current) return connector.current
    const { NearConnector } = await import('@hot-labs/near-connect')
    const c = new NearConnector({ network: 'mainnet', providers: { mainnet: NEAR_RPCS }, autoConnect: true })
    c.on('wallet:signIn', t => setWalletId(t.accounts[0]?.accountId ?? null))
    c.on('wallet:signOut', () => setWalletId(null))
    connector.current = c
    return c
  }, [])

  useEffect(() => {
    let alive = true
    const secret = storedKey()
    const pref = savedKind()
    const deviceReady = secret
      ? accountFor(secret)
          .then(accountId => alive && setDevice({ secret, accountId }))
          .catch(() => {})
      : Promise.resolve()
    const walletReady = get()
      .then(c => c.getConnectedWallet())
      .then(({ accounts }) => alive && setWalletId(accounts[0]?.accountId ?? null))
      .catch(() => {})
    void Promise.all([deviceReady, walletReady]).finally(() => {
      if (!alive) return
      setKind(pref ?? (secret ? 'device' : 'wallet'))
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [get])

  const connect = useCallback(async () => {
    const c = await get()
    const wallet = await c.connect()
    const accounts = await wallet.getAccounts()
    setWalletId(accounts[0]?.accountId ?? null)
    setKind('wallet')
    saveKind('wallet')
  }, [get])

  const disconnect = useCallback(async () => {
    if (kind === 'device') {
      // The key stays on this device; the app just stops acting as it.
      setKind('wallet')
      saveKind('wallet')
      return
    }
    const c = await get()
    await c.disconnect().catch(() => {})
    setWalletId(null)
  }, [get, kind])

  const send = useCallback(
    async (txs: WalletTx[]) => {
      if (kind === 'device' && device) return sendWithKey(device.secret, txs)
      const c = await get()
      const wallet = await c.wallet()
      if (txs.length === 1) return [hashOf((await wallet.signAndSendTransaction(txs[0])) as Outcome)]
      const out = (await wallet.signAndSendTransactions({ transactions: txs })) as Outcome[]
      return out.map(hashOf)
    },
    [get, kind, device],
  )

  const createDevice = useCallback(async () => {
    const existing = storedKey()
    const made = existing ? { secret: existing, accountId: await accountFor(existing) } : await createKey()
    setDevice({ secret: made.secret, accountId: made.accountId })
    setKind('device')
    saveKind('device')
    return made.accountId
  }, [])

  const importDevice = useCallback(async (secret: string) => {
    const accountId = await importKey(secret)
    setDevice({ secret: secret.trim(), accountId })
    setKind('device')
    saveKind('device')
    return accountId
  }, [])

  const forgetDevice = useCallback(() => {
    forgetKey()
    setDevice(null)
    setKind('wallet')
    saveKind('wallet')
  }, [])

  const deviceSecret = useCallback(() => device?.secret ?? null, [device])

  const accountId = kind === 'device' ? (device?.accountId ?? null) : walletId
  return <Ctx.Provider value={{ accountId, kind: accountId ? kind : null, ready, connect, disconnect, send, createDevice, importDevice, forgetDevice, deviceSecret }}>{children}</Ctx.Provider>
}

export const useNear = () => useContext(Ctx)

/** A long implicit account name, shortened for display: 4f2a…9c1b. */
export const shortAccount = (id: string | null | undefined) => (id && /^[0-9a-f]{64}$/.test(id) ? `${id.slice(0, 4)}…${id.slice(-4)}` : (id ?? ''))
