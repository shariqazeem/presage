import Link from 'next/link'
import { Mark } from './Mark'

export function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-[1320px] mx-auto px-5 md:px-8 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-ink-3">
        <div className="flex items-center gap-3">
          <Mark size={22} />
          <span>
            <b className="font-semibold text-ink-2">ParallaxPay by Sage.</b> Every plan sealed on NEAR before the trade. Not financial advice.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-medium">
          <Link href="/how-it-trades" className="hover:text-ink">How ParallaxPay trades</Link>
          <Link href="/record" className="hover:text-ink">Every trade</Link>
          <Link href="/fund" className="hover:text-ink">Fund from any chain</Link>
          <a href="https://github.com/shariqazeem/presage" target="_blank" rel="noreferrer" className="hover:text-ink">
            Code
          </a>
        </div>
      </div>
    </footer>
  )
}
