import { RHEA_ID, USDC, USDC_ID, WNEAR_ID, coinById } from './config'
import { sendWithKey } from './device'
import { quoteSell } from './rhea'
import { accountExists, ftBalance, nearBalance, storageRegistered } from './rpc'
import { depositTx, joinTx, registerTx, type WalletTx } from './tx'
import { fromUnits, lessBps } from './units'
import { vault, type Rules } from './vault'

/**
 * Putting a built-in account's NEAR to work, without a wallet pop-up: keep enough NEAR for gas, swap the
 * rest to USDC on Rhea, sign the mandate into the vault, and deposit. Every step first reads where the
 * account is on NEAR, so running it again after an interruption carries on from there.
 */

const NEAR = 10n ** 24n
/** Stays in the account for gas: NEAR holds up to 0.3 NEAR while an approval (300 Tgas) runs. */
export const GAS_KEEP = (45n * NEAR) / 100n
/** The join's storage deposit, two token registrations and the account's own storage. */
const SET_ASIDE = (2n * NEAR) / 100n + (25n * NEAR) / 10_000n + (2n * NEAR) / 1000n
/** The least worth putting to work after the gas and storage are kept: about $2 of NEAR. */
export const MIN_TO_WORK = NEAR / 2n
const SLIPPAGE_BPS = 100
const TGAS = '000000000000'

export type SetupStep = 'register' | 'wrap' | 'swap' | 'join' | 'deposit'
export type Progress = { step: SetupStep; state: 'running' | 'done'; tx?: string | null; detail?: string }

/** NEAR the account can put to work now: its balance less the gas it keeps and the storage it needs. */
export async function workable(accountId: string): Promise<{ balance: bigint; toWork: bigint }> {
  if (!(await accountExists(accountId))) return { balance: 0n, toWork: 0n }
  const balance = await nearBalance(accountId)
  const toWork = balance - GAS_KEEP - SET_ASIDE
  return { balance, toWork: toWork > 0n ? toWork : 0n }
}

const call = (receiverId: string, methodName: string, args: object, tgas: number, deposit: bigint | string): WalletTx => ({
  receiverId,
  actions: [{ type: 'FunctionCall', params: { methodName, args, gas: `${tgas}${TGAS}`, deposit: deposit.toString() } }],
})

async function waitFor<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 30_000): Promise<T> {
  const end = Date.now() + ms
  let v = await read()
  while (!ok(v) && Date.now() < end) {
    await new Promise(r => setTimeout(r, 1500))
    v = await read()
  }
  return v
}

/**
 * Runs every step that's still needed. `rules` is the mandate to sign if the account hasn't joined yet.
 * Resolves with the USDC it deposited (in USDC), or throws with a plain reason.
 */
export async function putToWork(secret: string, accountId: string, rules: Rules, report: (p: Progress) => void): Promise<number> {
  const nearCoin = coinById(WNEAR_ID)!
  const send = (tx: WalletTx) => sendWithKey(secret, [tx]).then(h => h[0] ?? null)

  // USDC must be able to land here before anything is swapped into it.
  if (!(await storageRegistered(USDC_ID, accountId).catch(() => false))) {
    report({ step: 'register', state: 'running' })
    report({ step: 'register', state: 'done', tx: await send(registerTx(USDC_ID, accountId)) })
  }

  let usdc = await ftBalance(USDC_ID, accountId).catch(() => 0n)
  let wnear = await ftBalance(WNEAR_ID, accountId).catch(() => 0n)

  if (usdc === 0n && wnear < NEAR / 100n) {
    const { toWork } = await workable(accountId)
    if (toWork < MIN_TO_WORK) throw new Error('Not enough NEAR here yet. Send at least 1 NEAR; it keeps 0.45 for gas.')
    report({ step: 'wrap', state: 'running', detail: `${fromUnits(toWork, 24).toFixed(2)} NEAR` })
    const registered = await storageRegistered(WNEAR_ID, accountId).catch(() => false)
    const tx: WalletTx = {
      receiverId: WNEAR_ID,
      actions: [
        ...(registered ? [] : [{ type: 'FunctionCall' as const, params: { methodName: 'storage_deposit', args: { account_id: accountId, registration_only: true }, gas: `30${TGAS}`, deposit: '1250000000000000000000' } }]),
        { type: 'FunctionCall' as const, params: { methodName: 'near_deposit', args: {}, gas: `20${TGAS}`, deposit: toWork.toString() } },
      ],
    }
    report({ step: 'wrap', state: 'done', tx: await send(tx), detail: `${fromUnits(toWork, 24).toFixed(2)} NEAR` })
    wnear = await waitFor(() => ftBalance(WNEAR_ID, accountId).catch(() => 0n), v => v > 0n)
  }

  if (usdc === 0n && wnear > 0n) {
    const quote = await quoteSell(nearCoin, wnear)
    if (quote <= 0n) throw new Error('Rhea has no price for NEAR right now. Try again in a minute.')
    const minOut = lessBps(quote, SLIPPAGE_BPS)
    report({ step: 'swap', state: 'running', detail: `≈ $${fromUnits(quote, USDC.decimals).toFixed(2)}` })
    // Rhea's instant swap: the USDC comes straight back to this account.
    const msg = JSON.stringify({ actions: [{ pool_id: nearCoin.pools[0], token_in: WNEAR_ID, token_out: USDC_ID, min_amount_out: minOut.toString() }] })
    const hash = await send(call(WNEAR_ID, 'ft_transfer_call', { receiver_id: RHEA_ID, amount: wnear.toString(), msg }, 180, 1n))
    usdc = await waitFor(() => ftBalance(USDC_ID, accountId).catch(() => 0n), v => v > 0n)
    if (usdc === 0n) throw new Error('The swap went through but the USDC hasn’t arrived yet. Wait a moment and tap again.')
    report({ step: 'swap', state: 'done', tx: hash, detail: `$${fromUnits(usdc, USDC.decimals).toFixed(2)}` })
  }

  if (usdc === 0n) throw new Error('There’s nothing to deposit yet.')

  if (!(await vault.member(accountId).catch(() => null))) {
    report({ step: 'join', state: 'running' })
    report({ step: 'join', state: 'done', tx: await send(joinTx(rules)) })
  }

  report({ step: 'deposit', state: 'running', detail: `$${fromUnits(usdc, USDC.decimals).toFixed(2)}` })
  report({ step: 'deposit', state: 'done', tx: await send(depositTx(usdc)), detail: `$${fromUnits(usdc, USDC.decimals).toFixed(2)}` })
  return fromUnits(usdc, USDC.decimals)
}

