'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAccount } from 'wagmi'
import { useTelegramLink } from '@/lib/client/hooks'
import { isIOS, isStandalone, isWatching, pushSupported, watch } from '@/lib/client/push'
import { IconBell, IconCheck } from './icons'
import { Sheet } from './kit'
import { cx } from './ui'

/**
 * "Ping me when it opens." The browser's own notifications first; on an iPhone that hasn't added
 * Presage to its home screen, how to do that; Telegram when the bot is set up.
 */
export function PingButton({ target, id, label = 'Ping me when it opens', className = '', tone = 'black' }: { target: 'call' | 'agent'; id: number; label?: string; className?: string; tone?: 'black' | 'white' }) {
  const { address } = useAccount()
  const openTelegram = useTelegramLink()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  useEffect(() => setDone(isWatching(target, id)), [target, id])
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT

  const go = async () => {
    if (done || busy) return
    setBusy(true)
    try {
      if (pushSupported() && !(isIOS() && !isStandalone())) {
        const r = await watch(target, id, address)
        if (r === 'ok') {
          setDone(true)
          toast.success(target === 'call' ? 'You’ll get a ping when it opens' : 'You’ll get a ping each time it moves')
          return
        }
        if (r === 'denied') {
          toast.error('Notifications are blocked for this site. Allow them in your browser’s settings, then try again.')
          return
        }
      }
      if (isIOS() && !isStandalone()) return setIosHelp(true)
      if (bot) {
        await openTelegram()
        await fetch('/api/watch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, id }) }).catch(() => {})
        try {
          localStorage.setItem(`presage_watch_${target}_${id}`, '1')
        } catch {}
        setDone(true)
        return
      }
      toast('This browser can’t show pings. Chrome or Safari on a recent phone can.', { icon: '🔔' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not set up the ping')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        onClick={go}
        className={cx(
          'h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 px-4 transition-all',
          done ? 'bg-green-600 text-white' : tone === 'white' ? 'bg-white text-black border-2 border-gray-200 hover:border-black' : 'bg-black text-white hover:bg-gray-800',
          className,
        )}
      >
        {done ? <IconCheck size={17} weight={3} /> : <IconBell size={17} />}
        {done ? (target === 'call' ? 'You’ll get a ping' : 'Following') : busy ? 'One moment…' : label}
      </button>
      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title="Pings on iPhone">
        <p className="text-[15px] text-gray-700">iPhone only sends pings to apps on your home screen. It takes ten seconds:</p>
        <ol className="mt-4 space-y-3 text-[15px] text-black">
          <li className="flex gap-3"><span className="w-7 h-7 rounded-full grad text-white grid place-items-center text-sm font-black shrink-0">1</span>Tap the Share button at the bottom of Safari.</li>
          <li className="flex gap-3"><span className="w-7 h-7 rounded-full grad text-white grid place-items-center text-sm font-black shrink-0">2</span>Choose “Add to Home Screen”.</li>
          <li className="flex gap-3"><span className="w-7 h-7 rounded-full grad text-white grid place-items-center text-sm font-black shrink-0">3</span>Open Presage from your home screen and tap “Ping me” again.</li>
        </ol>
        {bot && (
          <button
            onClick={() =>
              openTelegram()
                .then(() => fetch('/api/watch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, id }) }))
                .then(() => (setIosHelp(false), setDone(true)))
                .catch(e => toast.error(e instanceof Error ? e.message : 'Could not link Telegram'))
            }
            className="mt-5 w-full h-12 rounded-2xl border-2 border-gray-200 font-bold hover:border-black"
          >
            Or get them on Telegram
          </button>
        )}
      </Sheet>
    </>
  )
}
