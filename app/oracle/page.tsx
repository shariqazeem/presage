'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { erc20Abi, formatUnits, type Address, type Hex } from 'viem'
import { useAccount, useBalance, usePublicClient, useWriteContract } from 'wagmi'
import { UnifiedNavbar } from '@/components/UnifiedNavbar'
import { CoinSelector } from '@/components/CoinSelector'
import { WalletButton } from '@/components/WalletButton'
import { FEATURED_COINS, TOTAL_SUPPORTED_COINS } from '@/lib/crypto-database'
import { presageMarketAbi } from '@/lib/abi/PresageMarket'
import { deployment, payTokens, txUrl } from '@/lib/chain'
import { HORIZONS, type Horizon } from '@/lib/oracle'
import { useAgent, useTelegramLink } from '@/lib/client/hooks'
import { ago, bps, OUTCOME_STYLE, pct, price, until, when } from '@/lib/client/format'

type Accept = {
  scheme: string
  network: string
  maxAmountRequired: string
  payTo: Address
  asset: Address
  extra: { agentId: number; requestId: Hex; symbol: string; decimals: number; native: boolean }
}
type Answer = {
  requestId: Hex
  status: string
  asset: string
  horizon: string
  payTx: string | null
  error: string | null
  call: null | {
    id: number
    chainCallId: number | null
    status: string
    sealTx: string | null
    sealTxUrl: string | null
    sealedAt: number | null
    revealBy: number
    outcome: string | null
    result: number | null
    asset: string
    market: string | null
    direction: 'up' | 'down'
    confidence: number
    horizonSec: number
    priceAtIssue: number
    issuedAt: number
    flatBandBps: number
    why: string
    models: { model: string; direction: 'up' | 'down'; confidence: number }[]
    receipt: string
  }
}
type Stage = 'idle' | 'quoting' | 'approving' | 'paying' | 'sealing' | 'done'
type Saved = { requestId: Hex; secret: string; asset: string; horizon: string; at: number }

const STAGES: { key: Stage; icon: string; label: string }[] = [
  { key: 'quoting', icon: '🧾', label: 'Getting the x402 quote' },
  { key: 'paying', icon: '💸', label: 'Paying into escrow' },
  { key: 'sealing', icon: '🔒', label: 'Reading the market and sealing on Metis' },
  { key: 'done', icon: '✅', label: 'Sealed. Scored when the horizon ends' },
]

const historyKey = (a?: string) => `presage_oracle_history_${a?.toLowerCase() ?? 'anon'}`

export default function OraclePage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { data: oracle } = useAgent('oracle')
  const [selectedCoin, setSelectedCoin] = useState('BTC')
  const [horizon, setHorizon] = useState<Horizon>('4h')
  const [token, setToken] = useState(payTokens[0].symbol)
  const [stage, setStage] = useState<Stage>('idle')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [history, setHistory] = useState<(Saved & { answer?: Answer })[]>([])
  const [showScoring, setShowScoring] = useState(false)
  const [quote, setQuote] = useState<string | null>(null)
  const openTelegram = useTelegramLink()

  const payToken = payTokens.find(t => t.symbol === token) ?? payTokens[0]
  const { data: balance } = useBalance({ address, token: payToken.native ? undefined : payToken.address, query: { enabled: Boolean(address) } })
  const busy = stage !== 'idle' && stage !== 'done'
  const record = oracle?.agent.record

  // Restore this wallet's past questions and fetch their answers.
  useEffect(() => {
    let saved: Saved[] = []
    try {
      saved = JSON.parse(localStorage.getItem(historyKey(address)) ?? '[]')
    } catch {}
    setHistory(saved)
    Promise.all(
      saved.slice(0, 12).map(async s => {
        try {
          const r = await fetch(`/api/oracle/call/${s.requestId}?secret=${encodeURIComponent(s.secret)}`)
          return { ...s, answer: r.ok ? ((await r.json()) as Answer) : undefined }
        } catch {
          return s
        }
      }),
    ).then(setHistory)
  }, [address, answer])

  const save = (s: Saved) => {
    try {
      const prev: Saved[] = JSON.parse(localStorage.getItem(historyKey(address)) ?? '[]')
      localStorage.setItem(historyKey(address), JSON.stringify([s, ...prev].slice(0, 50)))
    } catch {}
  }

  const ask = async () => {
    if (!isConnected || !address || !publicClient) return toast.error('Connect a Metis wallet to pay for a call')
    setAnswer(null)
    try {
      // 1. Ask without paying: the server answers 402 with x402 payment requirements.
      setStage('quoting')
      const r = await fetch('/api/oracle/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ asset: selectedCoin, horizon, wallet: address }),
      })
      const q = await r.json()
      if (r.status !== 402) throw new Error(q.error ?? 'The Oracle did not return a quote')
      const req: Accept | undefined = q.accepts.find((a: Accept) => a.extra.symbol === payToken.symbol)
      if (!req) throw new Error(`${payToken.symbol} is not accepted right now; try another token`)
      const amount = BigInt(req.maxAmountRequired)
      setQuote(`${formatUnits(amount, req.extra.decimals)} ${req.extra.symbol}`)

      // 2. Pay from this wallet into PresageMarket's escrow.
      if (!req.extra.native) {
        const allowance = await publicClient.readContract({ address: req.asset, abi: erc20Abi, functionName: 'allowance', args: [address, req.payTo] })
        if (allowance < amount) {
          setStage('approving')
          toast('Approve once for 20 calls, so the next ones need a single signature', { icon: '🔓' })
          const h = await writeContractAsync({ address: req.asset, abi: erc20Abi, functionName: 'approve', args: [req.payTo, amount * 20n] })
          await publicClient.waitForTransactionReceipt({ hash: h })
        }
      }
      setStage('paying')
      const maxAmount = req.extra.native ? (amount * 101n) / 100n : amount // 1% room for the METIS price to move; the excess is refunded
      const txHash = await writeContractAsync({
        address: req.payTo,
        abi: presageMarketAbi,
        functionName: 'payForCall',
        args: [BigInt(req.extra.agentId), req.extra.requestId, req.asset, maxAmount],
        value: req.extra.native ? maxAmount : 0n,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      save({ requestId: req.extra.requestId, secret: q.secret, asset: selectedCoin, horizon, at: Date.now() })

      // 3. Retry with the payment proof in X-PAYMENT and wait for the sealed answer.
      setStage('sealing')
      const header = btoa(JSON.stringify({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { requestId: req.extra.requestId, txHash } }))
      let res = await fetch('/api/oracle/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-PAYMENT': header },
        body: JSON.stringify({ secret: q.secret }),
      })
      let ans = (await res.json()) as Answer
      for (let i = 0; i < 30 && res.status === 202; i++) {
        await new Promise(r => setTimeout(r, 2000))
        res = await fetch(`/api/oracle/call/${req.extra.requestId}?secret=${encodeURIComponent(q.secret)}`)
        ans = await res.json()
        if (ans.call || ans.status === 'failed') break
      }
      if (!ans.call) throw new Error(ans.error ?? 'The call was not sealed. If it is not sealed within 15 minutes, your payment is refunded from escrow.')
      setAnswer(ans)
      setStage('done')
      toast.success(`${selectedCoin} call sealed on Metis`)
    } catch (e) {
      setStage('idle')
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Something went wrong'
      toast.error(msg.includes('User rejected') ? 'Payment cancelled' : msg)
    }
  }

  // Undelivered after 15 minutes, or forfeited: the payer takes the money back from escrow themselves.
  const refund = async (requestId: Hex) => {
    if (!publicClient || !deployment) return
    try {
      const r = await publicClient.readContract({ address: deployment.market, abi: presageMarketAbi, functionName: 'getRequest', args: [requestId] })
      if (r.state === 1) {
        const h = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'refundUndelivered', args: [requestId] })
        await publicClient.waitForTransactionReceipt({ hash: h })
      } else if (r.state === 2) {
        const h = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'settle', args: [requestId] })
        await publicClient.waitForTransactionReceipt({ hash: h })
      }
      const h2 = await writeContractAsync({ address: deployment.market, abi: presageMarketAbi, functionName: 'claim', args: [r.token] })
      await publicClient.waitForTransactionReceipt({ hash: h2 })
      toast.success('Refunded to your wallet')
      setAnswer(a => (a ? { ...a } : a))
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Refund failed'
      toast.error(msg.includes('DeliveryWindowOpen') ? 'Wait 15 minutes after paying before refunding' : msg.includes('User rejected') ? 'Cancelled' : msg)
    }
  }

  const c = answer?.call
  const ups = c?.models.filter(m => m.direction === 'up').length ?? 0
  const agreement = c ? Math.round(((c.direction === 'up' ? ups : c.models.length - ups) / c.models.length) * 100) : 0
  const stageIndex = STAGES.findIndex(s => s.key === stage || (stage === 'approving' && s.key === 'paying'))

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar currentPage="oracle" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-5xl font-black text-black">Market Oracle</h1>
                <motion.div animate={{ rotate: busy ? 360 : 0 }} transition={{ duration: 2, repeat: busy ? Infinity : 0, ease: 'linear' }} className="text-4xl">
                  🔮
                </motion.div>
              </div>
              <p className="text-xl text-gray-600">
                <strong>{TOTAL_SUPPORTED_COINS} coins</strong> • sealed on Metis • $0.05 a call over x402
              </p>
            </div>

            <div className={`px-6 py-3 rounded-2xl border-2 ${busy ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300'}`}>
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ scale: busy ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 1, repeat: busy ? Infinity : 0 }}
                  className={`w-3 h-3 rounded-full ${busy ? 'bg-green-500' : 'bg-gray-400'}`}
                />
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase">Record</div>
                  <div className="text-lg font-black text-black">
                    {record ? `${record.resolved} scored · ${pct(record.hitRate, 0)} hit` : 'Starting'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 rounded-2xl p-6 text-white shadow-xl mb-6"
          >
            <div className="flex items-center gap-4">
              <div className="text-5xl">🔮</div>
              <div className="flex-1">
                <h3 className="text-2xl font-black mb-1">Up or down, sealed before it happens</h3>
                <p className="text-purple-100">
                  Ask which way a coin goes over the next hour, four hours or day. A quant model and several AI models vote on facts from public
                  Binance candles. <strong className="text-white">The answer is sealed on Metis before the horizon starts</strong> and scored against
                  the price when it ends. Your payment sits in escrow until then, and comes back if the call is never revealed.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Coin ({TOTAL_SUPPORTED_COINS} covered)</label>
              <CoinSelector selectedCoin={selectedCoin} onSelectCoin={setSelectedCoin} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Horizon</label>
              <div className="flex gap-2">
                {(Object.keys(HORIZONS) as Horizon[]).map(h => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all ${
                      horizon === h ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="text-sm font-bold text-gray-700 mb-2">Quick access</div>
            <div className="flex flex-wrap gap-2">
              {FEATURED_COINS.map(coin => (
                <button
                  key={coin}
                  onClick={() => setSelectedCoin(coin)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${
                    selectedCoin === coin
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-purple-400'
                  }`}
                >
                  {coin}
                </button>
              ))}
            </div>
          </div>

          {/* Payment panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`mt-6 rounded-2xl p-6 border-2 ${isConnected ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'} shadow-lg`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-black mb-1">
                  {isConnected ? `Pay $0.05 in ${payToken.symbol}${quote && quote.endsWith(payToken.symbol) ? ` (${quote})` : ''}` : 'Connect a Metis wallet to ask'}
                </h3>
                <p className="text-sm text-gray-700">
                  {isConnected
                    ? `Your wallet pays PresageMarket on Metis Andromeda directly. Balance: ${balance ? `${Number(formatUnits(balance.value, balance.decimals)).toFixed(4)} ${payToken.symbol}` : '…'}`
                    : 'Payments are x402: one transaction from your own wallet, held in escrow until the call is revealed.'}
                </p>
              </div>
              {isConnected ? (
                <div className="flex gap-2">
                  {payTokens.map(t => (
                    <button
                      key={t.symbol}
                      onClick={() => setToken(t.symbol)}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        token === t.symbol ? 'bg-black text-white' : 'bg-white border border-gray-300 text-gray-700 hover:border-black'
                      }`}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
              ) : (
                <WalletButton />
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Control panel */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={ask}
            disabled={busy || !isConnected}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="text-4xl mb-3">{busy ? '⏳' : '🎯'}</div>
            <div className="text-xl font-black mb-1">{busy ? `Asking about ${selectedCoin}…` : `Ask about ${selectedCoin}`}</div>
            <div className="text-sm text-blue-100">{!isConnected ? '⚠️ Connect a wallet first' : `${HORIZONS[horizon].label} • $0.05 in ${payToken.symbol}`}</div>
          </motion.button>

          <Link href="/agents/oracle" className="block">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all"
            >
              <div className="text-4xl mb-3">📜</div>
              <div className="text-xl font-black mb-1">See every call</div>
              <div className="text-sm text-green-100">Wins, losses and flats, each linked to its seal on Metis</div>
            </motion.div>
          </Link>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowScoring(!showScoring)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all text-left"
          >
            <div className="text-4xl mb-3">⚖️</div>
            <div className="text-xl font-black mb-1">How it is scored</div>
            <div className="text-sm text-purple-100">The rules, and why nobody can edit a call</div>
          </motion.button>
        </div>

        <AnimatePresence>
          {showScoring && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mb-8 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border-2 border-purple-300 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-black text-black">⚖️ How a call is scored</h2>
                <button onClick={() => setShowScoring(false)} className="text-gray-500 hover:text-black text-2xl">
                  ×
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
                  <div className="text-2xl mb-3">🔒</div>
                  <h3 className="text-xl font-black text-black mb-2">Sealed first</h3>
                  <ul className="text-sm text-gray-700 space-y-2">
                    <li>✓ The answer is hashed and written to Metis before the horizon starts.</li>
                    <li>✓ Nobody can read it early or change it later: the reveal must match the hash.</li>
                    <li>✓ If it is not revealed in time, anyone can forfeit it, it counts as a loss, and you are refunded.</li>
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-6 border-2 border-green-300">
                  <div className="text-2xl mb-3">📏</div>
                  <h3 className="text-xl font-black text-black mb-2">Scored by price</h3>
                  <ul className="text-sm text-gray-700 space-y-2">
                    <li>✓ Measured from the price at issue to the Binance 1-minute close when the horizon ends.</li>
                    <li>✓ A move inside the flat band ({HORIZONS[horizon].flatBandBps / 100}% for {horizon}) is flat: neither right nor wrong.</li>
                    <li>✓ Hit rate is wins over wins, losses and forfeits. Anyone can recompute it from the reveals.</li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 text-center text-sm text-gray-600">
                Not financial advice. The Oracle is an AI forecast with a public record, losses included.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress */}
        <AnimatePresence>
          {stage !== 'idle' && stage !== 'done' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-8 bg-white rounded-2xl p-6 border-2 border-blue-200 shadow-lg">
              <div className="grid md:grid-cols-4 gap-4">
                {STAGES.map((s, i) => (
                  <div key={s.key} className={`rounded-xl p-4 border-2 ${i < stageIndex ? 'bg-green-50 border-green-300' : i === stageIndex ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="text-2xl mb-1">{i < stageIndex ? '✅' : i === stageIndex ? <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}>{s.icon}</motion.span> : s.icon}</div>
                    <div className="text-sm font-bold text-black">{stage === 'approving' && s.key === 'paying' ? 'Approving the token once' : s.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Oracle's record */}
        {record && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { icon: '🔒', value: record.calls, label: 'Calls sealed', border: 'border-gray-200', color: 'text-black' },
              { icon: '🎯', value: pct(record.hitRate), label: 'Hit rate', border: 'border-gray-200', color: 'text-black' },
              { icon: '📏', value: record.avgResult == null ? '—' : bps(Math.round(record.avgResult)), label: 'Avg move called', border: 'border-blue-200', color: (record.avgResult ?? 0) < 0 ? 'text-red-600' : 'text-blue-600' },
              { icon: '⏳', value: record.open, label: 'Open now', border: 'border-purple-200', color: 'text-purple-600' },
              { icon: '🚫', value: record.forfeited, label: 'Forfeited', border: 'border-red-200', color: 'text-red-600' },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={`bg-white rounded-2xl p-6 border-2 ${s.border} shadow-lg`}>
                <div className="text-3xl mb-2">{s.icon}</div>
                <div className={`text-4xl font-black ${s.color} mb-1`}>{s.value}</div>
                <div className="text-sm text-gray-600 font-semibold">{s.label}</div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Latest answer */}
        <AnimatePresence mode="wait">
          {c && (
            <motion.div key={c.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="mb-8">
              <h2 className="text-2xl font-black text-black mb-4">Your call</h2>
              <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 shadow-xl">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="text-6xl">{c.direction === 'up' ? '📈' : '📉'}</div>
                      <div>
                        <div className="text-sm text-gray-500 font-semibold">{when(c.issuedAt)}</div>
                        <div className="text-4xl font-black text-black">
                          {c.asset} {c.direction.toUpperCase()}
                        </div>
                        <div className="text-xl text-gray-600">
                          ${price(c.priceAtIssue)} • next {c.horizonSec / 3600}h
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="text-sm text-gray-600 font-semibold mb-1">Models agreeing</div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${agreement}%` }} className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" />
                          </div>
                          <div className="text-2xl font-black text-black">{agreement}%</div>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="text-sm text-gray-600 font-semibold mb-1">Confidence</div>
                        <div className="text-2xl font-black text-black">{c.confidence}%</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="text-sm text-gray-600 font-semibold mb-2">Why</div>
                        <div className="text-sm text-gray-700 leading-relaxed">{c.why}</div>
                      </div>
                      {c.outcome && (
                        <div className={`rounded-xl p-4 border-2 ${c.outcome === 'win' ? 'bg-green-50 border-green-400' : c.outcome === 'loss' ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-300'}`}>
                          <div className="flex items-center gap-3">
                            <div className="text-3xl">{OUTCOME_STYLE[c.outcome]?.emoji}</div>
                            <div>
                              <div className="text-sm font-semibold text-gray-700">Outcome</div>
                              <div className="text-xl font-black text-black">
                                {OUTCOME_STYLE[c.outcome]?.label} • {bps(c.result)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-black mb-4">🤖 The vote ({c.models.length} models)</h3>
                    <div className="space-y-3">
                      {c.models.map((m, idx) => (
                        <motion.div key={m.model} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }} className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-black text-sm">{m.model}</div>
                            <div className="flex items-center gap-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${m.direction === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.direction.toUpperCase()}</span>
                              <span className="text-xs text-gray-500">{m.confidence}%</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4 border-2 border-blue-200">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-2xl">🔒</div>
                        <div className="text-sm text-blue-700 font-semibold">Sealed on Metis • call #{c.chainCallId}</div>
                      </div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>
                          Seal:{' '}
                          {c.sealTxUrl ? (
                            <a href={c.sealTxUrl} target="_blank" rel="noreferrer" className="font-mono text-blue-700 underline">
                              {c.sealTx?.slice(0, 10)}…
                            </a>
                          ) : (
                            '…'
                          )}
                        </div>
                        <div>Scored in {until(c.issuedAt + c.horizonSec)} • must be revealed by {when(c.revealBy)}</div>
                        {answer?.payTx && (
                          <div>
                            Payment in escrow:{' '}
                            <a href={txUrl(answer.payTx)} target="_blank" rel="noreferrer" className="font-mono text-blue-700 underline">
                              {answer.payTx.slice(0, 10)}…
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <Link href={c.receipt}>
                      <button className="mt-4 w-full bg-black text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all">Open the receipt →</button>
                    </Link>
                    <button
                      onClick={() => openTelegram().catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))}
                      className="mt-2 w-full border-2 border-blue-200 text-blue-700 px-4 py-3 rounded-xl font-bold hover:bg-blue-50 hover:border-blue-400 transition-all"
                    >
                      ✈️ Tell me the outcome on Telegram
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Your history */}
        {history.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-black text-black mb-4">Your questions</h2>
            <div className="space-y-3">
              {history.slice(0, 12).map((h, idx) => {
                const hc = h.answer?.call
                const style = hc ? (hc.outcome ? OUTCOME_STYLE[hc.outcome] : OUTCOME_STYLE.sealed) : null
                return (
                  <motion.div key={h.requestId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white rounded-xl p-4 border-2 border-gray-200 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{hc ? (hc.direction === 'up' ? '📈' : '📉') : '⏳'}</div>
                        <div>
                          <div className="font-bold text-black">
                            {h.asset} {hc ? hc.direction.toUpperCase() : ''} • {h.horizon} {hc ? `• $${price(hc.priceAtIssue)}` : ''}
                          </div>
                          <div className="text-sm text-gray-600">
                            {ago(Math.floor(h.at / 1000))} {hc ? `• ${hc.confidence}% confidence` : `• ${h.answer?.status ?? 'loading'}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {style && <span className={`px-3 py-1 rounded-full text-xs font-bold ${style.cls}`}>{style.label}</span>}
                        {hc?.result != null && <span className="text-sm font-bold text-black">{bps(hc.result)}</span>}
                        {hc && (
                          <Link href={hc.receipt} className="text-xs font-bold text-blue-700 hover:underline">
                            receipt →
                          </Link>
                        )}
                        {(h.answer?.status === 'failed' || (h.answer?.status === 'paid' && Date.now() - h.at > 16 * 60_000) || hc?.status === 'forfeited') && (
                          <button onClick={() => refund(h.requestId)} className="text-xs font-bold px-3 py-1 rounded-lg bg-black text-white hover:bg-gray-800">
                            Get my refund
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {!c && history.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <div className="text-8xl mb-6">🔮</div>
            <h3 className="text-3xl font-black text-black mb-3">Which way is {selectedCoin} going?</h3>
            <p className="text-xl text-gray-600 mb-8">Ask once for $0.05. The answer is sealed on Metis before the market moves, and scored when it has.</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-12 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-8 rounded-xl border-2 border-purple-200 shadow-lg">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🧠</div>
            <h3 className="text-2xl font-black text-black mb-2">Have your own read on the market?</h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Describe your strategy in plain English. Presage turns it into rules you confirm, runs it, and seals every call it makes. Once it has a
              record, people can subscribe and you earn 80% of every subscription.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { icon: '✍️', title: 'Plain English', body: 'No code. A strategy is data, never a script' },
              { icon: '🪪', title: 'ERC-8004 identity', body: 'Your agent is an on-chain identity you own' },
              { icon: '💰', title: '80% to you', body: 'Claimed on chain from your own wallet' },
            ].map(f => (
              <div key={f.title} className="bg-white p-4 rounded-lg border border-purple-200">
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="font-bold text-black text-sm mb-1">{f.title}</div>
                <div className="text-xs text-gray-600">{f.body}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/build">
              <button className="bg-black text-white px-8 py-4 rounded-xl font-bold transition-all hover:bg-gray-800 hover:scale-105 shadow-lg">🚀 Build an agent</button>
            </Link>
            <Link href="/agents">
              <button className="bg-white text-black border-2 border-gray-300 px-8 py-4 rounded-xl font-bold transition-all hover:border-purple-400 hover:bg-purple-50">🏆 See the agents</button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
