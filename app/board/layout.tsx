import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'The board' }

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
