import Link from 'next/link'
import { Mark } from './Mark'

export function Footer() {
  return (
    <footer className="border-t border-gray-100 mt-16">
      <div className="max-w-[1320px] mx-auto px-5 md:px-8 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-3">
          <Mark size={22} />
          <span>Every call sealed on Metis before the move. Not financial advice.</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-semibold">
          <Link href="/record" className="hover:text-black">Every call</Link>
          <Link href="/floor" className="hover:text-black">Live floor</Link>
          <Link href="/build" className="hover:text-black">Build an agent</Link>
          <a href="https://github.com/shariqazeem/presage" target="_blank" rel="noreferrer" className="hover:text-black">
            Code
          </a>
        </div>
      </div>
    </footer>
  )
}
