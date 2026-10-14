import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core'

/** A Presage agent. `id` is its ERC-8004 identity id, which is also its id in PresageAgents. */
export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['direction', 'setup'] }).notNull(),
  house: integer('house', { mode: 'boolean' }).notNull().default(false),
  creator: text('creator').notNull(),
  description: text('description').notNull(),
  /** The exact spec JSON whose keccak256 is sealed on chain. */
  specJson: text('spec_json').notNull(),
  specHash: text('spec_hash').notNull(),
  priceUsd6: integer('price_usd6').notNull().default(0),
  callPriceUsd6: integer('call_price_usd6').notNull().default(0),
  registeredTx: text('registered_tx'),
  registeredAt: integer('registered_at'),
  retired: integer('retired', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

/** A strategy a creator has compiled and confirmed, before (and while) it is registered on chain. */
export const agentDrafts = sqliteTable('agent_drafts', {
  id: text('id').primaryKey(),
  /** Fixed when the draft is made, because the ERC-8004 card URL has to exist before the identity does. */
  slug: text('slug').notNull().unique(),
  creator: text('creator').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  prompt: text('prompt').notNull(),
  specJson: text('spec_json').notNull(),
  specHash: text('spec_hash').notNull(),
  priceUsd6: integer('price_usd6').notNull(),
  identityId: integer('identity_id'),
  status: text('status', { enum: ['compiled', 'minted', 'registered'] }).notNull(),
  createdAt: integer('created_at').notNull(),
})

export const calls = sqliteTable(
  'calls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Id in PresageCalls once sealed. */
    chainCallId: integer('chain_call_id'),
    agentId: integer('agent_id').notNull(),
    kind: text('kind', { enum: ['direction', 'setup'] }).notNull(),
    status: text('status', { enum: ['pending', 'sealed', 'revealed', 'forfeited', 'failed'] }).notNull(),
    /** The exact UTF-8 JSON that was sealed. Lose it and the call is forfeited, so it is never rewritten. */
    payload: text('payload').notNull(),
    salt: text('salt').notNull(),
    commitment: text('commitment').notNull(),
    revealBy: integer('reveal_by').notNull(),
    issuedAt: integer('issued_at').notNull(),
    asset: text('asset').notNull(),
    side: text('side').notNull(),
    priceAtIssue: real('price_at_issue').notNull(),
    entry: real('entry'),
    stop: real('stop'),
    target: real('target'),
    horizonSec: integer('horizon_sec'),
    confidence: integer('confidence'),
    requestId: text('request_id'),
    sealTx: text('seal_tx'),
    sealedAt: integer('sealed_at'),
    outcome: text('outcome', { enum: ['win', 'loss', 'flat', 'nofill'] }),
    result: integer('result'),
    /** JSON: how the outcome was worked out (fill, exit, the candles' source and times). */
    resolution: text('resolution'),
    revealTx: text('reveal_tx'),
    revealedAt: integer('revealed_at'),
    settleTx: text('settle_tx'),
    feedbackTx: text('feedback_tx'),
    alertedAt: integer('alerted_at'),
    error: text('error'),
  },
  t => [
    index('calls_agent').on(t.agentId, t.issuedAt),
    index('calls_status').on(t.status),
    index('calls_chain_id').on(t.chainCallId),
  ],
)

/** Paid Oracle questions: quoted, paid on chain, answered, sealed. */
export const oracleRequests = sqliteTable(
  'oracle_requests',
  {
    requestId: text('request_id').primaryKey(),
    /** sha256 of the secret handed to whoever asked. The request id goes public on chain once paid,
     * so the secret, not the id, is what unlocks the answer before it is revealed. */
    secretHash: text('secret_hash').notNull(),
    wallet: text('wallet'),
    asset: text('asset').notNull(),
    horizon: text('horizon').notNull(),
    status: text('status', {
      enum: ['quoted', 'paid', 'answering', 'sealed', 'failed', 'refunded'],
    }).notNull(),
    payTx: text('pay_tx'),
    payer: text('payer'),
    token: text('token'),
    amount: text('amount'),
    callId: integer('call_id'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    paidAt: integer('paid_at'),
    sealedAt: integer('sealed_at'),
  },
  t => [index('oracle_requests_wallet').on(t.wallet, t.createdAt), index('oracle_requests_status').on(t.status)],
)

export const telegramLinks = sqliteTable('telegram_links', {
  wallet: text('wallet').primaryKey(),
  chatId: text('chat_id').notNull(),
  username: text('username'),
  linkedAt: integer('linked_at').notNull(),
})

export const telegramCodes = sqliteTable('telegram_codes', {
  code: text('code').primaryKey(),
  wallet: text('wallet').notNull(),
  createdAt: integer('created_at').notNull(),
  usedAt: integer('used_at'),
})

/** Every Presage contract event, indexed from the chain. The chain is the source of truth. */
export const chainEvents = sqliteTable(
  'chain_events',
  {
    id: text('id').primaryKey(),
    block: integer('block').notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    contract: text('contract').notNull(),
    name: text('name').notNull(),
    args: text('args').notNull(),
    from: text('from'),
    timestamp: integer('timestamp').notNull(),
  },
  t => [index('chain_events_name').on(t.name, t.block), index('chain_events_block').on(t.block)],
)

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    agentId: integer('agent_id').notNull(),
    subscriber: text('subscriber').notNull(),
    until: integer('until').notNull(),
    lastTx: text('last_tx').notNull(),
  },
  t => [primaryKey({ columns: [t.agentId, t.subscriber] })],
)

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
