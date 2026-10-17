import { IconAgents, IconBuild, IconOracle, IconQuant, IconToday, IconYou } from '../icons'

export type NavItem = { href: string; label: string; icon: typeof IconToday; match: (path: string) => boolean }

const isAgentPage = (p: string) => p === '/agents' || (p.startsWith('/agents/') && p !== '/agents/st-quant') || p.startsWith('/creators/')

export const NAV: Record<'today' | 'oracle' | 'quant' | 'agents' | 'build' | 'you', NavItem> = {
  today: { href: '/', label: 'Today', icon: IconToday, match: p => p === '/' || p === '/floor' },
  oracle: { href: '/oracle', label: 'Oracle', icon: IconOracle, match: p => p === '/oracle' },
  quant: { href: '/agents/st-quant', label: 'ST Quant', icon: IconQuant, match: p => p === '/agents/st-quant' },
  agents: { href: '/agents', label: 'Agents', icon: IconAgents, match: isAgentPage },
  build: { href: '/build', label: 'Build', icon: IconBuild, match: p => p.startsWith('/build') },
  you: { href: '/you', label: 'You', icon: IconYou, match: p => p.startsWith('/you') },
}

/** Phones get five tabs; Build lives on the Agents and You tabs there. */
export const TABS = [NAV.today, NAV.oracle, NAV.quant, NAV.agents, NAV.you]
export const DESKTOP = [NAV.today, NAV.oracle, NAV.quant, NAV.agents, NAV.build]
