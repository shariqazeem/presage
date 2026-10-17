'use client'

/** Browser pings (Web Push): ask once, then every call you watch pings you when it opens. */

const KEY = process.env.NEXT_PUBLIC_WEB_PUSH_KEY ?? ''

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && KEY.length > 0

export const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

const mark = (target: string, id: number) => `called_watch_${target}_${id}`
export const isWatching = (target: string, id: number) => {
  try {
    return localStorage.getItem(mark(target, id)) === '1'
  } catch {
    return false
  }
}

function keyBytes(): Uint8Array {
  const pad = '='.repeat((4 - (KEY.length % 4)) % 4)
  const raw = atob((KEY + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function subscription(prompt: boolean): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  if (Notification.permission === 'denied') return null
  if (Notification.permission !== 'granted') {
    if (!prompt) return null
    if ((await Notification.requestPermission()) !== 'granted') return null
  }
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes() as BufferSource })
}

/** Watch a call (pinged once, when it opens) or an agent (pinged each time it seals or closes a call). */
export async function watch(target: 'call' | 'agent', id: number, wallet?: string | null, prompt = true): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  const sub = await subscription(prompt)
  if (!sub) return Notification.permission === 'denied' || prompt ? 'denied' : 'unsupported'
  const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), target, id, wallet: wallet ?? undefined }) })
  if (!r.ok) return 'unsupported'
  try {
    localStorage.setItem(mark(target, id), '1')
  } catch {}
  return 'ok'
}

/** Watch quietly, without asking: only when pings are already allowed in this browser. */
export const autoWatch = (target: 'call' | 'agent', id: number, wallet?: string | null) =>
  pushSupported() && Notification.permission === 'granted' ? watch(target, id, wallet, false).catch(() => 'unsupported' as const) : Promise.resolve('unsupported' as const)
