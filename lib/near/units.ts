/** Token amounts travel as base-unit strings; these turn them into numbers people read, and back. */

export function fromUnits(amount: string | bigint | null | undefined, decimals: number): number {
  if (amount == null) return 0
  const s = amount.toString().padStart(decimals + 1, '0')
  return Number(`${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`)
}

/** Rounds down, so a converted amount never exceeds what was meant. */
export function toUnits(value: number | string, decimals: number): bigint {
  const [whole, frac = ''] = (typeof value === 'number' ? value.toFixed(Math.min(decimals, 20)) : value).split('.')
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

/** Basis-point haircut, for a swap's minimum out. */
export const lessBps = (amount: bigint, bps: number) => (amount * BigInt(10_000 - bps)) / 10_000n
