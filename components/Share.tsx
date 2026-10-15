'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { cx } from './ui'

/** Share a receipt or an agent: a real record is the best thing anyone can post. */
export function Share({ text, path, className = '', size = 'md' }: { text: string; path: string; className?: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false)
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
  }
  const x = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n${url()}`)}`, '_blank', 'noopener')
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
