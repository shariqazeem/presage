'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { IconShare } from './icons'
import { cx } from './ui'

/**
 * Share a receipt or an agent: a real record is the best thing anyone can post. `compact` is a single
 * share button: the phone's own share sheet where there is one, a small menu where there isn't.
 */
export function Share({ text, path, className = '', size = 'md', compact = false }: { text: string; path: string; className?: string; size?: 'sm' | 'md'; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const off = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [menu])
  const url = () => `${window.location.origin}${path}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url())
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy')
    }
    setMenu(false)
  }
  const x = () => {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n${url()}`)}`, '_blank', 'noopener')
    setMenu(false)
  }
  if (compact) {
    const open = async () => {
      if (typeof navigator !== 'undefined' && navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        try {
          await navigator.share({ text, url: url() })
        } catch {}
        return
      }
      setMenu(m => !m)
    }
    return (
      <div ref={ref} className={cx('relative', className)}>
        <button onClick={open} aria-label="Share" className="h-12 w-12 rounded-2xl border-2 border-gray-200 bg-white grid place-items-center hover:border-black transition-colors">
          <IconShare size={18} />
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute right-0 bottom-14 z-30 w-44 bg-white rounded-2xl border-2 border-gray-100 shadow-xl p-1.5">
              <button onClick={x} className="w-full text-left px-3 py-2 rounded-xl text-sm font-bold hover:bg-gray-50">
                Post on X
              </button>
              <button onClick={copy} className="w-full text-left px-3 py-2 rounded-xl text-sm font-bold hover:bg-gray-50">
                {copied ? 'Copied ✓' : 'Copy link'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
  const btn = cx('rounded-xl font-bold border-2 border-gray-200 bg-white hover:border-black transition-colors', size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm')
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <button onClick={x} className={btn}>
        Post on X
      </button>
      <button onClick={copy} className={btn}>
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
    </div>
  )
}
