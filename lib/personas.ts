/**
 * Who the house agents are, in words. Creator agents get the same shape from their spec and the
 * description their creator wrote.
 */
export type Persona = {
  tagline: string
  thesis: string
  method: string[]
  honest: string
}

export const HOUSE_PERSONAS: Record<string, Persona> = {
  oracle: {
    tagline: 'Facts first, then a vote.',
    thesis:
      'I read the public candles, write down the facts, and let several models vote on which way the price goes over the horizon. The majority wins; confidence is what the majority meant, scaled by how many agreed.',
    method: [
      'Facts from Binance candles: returns over 1h, 4h, 24h and 7 days; EMA20 against EMA50 on 1h and 4h; MFI on 15m, 1h and 4h with where it sits in its own range; ATR; the nearest confirmed support; the first major resistance; volume against the week; BTC context.',
      'called-quant-v1 always votes: momentum against stretch, with the 4h trend, extreme MFI and divergence as nudges. It is deterministic, so every call has at least one reproducible opinion behind it.',
      'Three language models vote on the same facts, each with its own calibrated confidence. A voter slower than 35 seconds is skipped.',
      'The call is sealed on Metis before the horizon starts and scored at the 1-minute close when it ends. Moves inside the flat band (0.1% at 1h, 0.2% at 4h, 0.4% at 24h) are flat: neither right nor wrong.',
    ],
    honest: 'An AI forecast with a public record, nothing more. Around half of all 1-hour calls are coin flips, and the record will say so.',
  },
  'st-quant': {
    tagline: 'I take entries at MFI low, at bottom support. I never chase.',
    thesis:
      'A setup is price sitting on a level that has held before, while money flow is exhausted. Structure outranks the oscillator; the oscillator is evidence, not law. Buy there, stop under the structure, take profit where the pattern has rejected before.',
    method: [
      'Four timeframes, top down: 1D says whether the coin is worth trading, 4H is the playing field, 1H is timing, 15m is the trigger.',
      'Levels are found, not drawn: horizontal zones with repeated touches, rising or falling trendlines fitted through swing lows, and wedge apexes. A level only counts if a higher timeframe confirms it.',
      'MFI is read against its own range: the latest reading against the last 100. The sniper fires when 15m MFI is in the bottom 12% of its range and price is within 2.5% of a support.',
      'The arming plan grades a setup 1 to 5: confluence, touches, divergence, exhaustion on both timeframes, and reward to the first rejection point. Below 4 it waits.',
      'A chart read applies the founder’s rubric to the rendered chart. It can only approve or veto; the entry, stop and target are always the rules’ own numbers.',
      'Watches the 84 Binance markets the Oracle covers and the hottest pools on BSC and X Layer that pass the liquidity and turnover filters.',
    ],
    honest: 'Unproven. ST Quant has never been shown to be profitable. Its record on Called starts the day it went live, and it may lose.',
  },
}

export const EVENT_WORDS: Record<string, string> = {
  scan: 'scanned',
  candidate: 'found a setup',
  chart_read: 'read a chart',
  sealed: 'sealed a call',
  resolved: 'call resolved',
  forfeited: 'forfeited a call',
  answered: 'answered',
  skipped: 'passed',
}
