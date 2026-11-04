import { IconChart, IconLive, IconWallet } from '../icons'

export type NavItem = { href: string; label: string; icon: typeof IconLive; match: (path: string) => boolean }

export const NAV: Record<'floor' | 'desk' | 'record', NavItem> = {
  floor: { href: '/', label: 'Floor', icon: IconLive, match: p => p === '/' || p === '/how-it-trades' },
  desk: { href: '/desk', label: 'Desk', icon: IconWallet, match: p => p === '/desk' || p === '/start' || p === '/fund' },
  record: { href: '/record', label: 'Record', icon: IconChart, match: p => p.startsWith('/record') },
}

export const TABS = [NAV.floor, NAV.desk, NAV.record]
export const DESKTOP = [NAV.floor, NAV.desk, NAV.record]
