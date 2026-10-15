# Metis Rise application: Presage

Answers for the form at metis.io/agent-builder-program. Fill the bracketed parts on the day; every number must be read from the live page or the chain when you submit, never from memory.

---

**Project name**
Presage

**One line**
AI trading agents whose every call is sealed on Metis before the market moves, so their record can't be faked.

**Website** · https://presage.trade (live now at https://presage.80.225.209.190.sslip.io)
**GitHub** · https://github.com/shariqazeem/presage
**Category** · AI agents · payments (x402) · identity (ERC-8004) · escrow · on-chain receipts
**Team** · Shariq (github.com/shariqazeem), solo builder. Built Sage (1st place, OpenClaw Summer Builder Bootcamp, judged by Metis, GOAT Network, ClawUp and CryptoChicks) and ParallaxPay (2nd place, Solana x402 hackathon, Parallax track).

---

## What it does

Signal sellers show screenshots. Presage shows the chain.

Every call a Presage agent makes is sealed on Metis Andromeda as a hash before the outcome. When the market has decided, the call is revealed against that hash and scored by price. If it is not revealed in time, anyone can forfeit it and it counts as a loss. So an agent's record on Presage is every call it ever made, losses included, and nobody, us included, can edit it.

People watch it work. The floor (`/floor`) streams every agent's activity, and ST Quant's radar shows every market it watches with how close each is to a setup. Nothing is hidden except the levels of a sealed call, which belong to its backers until it resolves.

Three ways in:

1. **Market Oracle.** Ask which way one of 84 coins goes over 1, 4 or 24 hours. A quant model and three AI models vote. $0.05 a call over x402; the payment sits in escrow until the call is revealed.
2. **ST Quant.** Trade setups (entry, stop, target) on BSC and X Layer pools, sealed the moment they fire. $3 per 30 days once its record is long enough. It is unproven, and we say so.
3. **Deploy your own agent.** Describe a strategy in plain English. Presage turns it into rules the creator confirms (data, never code), mints the agent an ERC-8004 identity, seals the spec by hash, runs it, and seals every call. Once it has a record, the creator earns 80% of every subscription and claims it on chain.

No agent can take subscribers until it has 10 scored calls over 7 days. The contract enforces it, for our agents too.

## How it uses Metis (the four problem areas)

| Area | What Presage does on Andromeda |
|---|---|
| **Payments (x402)** | `POST /api/oracle/call` answers 402 with x402 payment requirements on `eip155:1088` in METIS, m.USDC or m.USDT. The payer's own wallet pays `PresageMarket.payForCall`; the retry carries the transaction in `X-PAYMENT`. Metis has no public facilitator and m.USDC lacks EIP-3009, so Presage settles itself with an `escrow` scheme. Agents can do all of this over MCP too. |
| **Identity (ERC-8004)** | Every agent is an identity in the canonical registry (`0x8004A169…a432`), owned by its creator. PresageAgents ties each identity to the hash of its strategy; a changed strategy must be a new agent. |
| **Stablecoin escrow** | Paid calls are locked in PresageMarket, released 80/20 to creator and platform only when the call is revealed, and refunded if the call is not sealed within 15 minutes or is forfeited. Lock, deliver, release. |
| **Re-verifiable receipts** | Every call has a public receipt. Its "Check it yourself" panel re-hashes the call against the commitment in PresageCalls and re-scores it from public candles, in the visitor's browser. |

**Contracts (Metis Andromeda)**
- PresageCalls · [address]
- PresageAgents · [address]
- PresageMarket · [address]
- House agents: Market Oracle, ERC-8004 #[id]; ST Quant, ERC-8004 #[id]

All verified on the Metis explorer. METIS is priced by Chainlink's METIS/USD feed on Andromeda.

## Users and activity

Every user action is a transaction from the user's own wallet on Andromeda:

- An Oracle call is one transaction (two the first time in a stablecoin: approve, then pay). Three calls a month makes a counted user.
- A subscription is $2 or more settled, which makes a counted user by itself.
- A creator mints an identity, seals a spec, sets prices and claims earnings: four transactions from their own wallet.
- Every seal, reveal, settlement and claim burns METIS gas. The Oracle also seals its own calls every 4 hours, so its record keeps growing whether or not anyone is paying.

Users can link Telegram to get calls and outcomes, which also gives each one a unique Telegram ID.

**First users.** People who already watch charts: our trading circles and Telegram groups, OpenClaw bootcamp peers, Metis community channels. The pitch is one line: every call this AI made is on chain from before it happened, so check the record.

## What we won't overstate

- ST Quant has never been shown to be profitable. Its record starts the day it went live.
- The chain proves when a call was made and that it was not changed. The outcome is computed from public candles and written with the reveal; the contract does not check prices itself, and anyone can recompute it.
- The Oracle is an AI forecast with a public record, not advice. Presage never holds or trades anyone's money.

**Numbers at submission** (read from the live page on the day)
- Calls sealed: [ ] · scored: [ ] · forfeited: [ ]
- Paid Oracle calls: [ ] · subscriptions: [ ] · agents deployed by creators: [ ]
- Unique wallets that transacted: [ ]
