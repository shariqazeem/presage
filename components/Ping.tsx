'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTelegramLink } from '@/lib/client/hooks'
import { IconBell, IconCheck } from './icons'
import { cx } from './ui'

/**
 * "Ping me when it opens." Telegram when the bot is set up; the browser's own notifications are the
 * fallback, so a ping always has somewhere to go.
 */
export function PingButton({ target, id, label = 'Ping me when it opens', className = '' }: { target: 'call' | 'agent'; id: number; label?: string; className?: string }) {
  const openTelegram = useTelegramLink()
  const [done, setDone] = useState(false)
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT
  const go = async () => {
    try {
      if (bot) {
        await openTelegram()
        setDone(true)
        return
      }
      toast('Pings are switching on with the launch. Check back here, or follow along on Today.', { icon: '🔔' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not set up the ping')
    }
  }
  return (
    <button onClick={go} className={cx('h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 px-4 transition-all', done ? 'bg-green-600 text-white' : 'bg-black text-white hover:bg-gray-800', className)} data-target={`${target}:${id}`}>
      {done ? <IconCheck size={17} weight={3} /> : <IconBell size={17} />}
      {done ? 'You’ll get a ping' : label}
    </button>
  )
}
