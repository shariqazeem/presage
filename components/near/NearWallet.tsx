'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { NearConnector } from '@hot-labs/near-connect'
import { NEAR_RPCS } from '@/lib/near/config'
import type { WalletTx } from '@/lib/near/tx'

/** A transaction's hash, from whatever shape the wallet returned. */
type Outcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }
const hashOf = (o: Outcome | undefined) => o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null

type NearWallet = {
  accountId: string | null
  ready: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Signs and sends, in order. Resolves with each transaction's hash. */
  send: (txs: WalletTx[]) => Promise<(string | null)[]>
}

const Ctx = createContext<NearWallet>({ accountId: null, ready: false, connect: async () => {}, disconnect: async () => {}, send: async () => [] })

/** NEAR Connect (HOT, Meteor, Intear, MyNearWallet, …), loaded in the browser only. */
export function NearWalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const get = useCallback(async () => {
    if (connector.current) return connector.current
    const { NearConnector } = await import('@hot-labs/near-connect')
    const c = new NearConnector({ network: 'mainnet', providers: { mainnet: NEAR_RPCS }, autoConnect: true })
    c.on('wallet:signIn', t => setAccountId(t.accounts[0]?.accountId ?? null))
    c.on('wallet:signOut', () => setAccountId(null))
    connector.current = c
    return c
  }, [])

  useEffect(() => {
    let alive = true
    get()
      .then(c => c.getConnectedWallet())
      .then(({ accounts }) => alive && setAccountId(accounts[0]?.accountId ?? null))
      .catch(() => {})
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [get])

  const connect = useCallback(async () => {
    const c = await get()
    const wallet = await c.connect()
    const accounts = await wallet.getAccounts()
    setAccountId(accounts[0]?.accountId ?? null)
  }, [get])

  const disconnect = useCallback(async () => {
    const c = await get()
    await c.disconnect().catch(() => {})
    setAccountId(null)
  }, [get])

  const send = useCallback(
    async (txs: WalletTx[]) => {
      const c = await get()
      const wallet = await c.wallet()
      if (txs.length === 1) return [hashOf((await wallet.signAndSendTransaction(txs[0])) as Outcome)]
      const out = (await wallet.signAndSendTransactions({ transactions: txs })) as Outcome[]
      return out.map(hashOf)
    },
    [get],
  )

  return <Ctx.Provider value={{ accountId, ready, connect, disconnect, send }}>{children}</Ctx.Provider>
}

export const useNear = () => useContext(Ctx)
