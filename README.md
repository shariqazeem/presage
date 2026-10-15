# Presage

**AI trading calls, sealed on Metis before the move.**

Every call a Presage agent makes is written to Metis Andromeda before the market moves, then scored by price and revealed. Wins and losses stay on the record for good. A call that is not revealed in time can be forfeited by anyone, and it counts as a loss.

Signal sellers show screenshots. Presage shows the chain.

---

## What you can do

| | What it is | Price |
|---|---|---|
| **Market Oracle** | Ask which way one of 84 coins goes over 1 hour, 4 hours or 24 hours. A quant model and three AI models vote on facts from public Binance candles. | $0.05 a call over x402, held in escrow until the call is revealed |
| **ST Quant** | Trade setups with entry, stop and target on BSC and X Layer pools. Unproven: it has never been shown to be profitable, and its record starts on day one. | $3 per 30 days, once its record is long enough |
| **Your own agent** | Describe a strategy in plain English. Presage turns it into rules you confirm, runs it, and seals every call it makes. | You set the price ($2 minimum) and keep 80% |

No agent, ours included, can take subscribers before it has **10 scored calls over 7 days**. The contract enforces that.

## How a call works

```
1. Seal      keccak256(salt ‖ payload) → PresageCalls.seal(agentId, commitment, revealBy)
2. Score     public candles + the rulebook in lib/calls/rules.ts → win, loss, flat or no fill
3. Reveal    PresageCalls.reveal(callId, salt, payload, outcome, result); the reveal must hash to the seal
4. Forfeit   after revealBy, anyone can call PresageCalls.forfeit(callId); it counts against the agent
```

The payload is the full call (asset, price source, entry, stop, target or direction, horizon, the reasons) as JSON. While a call is sealed only its fingerprint is public, so subscribers get it first and nobody can copy it for free. Once revealed, the JSON is in the transaction for anyone to read.

**Scoring.** Hit rate is wins over wins, losses and forfeits. A setup's result is in R (risk multiples); a forfeit counts as −1R. An Oracle call's result is the move in the called direction, in basis points. The full rules are in [`lib/calls/rules.ts`](lib/calls/rules.ts) and on every receipt page.

## Check it yourself

Every call has a receipt at `/calls/<id>`. Its **Check it yourself** panel runs in your browser, not on our servers:

1. It recomputes `keccak256(salt ‖ payload)` and compares it with the commitment stored in PresageCalls.
2. It fetches the public candles (Binance, or GeckoTerminal for DEX pools) and reruns the rulebook to get the outcome the reveal claims.

## Contracts on Metis Andromeda (chain 1088)

| Contract | Address | What it does |
|---|---|---|
| PresageCalls | _deploying_ | Seals, reveals and forfeits calls; keeps each agent's record |
| PresageAgents | _deploying_ | Ties a strategy spec, by hash, to an ERC-8004 identity; a spec can never change |
| PresageMarket | _deploying_ | x402 escrow for paid calls, subscriptions, the 80/20 split, claims |
| ERC-8004 Identity | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | The canonical registry; every Presage agent is an identity here |
| Chainlink METIS/USD | `0xD4a5Bb03B5D66d9bf81507379302Ac2C2DFDFa6D` | Prices METIS payments |

Payments are accepted in METIS, m.USDC (`0xEA32…1a21`) and m.USDT (`0xbB06…F4dC`).

## Paying over x402 (for agents)

Metis has no public x402 facilitator, and m.USDC supports neither EIP-3009 nor permit, so Presage settles payments itself with a scheme called `escrow`: the payer's own wallet pays the contract, and the request is retried with the transaction as proof.

```
POST /api/oracle/call  {"asset":"BTC","horizon":"4h"}
  ← 402  {x402Version, accepts:[{scheme:"escrow", network:"eip155:1088", maxAmountRequired, payTo, asset, extra:{agentId, requestId, method}}], secret}
PresageMarket.payForCall(agentId, requestId, token, maxAmount)        from your wallet
POST /api/oracle/call  {"secret"}  X-PAYMENT: base64({x402Version, scheme, network, payload:{requestId, txHash}})
  ← 200  the sealed call, and X-PAYMENT-RESPONSE
```

The money stays in escrow until the call is revealed. If it is not sealed within 15 minutes, or it is forfeited, the payer gets it back. A working client is in [`scripts/x402-client.ts`](scripts/x402-client.ts):

```bash
PAYER_KEY=0x... npx tsx scripts/x402-client.ts BTC 4h METIS
```

## ERC-8004

Each agent is an identity in the canonical ERC-8004 registry on Andromeda, owned by its creator. Its registration file (`/api/agents/<slug>/card`) points to its record and to the spec hash sealed in PresageAgents, so the identity and the calls behind it can always be found from each other.

## How it is built

- `contracts/`: Foundry. Compiled for `shanghai`, because Andromeda accepts PUSH0 but rejects Cancun opcodes. 32 unit tests, plus fork tests against live Andromeda state.
- `engine/`: one Node process. It indexes the contracts, answers paid Oracle calls, runs ST Quant and creator agents, resolves and reveals, settles escrow, and sends Telegram alerts. A single key seals and reveals, and its transactions are strictly serialised.
- `engine/stquant/`: ST Quant's pure modules, ported unchanged from the original scanner. Entry, stop and target are always the rules' numbers; the AI chart read can approve or veto a setup, never set its prices.
- `lib/spec/`: a creator's strategy is data, never code: a fixed vocabulary of ST Quant's primitives. The compiler refuses anything it cannot express, and the runner only runs a spec whose hash matches the one sealed on chain.
- `app/`: Next.js, carried over from ParallaxPay.

### Run it

```bash
npm install
cp .env.example .env.local            # then fill it in
(cd contracts && forge test)
node --import tsx --test tests/*.test.ts
npm run dev                           # the site
npm run engine                        # the engine
```

`scripts/rehearsal/up.sh` runs the whole thing against a local fork of live Andromeda: it deploys the contracts, registers the house agents, and starts the engine and the site. Nothing in it touches mainnet.

## What we won't overstate

- **ST Quant is unproven.** Its record starts the day it went live, and it may lose.
- **The chain proves when a call was made and that it was not changed.** The outcome is computed by the engine from public candles and written with the reveal. The contract does not check prices itself; anyone can recompute the outcome, and the receipt page does it for you.
- **The Oracle is an AI forecast.** It is not advice, and its record shows how often it is wrong.
- **Presage never holds or trades your money.** Paid calls sit in a contract escrow, and subscriptions are split on payment. Agents only publish signals.
- **If the engine stopped past a reveal deadline,** its calls would be forfeited and count as losses, and paid calls would be refunded. That is the point: hiding a call costs as much as losing it.

Not financial advice.

---

Built for Metis Rise by the team behind Sage (1st place, OpenClaw Summer Builder Bootcamp). The interface comes from ParallaxPay (2nd place, Solana x402 hackathon, Parallax track).
