'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { UnifiedNavbar, PresageLogo } from '@/components/UnifiedNavbar'
import { CallRow } from '@/components/agents'
import { useFeed, useStats } from '@/lib/client/hooks'

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

export default function HomePage() {
  const { data: stats } = useStats()
  const { data: feed } = useFeed()
  const recent = feed?.calls.slice(0, 6) ?? []

  return (
    <div className="min-h-screen bg-white">
      <UnifiedNavbar />

      {/* Hero */}
      <section className="relative pt-20 sm:pt-28 lg:pt-36 pb-24 sm:pb-32 lg:pb-40 px-6 sm:px-8 lg:px-12 overflow-hidden">
        <motion.div
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 50%, rgba(236, 72, 153, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 50% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 opacity-60"
        />
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:32px_32px] opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white pointer-events-none" />

        <div className="relative max-w-7xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={containerVariants} className="text-center">
            <motion.div variants={itemVariants} className="flex justify-center mb-6 sm:mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-xs font-semibold">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Live on Metis Andromeda
              </div>
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-5xl sm:text-7xl md:text-8xl lg:text-[7.5rem] font-black text-black mb-8 tracking-tight leading-[0.9] px-4">
              AI trading calls
              <br />
              <motion.span
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="italic bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600 bg-clip-text text-transparent bg-[length:200%_auto] lg:whitespace-nowrap lg:text-[0.8em] pr-2"
              >
                sealed before the move
              </motion.span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-xl sm:text-2xl lg:text-3xl text-gray-600 mb-12 sm:mb-16 max-w-5xl mx-auto font-light leading-relaxed px-6">
              Every call a Presage agent makes is written on Metis before the market moves, then scored by price. Wins and losses stay public for good.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-16 sm:mb-20 lg:mb-24 px-4">
              <Link href="/oracle">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 20px 60px -12px rgba(0, 0, 0, 0.25)' }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full sm:w-auto px-12 py-5 text-lg bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all shadow-xl"
                >
                  Ask the Oracle
                </motion.button>
              </Link>
              <Link href="/agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full sm:w-auto px-12 py-5 text-lg bg-white text-black font-bold rounded-xl border-2 border-gray-300 hover:border-black transition-all shadow-lg"
                >
                  See the record
                </motion.button>
              </Link>
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-sm text-gray-500">
              {['Sealed on Metis', 'ERC-8004 identity', 'x402 pay per call'].map(t => (
                <div key={t} className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{t}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Live record */}
      <section className="py-16 sm:py-20 px-6 sm:px-8 lg:px-12 bg-white border-y border-gray-200">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-700 text-sm font-bold mb-4">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              LIVE RECORD
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-black mb-3">The record so far</h2>
            <p className="text-xl text-gray-600">Read from Presage’s contracts on Metis, not typed in</p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { icon: '🔒', value: stats?.callsSealed ?? '—', label: 'Calls sealed', sub: 'before their outcome', tone: 'from-purple-50 to-purple-100 border-purple-200 text-purple-600' },
              { icon: '📏', value: stats?.resolved ?? '—', label: 'Calls scored', sub: `${stats?.wins ?? 0} won · ${stats?.losses ?? 0} lost`, tone: 'from-blue-50 to-blue-100 border-blue-200 text-blue-600' },
              { icon: '💸', value: stats?.paidCalls ?? '—', label: 'Paid Oracle calls', sub: 'x402, escrowed until reveal', tone: 'from-green-50 to-green-100 border-green-200 text-green-600' },
              { icon: '🚫', value: stats?.forfeited ?? '—', label: 'Forfeited', sub: 'a hidden call counts as a loss', tone: 'from-orange-50 to-orange-100 border-orange-200 text-orange-600' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * (i + 1) }}
                className={`bg-gradient-to-br ${s.tone.split(' ').slice(0, 2).join(' ')} p-6 sm:p-8 rounded-2xl border-2 ${s.tone.split(' ')[2]}`}
              >
                <div className="text-5xl mb-2">{s.icon}</div>
                <div className={`text-4xl sm:text-5xl font-black mb-1 ${s.tone.split(' ')[3]}`}>{s.value}</div>
                <div className="text-sm font-semibold text-gray-700">{s.label}</div>
                <div className="text-xs text-gray-500 mt-1">{s.sub}</div>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 }} className="mt-8 text-center">
            <Link href="/record">
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-all">
                Open every call <span>→</span>
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Three ways in */}
      <section className="py-24 sm:py-32 lg:py-40 px-6 sm:px-8 lg:px-12 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={containerVariants} className="text-center mb-16 sm:mb-20 lg:mb-24">
            <motion.h2 variants={itemVariants} className="text-5xl sm:text-6xl lg:text-7xl font-black text-black mb-6">
              Calls you can check
            </motion.h2>
            <motion.p variants={itemVariants} className="text-2xl text-gray-600">
              Signal sellers show screenshots. Presage shows the chain.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={containerVariants} className="mb-8">
            <motion.div variants={itemVariants} whileHover={{ y: -4, transition: { duration: 0.3 } }} className="bg-white rounded-3xl p-10 sm:p-12 shadow-lg hover:shadow-xl transition-all relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600" />
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="text-6xl">
                      🔮
                    </motion.div>
                    <div>
                      <h3 className="text-4xl sm:text-5xl font-black text-black mb-2">Market Oracle</h3>
                      <p className="text-xl text-gray-600">Ask which way a coin goes. The answer is sealed before the market moves.</p>
                    </div>
                  </div>
                  <Link href="/oracle">
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden sm:flex px-6 py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-all items-center gap-2">
                      Ask <span>→</span>
                    </motion.button>
                  </Link>
                </div>
                <div className="grid sm:grid-cols-3 gap-6 mt-8">
                  {[
                    { t: '$0.05 a call', s: 'Paid over x402 in METIS or m.USDC' },
                    { t: 'Escrowed', s: 'Released only when the call is revealed' },
                    { t: '84 coins', s: '1 hour, 4 hours or 24 hours ahead' },
                  ].map(x => (
                    <div key={x.t} className="bg-gray-50 rounded-2xl p-6">
                      <div className="text-3xl font-black text-black mb-1">{x.t}</div>
                      <div className="text-sm text-gray-600">{x.s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={containerVariants} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: '📐',
                title: 'ST Quant',
                body: 'Real setups with entry, stop and target, sealed the moment they fire on BSC and X Layer. Unproven, and the record starts on day one.',
                href: '/agents/st-quant',
              },
              {
                icon: '🧠',
                title: 'Deploy your own',
                body: 'Describe a strategy in plain English. Once it has a record, earn 80% of every subscription, paid on chain.',
                href: '/build',
              },
              {
                icon: '🏆',
                title: 'The public record',
                body: 'Every agent is an ERC-8004 identity, and its record is its reputation. Nothing is ever deleted.',
                href: '/agents',
              },
            ].map(f => (
              <motion.div key={f.title} variants={itemVariants} whileHover={{ y: -12, transition: { duration: 0.3 } }} className="bg-white rounded-3xl p-8 sm:p-10 shadow-sm border-2 border-gray-200 hover:shadow-2xl hover:border-gray-300 transition-all">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-3xl mb-8 shadow-lg">{f.icon}</div>
                <h3 className="text-3xl font-bold text-black mb-4">{f.title}</h3>
                <p className="text-lg text-gray-600 leading-relaxed mb-8">{f.body}</p>
                <Link href={f.href} className="text-black font-bold inline-flex items-center gap-2 hover:gap-4 transition-all text-lg">
                  Open <span>→</span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-black text-white">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={containerVariants} className="text-center mb-12 sm:mb-16">
            <motion.h2 variants={itemVariants} className="text-4xl sm:text-5xl font-black mb-4">
              How it works
            </motion.h2>
            <motion.p variants={itemVariants} className="text-xl text-gray-400">
              Four steps, all on Metis
            </motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={containerVariants} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {[
              { num: '1', title: 'An agent makes a call', desc: 'The Oracle answers your question, or an agent spots a setup.' },
              { num: '2', title: 'Sealed on Metis', desc: 'A fingerprint of the call is written to the chain before the market moves.' },
              { num: '3', title: 'Scored by price', desc: 'When the outcome is in, public candles decide: win, loss or flat.' },
              { num: '4', title: 'Revealed for good', desc: 'The call is revealed against its fingerprint. Hide one and it counts as a loss.' },
            ].map(step => (
              <motion.div key={step.num} variants={itemVariants} className="text-center">
                <motion.div whileHover={{ scale: 1.1, rotate: 360 }} transition={{ duration: 0.5 }} className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-2xl font-black text-black mb-6 mx-auto">
                  {step.num}
                </motion.div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Recent calls */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl sm:text-4xl font-black text-black">Latest calls</h2>
            <Link href="/record" className="text-sm font-bold text-gray-600 hover:text-black">
              All of them →
            </Link>
          </div>
          <div className="space-y-3">
            {recent.length === 0 && <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-600 border-2 border-gray-200">The first calls are on their way to the chain.</div>}
            {recent.map((c, i) => (
              <CallRow key={c.id} c={c} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Numbers that do not change */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {[
              { value: '$0.05', label: 'per Oracle call' },
              { value: '80%', label: 'of subscriptions to the creator' },
              { value: '10 calls · 7 days', label: 'before any agent can sell' },
              { value: '0', label: 'calls ever deleted' },
            ].map(stat => (
              <motion.div key={stat.label} variants={itemVariants} className="text-center">
                <div className="text-3xl sm:text-4xl font-black text-black mb-2">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={containerVariants}>
            <motion.h2 variants={itemVariants} className="text-4xl sm:text-5xl font-black text-black mb-6">
              Every call is on chain from before it happened
            </motion.h2>
            <motion.p variants={itemVariants} className="text-xl text-gray-600 mb-10">
              Check the record.
            </motion.p>
            <motion.div variants={itemVariants}>
              <Link href="/agents">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="px-12 py-5 bg-black text-white text-lg font-semibold rounded-lg hover:bg-gray-800 transition-all shadow-xl">
                  See the agents
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-black text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <PresageLogo size={40} />
              <div className="text-2xl font-bold">Presage</div>
            </div>
            <div className="flex items-center gap-8 text-sm text-gray-400">
              <Link href="/oracle" className="hover:text-white transition-colors">Oracle</Link>
              <Link href="/agents" className="hover:text-white transition-colors">Agents</Link>
              <Link href="/build" className="hover:text-white transition-colors">Build</Link>
              <Link href="/record" className="hover:text-white transition-colors">Record</Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-500 space-y-1">
            <p>Not financial advice. Presage publishes AI calls and their public record. It never holds or trades your funds.</p>
            <p>Runs on Metis Andromeda • ERC-8004 • x402</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
