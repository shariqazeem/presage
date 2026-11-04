import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core'

/** A ParallaxPay agent. `id` is its ERC-8004 identity id, which is also its id in ParallaxPayAgents. */
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
    /** Id in ParallaxPayLedger once sealed. */
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
    /** When the outcome went out on Telegram to subscribers and, for a paid call, its payer. */
    resultAlertedAt: integer('result_alerted_at'),
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
    /** JSON while answering: the stage and the votes as they land, so the page can show them live. */
    progress: text('progress'),
    /** The asker's own call, made before the Oracle's and sealed inside the same payload. */
    askerCall: text('asker_call', { enum: ['up', 'down'] }),
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

/** Every ParallaxPay contract event, indexed from the chain. The chain is the source of truth. */
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

/** What agents are doing, as it happens. The floor streams this. Pruned after a week. */
export const agentEvents = sqliteTable(
  'agent_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: integer('agent_id').notNull(),
    kind: text('kind').notNull(),
    at: integer('at').notNull(),
    /** JSON. A sealed call's levels never go in here; they stay with the call until it is revealed. */
    data: text('data').notNull(),
  },
  t => [index('agent_events_at').on(t.at), index('agent_events_agent').on(t.agentId, t.at)],
)

/** Agents a wallet follows for free: their calls show on that wallet's Today and come as pings. */
export const follows = sqliteTable(
  'follows',
  {
    wallet: text('wallet').notNull(),
    agentId: integer('agent_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  t => [primaryKey({ columns: [t.wallet, t.agentId] }), index('follows_agent').on(t.agentId)],
)

/** Browsers that asked for pings (Web Push). The endpoint is the browser's own address for them. */
export const pushSubs = sqliteTable('push_subs', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  wallet: text('wallet'),
  createdAt: integer('created_at').notNull(),
  failedAt: integer('failed_at'),
})

/** "Ping me when …": one browser or Telegram chat waiting on one call or one agent. */
export const watches = sqliteTable(
  'watches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channel: text('channel', { enum: ['push', 'telegram'] }).notNull(),
    /** The push endpoint, or the wallet whose Telegram link gets the message. */
    address: text('address').notNull(),
    target: text('target', { enum: ['call', 'agent'] }).notNull(),
    targetId: integer('target_id').notNull(),
    createdAt: integer('created_at').notNull(),
    doneAt: integer('done_at'),
  },
  t => [index('watches_target').on(t.target, t.targetId)],
)

// ---------- ParallaxPay on NEAR ----------

/** A member of the NEAR vault, with the agent's last read of their on-chain rules and balances. */
export const nearMembers = sqliteTable('near_members', {
  accountId: text('account_id').primaryKey(),
  /** JSON of the vault's `get_member`; null once they leave. */
  member: text('member'),
  joinedAt: integer('joined_at').notNull(),
  syncedAt: integer('synced_at').notNull(),
})

/**
 * One trade idea for one member, from the sealed plan to the exit. Autopilot positions are opened by
 * the agent; "ask first" ones start as a proposal the member approves from their own wallet.
 */
export const nearPositions = sqliteTable(
  'near_positions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: text('account_id').notNull(),
    coin: text('coin').notNull(),
    mode: text('mode', { enum: ['autopilot', 'ask'] }).notNull(),
    status: text('status', { enum: ['proposed', 'open', 'closed', 'not_filled', 'declined'] }).notNull(),
    /** The vault's id for the sealed call. */
    callId: integer('call_id'),
    /** The exact plan JSON that was sealed, with its salt. Lose either and the call can never open. */
    plan: text('plan').notNull(),
    salt: text('salt').notNull(),
    hash: text('hash').notNull(),
    sealTx: text('seal_tx'),
    revealTx: text('reveal_tx'),
    stop: real('stop').notNull(),
    target: real('target').notNull(),
    r1: real('r1'),
    maxHoldSec: integer('max_hold_sec').notNull(),
    usdcIn: text('usdc_in'),
    coinAmount: text('coin_amount'),
    entryPrice: real('entry_price'),
    entryTx: text('entry_tx'),
    openedAt: integer('opened_at'),
    usdcOut: text('usdc_out'),
    exitPrice: real('exit_price'),
    exitTx: text('exit_tx'),
    exitReason: text('exit_reason'),
    closedAt: integer('closed_at'),
    /** An "ask first" exit the agent is waiting on the member to approve. */
    exitProposedAt: integer('exit_proposed_at'),
    createdAt: integer('created_at').notNull(),
  },
  t => [index('near_positions_account').on(t.accountId, t.createdAt), index('near_positions_status').on(t.status)],
)

/** What the agent saw and did, one plain sentence at a time. The desk's live feed. */
export const nearFeed = sqliteTable(
  'near_feed',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: integer('at').notNull(),
    /** Null for market-wide lines everyone sees. */
    accountId: text('account_id'),
    coin: text('coin'),
    kind: text('kind', { enum: ['watch', 'setup', 'pass', 'enter', 'exit', 'propose', 'seal', 'reveal', 'note', 'error', 'member'] }).notNull(),
    /** Who is speaking: 'st-quant', 'analyst', or a member's account for their own public moves. */
    actor: text('actor'),
    text: text('text').notNull(),
    tx: text('tx'),
  },
  t => [index('near_feed_at').on(t.at), index('near_feed_account').on(t.accountId, t.at)],
)
