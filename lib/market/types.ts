/** One candle. `ts` is the open time in milliseconds. */
export type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number }

/** ST Quant reads four timeframes, oldest candle first in each. */
export type Frames = { d1: Candle[]; h4: Candle[]; h1: Candle[]; m15: Candle[] }

/** Where an asset's prices come from. Every call names its source so anyone can fetch the same candles. */
export type AssetRef =
  | { symbol: string; source: 'binance'; market: string }
  | { symbol: string; source: 'geckoterminal'; network: string; pool: string; token: string }

export const assetKey = (a: AssetRef) =>
  a.source === 'binance' ? `binance:${a.market}` : `gt:${a.network}:${a.pool.toLowerCase()}`

export const TF_MS = { '1m': 60_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 } as const
