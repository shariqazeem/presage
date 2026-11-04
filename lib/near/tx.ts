import { JOIN_DEPOSIT, TRADE_GAS, USDC_ID, VAULT_ID } from './config'
import type { Rules } from './vault'

/**
 * The transactions a member signs, in the wallet-selector action format NEAR Connect takes.
 * Anything that moves money or changes rules carries 1 yoctoNEAR, so only the member's wallet
 * (a full-access key) can send it.
 */

export type WalletAction = { type: 'FunctionCall'; params: { methodName: string; args: object; gas: string; deposit: string } }
export type WalletTx = { receiverId: string; actions: WalletAction[] }

const TGAS = '000000000000'
const call = (methodName: string, args: object, tgas: number, deposit = '0'): WalletAction => ({ type: 'FunctionCall', params: { methodName, args, gas: `${tgas}${TGAS}`, deposit } })

export const joinTx = (rules: Rules): WalletTx => ({ receiverId: VAULT_ID, actions: [call('join', { rules }, 30, JOIN_DEPOSIT)] })

export const depositTx = (usdc: bigint): WalletTx => ({
  receiverId: USDC_ID,
  actions: [call('ft_transfer_call', { receiver_id: VAULT_ID, amount: usdc.toString(), msg: '' }, 100, '1')],
})

export const setRulesTx = (rules: Rules): WalletTx => ({ receiverId: VAULT_ID, actions: [call('set_rules', { rules }, 30, '1')] })

export const stopTx = (): WalletTx => ({ receiverId: VAULT_ID, actions: [call('stop', {}, 10)] })

/** Registers the member with a token contract so a withdrawal of it can land (about 0.00125 NEAR). */
export const registerTx = (token: string, accountId: string): WalletTx => ({
  receiverId: token,
  actions: [call('storage_deposit', { account_id: accountId, registration_only: true }, 30, '1250000000000000000000')],
})

export const withdrawTx = (token: string, amount?: bigint): WalletTx => ({
  receiverId: VAULT_ID,
  actions: [call('withdraw', amount != null ? { token, amount: amount.toString() } : { token }, 50, '1')],
})

/** A member's own vault trade, e.g. approving the agent's proposal (`call`) at a fresh minimum. */
export const tradeTx = (a: { accountId: string; tokenIn: string; tokenOut: string; amountIn: bigint; minOut: bigint; call: number | null }): WalletTx => ({
  receiverId: VAULT_ID,
  actions: [
    {
      type: 'FunctionCall',
      params: {
        methodName: 'trade',
        args: { account_id: a.accountId, token_in: a.tokenIn, token_out: a.tokenOut, amount_in: a.amountIn.toString(), min_out: a.minOut.toString(), seal: null, call: a.call },
        gas: TRADE_GAS,
        deposit: '1',
      },
    },
  ],
})

export const leaveTx = (): WalletTx => ({ receiverId: VAULT_ID, actions: [call('leave', {}, 30, '1')] })
