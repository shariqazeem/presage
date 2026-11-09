# ParallaxPay: the experience plan

Written 5 Nov 2026 for the NEAR HACKATHON build (deadline 14 Nov) and reset the same evening after the
founder's review. This is the reference every screen is built and checked against, so the whole app
feels like one product.

## From here (9 Nov): anyone can hire it, anyone can teach it

ParallaxPay went live on NEAR mainnet on 9 Nov. The founder then asked for three things:

1. **Onboarding and funding that anyone can do,** premium and easy, from any chain.
2. **A built-in wallet,** so people don't need one to start. No sponsored gas: the project can't fund
   strangers, and everything should run on its own.
3. **Agents people can shape:** their own rules and their own strategy, a leaderboard of whose
   strategy works, and the best ones adopted. One flywheel that judges can see fit together.

### What stays

- Everything in the 6 Nov list below.
- The vault's rules and its single agent account. No contract change is needed for any of this.
- ParallaxPay's own method (the founder's TA) as the house strategy, and the drawings as the hero.

### O1. Hire before you fund (shipped 9 Nov)

- The mandate ends in "Start my agent". No wallet is needed.
- Your agent's page shows what it would do with your mandate this minute, from its live reads and
  the same sizing table real trades use. That's one of three things:
  - the trade, with its stop and target on the chart;
  - a setup your style lets pass;
  - the closest coin, and the checks it still needs.
- **Done when:** a visitor with no wallet writes a mandate and sees their agent's next move in under
  a minute. Checked on phone and desktop.

### O2. Funding in one step, from any chain (shipped 9 Nov)

- One sheet funds the agent from either place:
  - **A NEAR wallet:** sign the mandate and add USDC in a single confirmation.
  - **Any chain, through NEAR Intents:** bring USDC from Base, Ethereum, Solana, Arbitrum, Tron or Bitcoin, then add it the moment it lands.
- /fund uses the same component.

### O3. A built-in account (shipped 9 Nov)

- **No wallet?** "Get a ParallaxPay account" makes a NEAR implicit account in the browser. Its key never
  leaves the device, and nobody else (ParallaxPay included) can move what's in it.
- **It works like any wallet.** It plugs into the same wallet interface, so joining, depositing,
  approving and withdrawing work unchanged, with no pop-ups.
- **Funding it:** send it NEAR from any exchange or wallet; a plain transfer creates the account. One
  tap then does the rest:
  1. Keeps 0.45 NEAR for gas.
  2. Swaps the rest to USDC with Rhea's instant swap.
  3. Signs the mandate.
  4. Deposits the USDC.

  Each step reads the account on NEAR first, so a retry carries on where it stopped. No gas is
  sponsored.
- **Yours to keep:** back up the key (show, copy, download), open it on another browser, import it
  into any NEAR wallet, or remove it once it's backed up.
- **Other chains (later):** a $2 test from Base settles whether NEAR Intents can deliver native NEAR
  to a new account.

### Founder's call, 9 Nov: real money, and keep them curious

- **No paper trading.** The record that matters is real money, sealed on NEAR, and the onboarding
  already shows what the agent would do.
- **Curiosity, not giveaways:**
  - The free "Right now for you" card names the trade, but its stop and target stay sealed until
    you fund.
  - On the board, a strategy's record is public, and its settings unlock only when you hire it.
- **NEAR AI only for paying members.** Teaching a strategy in words is for funded members only, so
  its cost always has a paying user behind it.

### S1. Your agent's strategy (next)

- **Every funded agent runs a strategy.** ParallaxPay's own method (the founder's TA) is the house
  strategy and the default.
- **Change the building blocks** (the engine's own `V2Params`):
  - how close to the level it buys;
  - where the stop goes;
  - the reward it needs;
  - how long it holds;
  - the daily-trend filter;
  - locking profit at +1R;
  - how picky it is.
- **Or teach it in your own words.** NEAR AI turns the text into those same blocks and shows them back
  for you to confirm.
- **A change is signed with your account** (a NEP-413 message, no gas), so nobody else can change your
  agent.
- **Each sealed plan names its strategy** and a hash of its settings, so the record can be checked
  without giving the recipe away.
- **Done when:** a funded member changes their agent's strategy, and its next plan is sealed with it.

### S2. The board, hiring a strategy, and adoption

- **The board ranks strategies by their real, sealed trades:**
  - trades taken;
  - win rate;
  - return per trade;
  - total.

  Losses are shown. Fewer than 3 trades is "new", not ranked.
- **A strategy's page** shows its record and receipts. "Hire this strategy" sets it on your agent and
  unlocks its settings.
- **Adoption:** when a community strategy beats the house over 20 or more trades, ParallaxPay adopts
  it and credits its creator. Creator rewards come after the hackathon.
- **Done when:** the board shows the house strategy and members' strategies side by side, and hiring
  one is a single signed tap.

### Order from here

| Phase | Target |
| --- | --- |
| O1 hire before you fund | 9 Nov ✓ |
| O2 funding from any chain in hiring | 9 Nov ✓ |
| O3 built-in account | 9 Nov ✓ |
| S1 your agent's strategy | 10–11 Nov |
| S2 the board, hiring a strategy, adoption | 11–12 Nov |
| Video and submission | 13 Nov |

**If time runs short,** cut in this order:
1. Adoption (keep the rule on the board).
2. Teaching in words, if NEAR AI credits aren't in place.

## From here (6 Nov): the agent's eye, a chart you can hold, every token

The founder reviewed the reset and asked for seven things, to be built on it, not instead of it:

1. **Any mandate size.** More than $100, any amount the member wants it to trade with.
2. **Fix the agent's TA first.** The lines must sit on the candles the way the founder draws them: trendlines through swing points that price respects, levels price has respected more than once.
3. **Zoom in and out** on the chart.
4. **Live TA by the agent.**
5. **Works, not information.** Premium, less noise, more doing. The desktop should feel as smooth as the phone app, with everything aligned.
6. **Every token it can trade.** Not just four, and deep liquidity isn't required.
7. **Don't remove what should stay.** Improve from here.

### What stays (do not remove)

- **The agent-native direction:**
  - The drawings are the hero.
  - Night is the agent's mind, paper is people, and foil is its signature.
  - Its voice is in the first person.
- **The floor:**
  - The stage: voice, drawing, checks, and the exact chart it read.
  - Its eyes, the floor stream, Ask, and Promises.
  - The hire section with the mandate card, the trust rows, and NEAR Intents.
- **Your agent:** proposals and missions on drawings, the mandate card with autopilot, talk to it, and kept promises.
- **Its work and receipts:** the timeline, the plan on its chart, the analyst's signed note, and in-browser verification.
- **Hiring:** meet, then the mandate strip, then the seal. The mandate is saved while the vault isn't live.
- **The rest:**
  - The How it trades profile and the share cards.
  - The performance work: server-seeded pages, the agent's saved candles, and a matching hydration.

### Why the lines looked wrong (found 6 Nov)

- **The trendline tolerance is a flat 2%, for touches and violations alike.**
  - On a 1H chart that moves about 1% an hour, a "resistance" line can sit 2% inside the candles.
  - Every high within 2% of it then counts as a touch. That is AURORA's "resistance 12×" cutting through the candles.
- **Levels were labelled by where they came from, not by where price is.**
  - A cluster of old highs below price was drawn as "R".
  - Below price it is support: resistance that flipped.
- **Clustering was greedy and fixed-width (1.5%),** so neighbouring levels merged or split depending on the order the swings came in.
- **Too many lines at once:** six levels, two trendlines and their labels covered the candles.
- **The same code feeds three things:** the agent's decisions, the chart image the NEAR AI analyst reads, and the drawing on the site. So the fix goes in `engine/stquant` once, and all three stay one brain.

### P1. The agent's eye: lines that sit on the candles

- **Tolerances scale with each coin's own volatility (ATR):**
  - A touch is a swing point within about 0.3 ATR of the line.
  - A wick may pierce about 0.6 ATR.
  - A candle body that closes through the line breaks it.
- **Trendlines:**
  - They join swing points at least two touches apart.
  - Bodies stay on the right side from the first touch to now.
  - Ranked by: unbroken and near price first, then touches, then span.
  - The touch points come back with the line and are drawn as dots, so anyone can see it sits on the wicks.
- **Levels:**
  - Swing highs and lows are clustered together, using the volatility tolerance.
  - Each level has its touches (distinct swings) and a role taken from price: support below, resistance above.
  - Levels touched from both sides are marked as flipped.
  - The zone's thickness is the spread of its touches.
- **A real chart layout:**
  - Empty space to the right of the last candle, as on every trading terminal.
  - Lines project into that space, and their labels sit there instead of on the candles.
  - The plan's target and stop boxes extend into it, which is where a plan belongs.
  - Price tags sit on the axis.
- **Less on screen:**
  - By default: the nearest support and resistance, the level it is trading, and its best trendlines.
  - The rest appear on request.
- **Checked:**
  - The history test re-runs before and after. The numbers stay off the site.
  - Screenshots of every coin on every timeframe.
- **Done when:** on every coin and timeframe, trendline dots sit on the wicks, no body crosses a live line, and every label matches where price is.

### P2. The mandate: any amount, any coin

- **Size:**
  - Presets plus a custom amount: any amount from $1, with no ceiling in the app.
  - The vault already has no ceiling.
  - Buys a day: presets plus custom, up to the vault's 48.
  - The same in the hiring flow and in the edit sheet.
- **Coins:**
  - "Any coin it finds" becomes the default. In the vault, an empty coin list means any coin the owner lists.
  - Members can still pick up to 8.
  - Vault tests and the testnet run are updated to cover it.

### P3. A chart you can hold

- **Zoom:**
  - Pinch on phones.
  - Pinch or ctrl/⌘-scroll on a trackpad or mouse. A plain scroll still scrolls the page.
  - Plus and minus buttons, and a double-tap to fit.
- **Pan:**
  - Drag sideways. Vertical swipes still scroll the page on phones.
- **Crosshair:**
  - Hover on desktop, press and hold on phones.
  - Shows the candle's time, open, high, low, close and money flow.
- **The lines stay where the agent drew them.**
  - They are computed once on its window, and zooming only changes the view.
  - Zooming out past its window loads older candles.
- **Smoothness:** gestures render once per frame, and nothing is recomputed while you move.

### P4. Live TA

- **Live price, straight from NEAR:**
  - While the page is open, the last candle and the price move every few seconds.
  - Prices come from the coin's own Rhea pool, or from Binance for coins whose candles come from Binance.
  - The distance to its level updates live.
  - The lines stay computed on the agent's own read, so they don't jitter.
- **"Watch it read":** the agent walks through its drawing step by step.
  - A pen draws each line while it says why: "Price turned up at $1,301 three times. That's my support."
  - It plays the first time the stage comes into view and can be replayed or stepped through.
- **When a new read lands** (every 15 minutes), the stage redraws and says so.

### P5. Every token it can trade

- **Which tokens:**
  - Every token with a classic Rhea pool against wNEAR or USDC: about 9,000 pools, and roughly 80 tokens with $5k or more of liquidity.
  - Excluded: stablecoins, staked-NEAR wrappers, and pools charging 1% or more.
  - Deep liquidity isn't required.
  - Tokens with no trades are listed as too quiet to read, because a chart nobody trades has nothing to read.
- **Candles:** from the coin's own Rhea pool, or from Binance where the coin has a deep market (NEAR, ZEC, BTC, ETH, SOL).
- **The agent's loop:**
  - Every 15 minutes it screens every coin's price against the levels it has mapped.
  - The coins near a level get the full four-timeframe read, the chart image and the analyst.
  - Slow timeframes refresh in rotation, within GeckoTerminal's rate limit.
- **Liquidity-aware sizing:** every buy is quoted on Rhea and shrunk until its price impact is under 1%.
- **Vault setup:**
  - The owner lists the routes in batches and registers the vault on each token.
  - The agent still can't trade anything the owner hasn't listed.
- **App:**
  - A coin list with search: price, 24h change, liquidity, and its status on each coin.
  - The stage picks the closest setup across all coins.
  - The mandate's coin step becomes "Any coin it finds", plus search.
- **Later:** Rhea's concentrated-liquidity (DCL) pools, where some newer tokens trade. They need a second swap path in the vault.

### P6. Works, not information

- **The desktop is the phone app, larger:**
  - The same components, sheets, segmented controls and order of things.
  - Content sits in a centred frame on a 4/8 spacing grid, and every edge lines up.
- **Show, don't explain:**
  - A paragraph that explains what the interface could show becomes a control or a chip, or goes.
  - Long text moves behind a tap.
- **The stage:** the chart, one sentence and the check pills. Details open on tap.
- **A screen-by-screen audit:** Floor, Your agent, Its work, the receipt, Hire, How it trades and Fund. Each gets phone and desktop screenshots before and after.

### Order from here

| Phase | Target |
| --- | --- |
| P1 the agent's eye | 6 Nov |
| P2 any amount, any coin | 6 Nov |
| P3 zoom, pan, crosshair | 7 Nov |
| P4 live TA | 7 Nov |
| P5 every token | 8–9 Nov |
| P6 works, not information | 10 Nov |

**Status, 6 Nov:** P1–P5 shipped and deployed. P6 has started: the stage checks open on tap, routine reads are trimmed on the floor, How it trades shows one coin at a time, and copy no longer says four coins. Still to do: the Your agent, Its work, receipt, Hire and Fund audit, with phone and desktop screenshots.

- Then M0: mainnet once the founder's NEAR arrives. With P5's storage, plan on about 6 NEAR rather than 5.
- Then the demo video and the submission (13 Nov).
- Each phase ends with phone and desktop screenshots, a commit, a push and a deploy.

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
