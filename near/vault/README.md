# ParallaxPay vault (NEAR)

The contract members fund so the ParallaxPay agent can trade for them on NEAR. It holds each member's
coins, enforces the member's own rules on every agent trade, swaps only through Rhea pools the owner
has listed, and pays withdrawals to the member and nobody else.

## What it does

| Who | Can | Can't |
| --- | --- | --- |
| Member | `join`, deposit USDC, `set_rules`, `stop`, `trade` their own coins, `withdraw` any time, `leave` | touch anyone else's coins |
| Agent | `trade` a member's coins inside their rules, `seal` and `reveal` calls, `recover` a stuck trade | withdraw, send coins anywhere, trade a member with autopilot off, buy more than the member allows |
| Owner | list coins and pools (`set_route`), set the agent account, pause trades and deposits | move or withdraw anyone's coins, block withdrawals |

A member's rules: autopilot on or off, which coins the agent may buy, the largest buy (USDC), how
many buys a day, and a style (calm, balanced or bold) for how picky the agent is about entries. Sells
back to USDC are never limited, so the agent can always get out.

Every trade knows the exact amounts: the input goes into the vault's own Rhea account
(`ft_transfer_call`), is swapped there (Rhea's `swap` returns the amount out), and is withdrawn back
(Rhea's `withdraw` reports what arrived). One trade runs at a time, so whatever that Rhea account
holds belongs to the running trade, and `recover` can always settle a trade that stopped part-way.

Before the agent enters, it can seal its plan (`sha256(salt ‖ plan)`). When it opens the plan,
`reveal` checks it against the seal and logs it, so a call can't be rewritten after the market moves.

## Build and test

Run the unit tests (42, covering every path a trade can take):

```bash
cargo test
```

Build the contract (needs [cargo-near](https://github.com/near/cargo-near)):

```bash
cargo near build non-reproducible-wasm
```

The contract is written to `target/near/parallaxpay_vault.wasm`.

## Deploy

Deploy and set up the vault with `scripts/near/deploy-vault.ts` (from the repo root). It needs the
owner account's key in `.env.local` and signs real mainnet transactions, so it asks before each one.

The setup it runs, in order:

1. `new(owner, agent, exchange = v2.ref-finance.near, usdc)`
2. `storage_deposit` for the vault on Rhea and on each token contract (USDC, wNEAR, ZEC)
3. `set_route([usdc, wrap.near], [4512])` for NEAR and `set_route([usdc, wrap.near, zec.omft.near], [4512, 6065])` for ZEC
4. A function-call key on the agent account, limited to `trade`, `seal`, `reveal` and `recover` on the vault

## Use it

Join and set rules (autopilot on, NEAR only, up to 25 USDC a buy, 3 buys a day):

```bash
near contract call-function as-transaction vault.parallaxpay.near join \
  json-args '{"rules":{"autopilot":true,"max_trade":"25000000","trades_per_day":3,"coins":["wrap.near"],"style":1}}' \
  prepaid-gas '30 Tgas' attached-deposit '0.02 NEAR' sign-as YOU.near network-config mainnet sign-with-keychain send
```

Deposit 50 USDC:

```bash
near contract call-function as-transaction 17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1 ft_transfer_call \
  json-args '{"receiver_id":"vault.parallaxpay.near","amount":"50000000","msg":""}' \
  prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as YOU.near network-config mainnet sign-with-keychain send
```

See your balances and rules:

```bash
near contract call-function as-read-only vault.parallaxpay.near get_member json-args '{"account_id":"YOU.near"}' network-config mainnet now
```

Turn autopilot off at once:

```bash
near contract call-function as-transaction vault.parallaxpay.near stop json-args '{}' \
  prepaid-gas '10 Tgas' attached-deposit '0 NEAR' sign-as YOU.near network-config mainnet sign-with-keychain send
```

Withdraw all your USDC:

```bash
near contract call-function as-transaction vault.parallaxpay.near withdraw \
  json-args '{"token":"17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"}' \
  prepaid-gas '50 Tgas' attached-deposit '1 yoctoNEAR' sign-as YOU.near network-config mainnet sign-with-keychain send
```

## Events

Each change logs a [NEP-297](https://github.com/near/NEPs/blob/master/neps/nep-0297.md) event with
`"standard": "parallaxpay"`: `join`, `rules`, `stop`, `deposit`, `withdraw`, `withdraw_failed`,
`leave`, `trade_start`, `trade_end` (`filled`, `refunded` or `not_sent`), `trade_stuck`, `recover`,
`seal`, `reveal`, `route`, `route_removed`, `agent`, `owner`, `paused`.

## Known limits

- One trade at a time across the vault. A trade takes a few blocks, so the agent queues them.
- The owner lists the pools. A member's exposure to the agent is capped by their own limits.
- This deployment can be upgraded by whoever holds the vault account's full-access key (the
  ParallaxPay owner). That key will be removed, or put behind a timelock, before real money uses it.
