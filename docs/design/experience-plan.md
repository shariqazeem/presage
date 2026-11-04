# ParallaxPay: the experience plan

Written 5 Nov 2026 for the NEAR HACKATHON build (deadline 14 Nov) and reset the same evening after the
founder's review. This is the reference every screen is built and checked against, so the whole app
feels like one product.

## The reset (5 Nov, evening)

The first pass borrowed from exchanges: a watchlist, a ticker, a big balance, quick-action circles.
It came out generic, because exchanges already do that better and it hides the one thing only
ParallaxPay has. The founder's feedback:

- It should feel like the home of trading agents, where people live too.
- The technical-analysis screenshots, the agent visibly doing TA, are the best part.
- We are the first generation building this, so design for where agents are going, not for apps that already exist.

So the product is no longer "an exchange with an AI inside". It is **an AI trader that works in the
open, and the people who hire it.** Prices, balances and order rows stay, but as supporting detail.

## North star

Open ParallaxPay and you are watching an agent think. It draws its levels on a real chart in front of
you, says in one sentence what it is waiting for, and seals its plan on NEAR before it trades. People
are around it: hiring it, approving its plans, watching their trades. Within ten seconds you
understand what it does, and you want one working for you.

## Three ideas that make it next-generation

1. **A visible mind.** Nothing is a black box.
   - Its drawing animates as it reads: candles print, support and resistance draw themselves, the trendline extends, money flow traces underneath.
   - Its checks tick off one by one.
   - It speaks in the first person ("I'm waiting for money flow to turn up at $1,275").
   - The exact chart image it read is always one tap away, as proof.
2. **Mandates, not settings.** You don't configure a bot; you give an agent a mandate: how much, how often, which coins, what style, and whether it asks first.
   - The vault on NEAR enforces it.
   - You revoke it in one tap.
   - The mandate is a first-class object, a signed card that appears wherever it matters.
3. **Promises before actions.** Every plan is sealed on NEAR before the trade and opened after.
   - The record is a ledger of kept promises, losses included.
   - A sealed plan is something you can hold: a ticket with a foil seal and the drawing it was made on.
   - Agents check agents: the NEAR AI analyst, signed in a TEE, reviews ParallaxPay's plan before money moves. Their exchange is shown as a dialogue.

## Principles

1. **The agent's work is the hero.** Its drawing, its thinking and its promises lead every screen. Prices and balances support them.
2. **Instant.** Pages arrive rendered with data and polling takes over. No splash. Skeletons only for what can't be known yet. Budget: LCP under 1.5 s on a phone, CLS 0. No chart library on the first screen; drawings are plain SVG.
3. **Alive, with purpose.** Motion shows thinking (drawing, ticking, sealing), never decoration. Numbers that change roll.
4. **People live here.** Who's here, who hired it, who approved what: presence and the floor stream make it a place, not a page.
5. **One decision per screen when hiring.** Every choice updates the mandate card live.
6. **Tactile.** Every tap answers within 100 ms. Sheets slide up. Segmented thumbs move.
7. **One system.** Tokens and a small agent-native kit; no per-page styling.
8. **Confident and honest.** We show what it does and its record, losses included. We never promise returns, and no backtest numbers go on the site.

## Visual language

- **Paper is the human world; night glass is the agent's mind.**
  - On night: the agent's drawings, its thinking and its live state.
  - On paper: what people do, such as mandates, approvals, accounts and receipts.
- **Foil is the agent's signature:** seals, the live dot, the "now" marker on its drawings, the mandate's signature line. Nowhere else.
- **The founder's TA language, kept exactly:**
  - Green dashed support and red dashed resistance, each with its touch count ("S 1,275 · 4×").
  - Solid trendlines labelled with direction and touches.
  - Money flow (MFI) in violet underneath, with the 20 and 80 bands.
- **Agent voice:** first person, one or two short sentences, specific prices, no hype.

**Surfaces**
| Token | Paper | Night |
| --- | --- | --- |
| bg | `#FFFFFF` | `#0B0B0C` |
| surface | `#F6F6F4` | `#141416` |
| raised | `#FFFFFF` + 1px `#E6E6E3` | `#1B1B1E` + 1px `#26262A` |
| text | `#0B0B0C` | `#FFFFFF` |
| text-2 | `#3F3F46` | `#C9C9CF` |
| text-3 | `#8A8A92` | `#8A8A92` |
| up / down | `#12A150` / `#E5484D` | `#3DDC84` / `#FF6B6B` |
| drawing | | support `#3DDC84`, resistance `#FF6B6B`, MFI `#A78BFA`, grid `rgba(255,255,255,0.06)` |

**Type**
- Display: Inter Tight 900, 40 on phones and 56 on desktop, at most one per screen.
- Title 28. Headline 20/24. Body Inter 15/16. Caption 13.
- Micro 11 is the smallest size anywhere, including drawing labels.
- Numbers: IBM Plex Mono, tabular. Account money is always to the cent.

**Spacing, radius, elevation:**
- Spacing: 4, 8, 12, 16, 20, 24, 32, 48.
- Radius: 12 for controls, 16 for cards, 24 for stages.
- Cards are flat with a 1 px line. Only floating layers cast shadows.

**Motion**
- **The drawing sequence**, the signature. Total 1.6 s, and it replays when the coin or timeframe changes:
  1. Candles print left to right.
  2. Levels draw across.
  3. The trendline extends.
  4. Labels settle.
  5. MFI traces.
  6. The foil "now" dot starts to breathe.
- **Checks:** tick in sequence, 90 ms apart.
- **Seal:** the foil stamp lands with a short spring.
- **Press:** scale to 0.97 in 120 ms. **Rolling digits:** 400 ms.
- **Implementation:** CSS only, time-based, final state by default, so nothing can stall hidden. Respect `prefers-reduced-motion`.

## The agent-native kit

- **`AgentDrawing`**: the live drawing of a coin on one timeframe, computed in the browser with the agent's own level, trendline and MFI code on the agent's own window of candles.
  - Optional plan zones: entry, stop, target.
  - Optional in/out markers.
  - Sizes: stage, card and thumb.
  - Hovering a level tells its story ("Support at $1,275: price bounced here 4 times").
- **`AgentVoice`**: the agent's sentence as a message from its avatar.
- **`ThinkingChecks`**: its checklist, ticking in sequence, with conviction dots.
- **`Heartbeat`**: "Next read in 7:12", or "Reading now…" with a pulse.
- **`MandateCard`**: the mandate as a signed card, in three states: draft, signed and paused.
- **`SealTicket`**: a sealed plan, carrying coin, sealed time, fingerprint, foil stamp and its drawing thumb. After the trade it gets an outcome stamp.
- **`Mission`**: a live trade, showing its drawing with plan zones and the live price, P&L, and the sell action.
- **Already built:** `Presence` (avatars of who's here), `Segmented`, `Switch`, `Sheet`, `RollingNumber`, `Chip`.

## App shell

- **Phones:**
  - Top bar: the mark, the agent's live dot with its next read, and the wallet pill.
  - Bottom tabs: Floor, Your agent, Its work.
  - Installable.
- **Desktop:**
  - The top bar keeps navigation and the wallet pill.
  - The price ticker becomes an **agent status strip**: what it's reading, the next read, coins watched, plans sealed today, and people here.

## Screens

### Floor: the room where it works (`/`)
1. **Visitors** get one line and two buttons above the stage: "An AI trader that works in the open. Watch it read the market, then hire it to trade for you inside your rules." Members get a slim "your agent" strip instead.
2. **The stage** (night):
   - The agent header: breathing mark, "Reading ZEC · 1H", and the heartbeat.
   - Its voice: one or two sentences.
   - The drawing, big: tabs 1D, 4H, 1H and 15m, plus "The exact chart it read".
   - Beside it, its thinking: the checks ticking, its conviction, and what would make it act.
3. **Its eyes:** the four coins as tiles. Each has a drawing thumb, a status (Watching / Setup forming / In a trade), and the price small. Tapping one moves the stage to that coin and the drawing replays.
4. **The room:** agents and people in one stream.
   - Reads, setups, the analyst's reviews, seals, trades, joins.
   - Drawing thumbs on setups and seals.
   - Presence: who's here now.
5. **Its promises:** the latest sealed plans as tickets, sealed or opened, wins and losses alike.
6. **Hire:** the mandate card as an invitation for visitors, or the member's own card. Trust as one quiet row. NEAR Intents for funds on other chains.
- **Done when:**
  - The first screen on a phone shows the agent drawing on a real chart, its sentence, and the hire button.
  - The drawing plays on load.
  - No chart library loads on this page.

### Your agent (`/desk`)
1. **Header** (night): ParallaxPay working for you, what it's watching for you, the heartbeat. The mandate card sits beside it with edit, the autopilot switch and stop.
2. **Needs you:** each proposal is the agent's message with its drawing and plan zones inline. Actions: "Approve $10" and "The exact chart".
3. **Working on:** missions (open trades) on their drawings with plan zones and live P&L. A sell action when it suggests one, or when you're in ask-first mode.
4. **Talk to it:** its messages to you, and the ask box: "Why didn't you buy NEAR today?"
5. **Account:** a compact strip with balance, holdings, Add and Withdraw.
6. **Kept promises:** your trades as small tickets with outcomes.

### Its work (`/record`) and the receipt (`/record/[id]`)
- **Its work:** the ledger as a gallery of tickets, each with its drawing thumb, plan zones and outcome stamp. Honest totals on top.
- **Receipt:**
  - The drawing the plan was sealed on, as the hero, with plan zones and in/out markers.
  - The promise timeline: sealed → traded → opened.
  - The analyst's signed note.
  - The plan, with in-browser verification.
  - The exact chart image it read.

### Hire ParallaxPay (`/start`)
1. **Meet:** the stage with the live drawing playing, and the agent introducing itself and its method in two lines.
2. **Mandate:** asks first or autopilot, then style, coins (tiles with drawing thumbs) and size. The mandate card fills in live at the top of every step.
3. **Sign:** the finished mandate card and "Sign on NEAR". The seal lands.
4. **Fund**, then **Done:** "I'm on it", with its first message to you and what it's watching for you.
- **While the vault isn't live:** the mandate is saved, and the screen says plainly that signing opens when the vault is live. No dead end.

### How it trades (`/how-it-trades`)
The agent's profile:
- Identity.
- The method as the founder's TA, explained on real annotated drawings ("This is support: price bounced here 4 times").
- Its tools: Rhea, the NEAR AI analyst in a TEE, and NEAR Intents.
- The rules the vault enforces.

### Fund (`/fund`)
NEAR Intents deposit, polished later.

## Performance

1. Already done: no splash, `next/font`, pages server-rendered with data.
2. Hydration matches exactly. Clocks start from the server's render time, so React keeps the server HTML instead of redrawing the page.
3. Drawings are SVG computed from candles; the floor ships no chart library. The live candle chart only loads where it's still used.
4. Seed each coin's 1H candles with the page, for the stage and the thumbs.

## Order of work

Each step ends with desktop and phone screenshots, a commit, a push and a deploy.

- **M0. Unblock** (needs the founder's 5 NEAR): deploy the vault to mainnet, list the 4 coins, start the agent with its key, make a first real trade.
- **R1. The drawing and the floor:** `AgentDrawing`, the stage, its eyes, the agent status strip, and seeded candles.
- **R2. Your agent:** proposals and missions on drawings, the mandate card, and talk to it.
- **R3. Its work and the receipt.**
- **R4. Hire ParallaxPay:** meet, a live mandate card, and the seal moment.
- **R5. How it trades, then QA:** phone and desktop pass; loading, empty and error states; copy; performance; share images.

Target: R1–R2 by 7 Nov, R3–R5 by 9 Nov, then mainnet trading, the demo video and the submission.
