import { IconAgents, IconChart, IconLive, IconWallet } from '../icons'

export type NavItem = { href: string; label: string; icon: typeof IconLive; match: (path: string) => boolean }

export const NAV: Record<'floor' | 'desk' | 'board' | 'record', NavItem> = {
  floor: { href: '/', label: 'Floor', icon: IconLive, match: p => p === '/' || p === '/how-it-trades' },
  desk: { href: '/desk', label: 'Your agent', icon: IconWallet, match: p => p === '/desk' || p === '/start' || p === '/fund' },
  board: { href: '/board', label: 'Board', icon: IconAgents, match: p => p.startsWith('/board') },
  record: { href: '/record', label: 'Its work', icon: IconChart, match: p => p.startsWith('/record') },
}

export const TABS = [NAV.floor, NAV.desk, NAV.board, NAV.record]
export const DESKTOP = [NAV.floor, NAV.desk, NAV.board, NAV.record]
