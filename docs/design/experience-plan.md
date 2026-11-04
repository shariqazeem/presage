# ParallaxPay: the experience plan

Written 5 Nov 2026 for the NEAR HACKATHON build (deadline 14 Nov). This is the reference every screen
is built and checked against, so the whole app ends up feeling like one product.

## North star

Open ParallaxPay and within three seconds you see an agent working with real charts and real money,
and you want it working for you. It should feel like a top iOS finance app or an exchange (instant,
tactile, alive, numbers first), in ParallaxPay's own paper-and-ink look with foil for whatever is live
or sealed.

## What's wrong today

1. **It's a website, not an app.** A marketing hero, long scrolling sections, and copy before product. The product (the live agent) starts below the fold on phones.
2. **It feels sluggish.**
   - A 2.9 s intro screen on the first visit.
   - Every screen fetches its data in the browser after load, so skeletons show first.
   - Live measurement: data arrives about 1.5–2 s after navigation; the server answers in 0.66 s.
   - Fonts come through a render-blocking `@import`.
3. **Typography and density.**
   - 9–10 px labels.
   - Sizes chosen screen by screen.
   - Numbers don't lead.
4. **Onboarding is a long form.** No excitement and no live feedback on choices. It dead-ends while the vault isn't live.
5. **Surfaces are inconsistent.** Dark and light panels mixed without a rule. Different radii and spacing. Components styled one by one.
6. **Motion is either absent or fragile.**
   - No press feedback.
   - Prices don't tick.
   - Fade-ins can stall in background tabs.
7. **Empty and blocked states are thin.** An empty record, and a desk you can't reach without the vault.

## Principles

1. **Product first.** The first screen is the agent at work. Marketing copy shrinks to one line and a button.
2. **Instant.**
   - Pages arrive rendered with data: server-render, then poll.
   - No splash.
   - Skeletons only for what truly can't be known yet.
   - Budget: LCP under 1.5 s on a phone, CLS 0.
3. **Alive.**
   - Every changing number rolls.
   - Prices flash up or down.
   - The agent's status pulses.
   - The floor streams.
4. **One decision per screen in onboarding.** Every choice previews its consequence right away.
5. **Tactile.**
   - Every tap answers within 100 ms: press scale and state change.
   - Sheets slide up from the bottom.
   - Segmented controls move their thumb.
6. **Numbers are the hero.** Big tabular numerals. Colour only for up and down. Foil only for the agent, live states and seals.
7. **One system.** Tokens and a small component kit; no per-page styling.
8. **Confident and honest.** We say what it does and show its record, losses included. We never promise returns.

## Design system v2

**Surfaces**
| Token | Light (paper) | Night (live agent) |
| --- | --- | --- |
| bg | `#FFFFFF` | `#0B0B0C` |
| surface | `#F6F6F4` | `#141416` |
| raised | `#FFFFFF` + 1px `#E6E6E3` | `#1B1B1E` + 1px `#26262A` |
| text | `#0B0B0C` | `#FFFFFF` |
| text-2 | `#3F3F46` | `#C9C9CF` |
| text-3 | `#8A8A92` | `#8A8A92` |
| up / down | `#12A150` / `#E5484D` | `#3DDC84` / `#FF6B6B` |

Rule: paper is where people act (rules, approvals, account); night is where the agent works (terminal,
chart, its thinking).

**Type**
- Display: Inter Tight 900, 40/44 on phones, 56 on desktop. One per screen at most.
- Title: 28. Headline: 20/24.
- Body: Inter 15/16.
- Caption: 13.
- Micro: 11, the smallest size anywhere. No more 9 px.
- Numbers: IBM Plex Mono with tabular figures. Prices and balances use the display sizes in mono.
- Fonts load through `next/font`: self-hosted, preloaded, no layout shift.

**Spacing, radius, elevation**
- Spacing: 4, 8, 12, 16, 20, 24, 32, 48.
- Radius: 12 for controls, 16 for cards, 24 for major panels, full for pills.
- Elevation: cards are flat with a 1 px line. Only floating layers (sheets, sticky bars, toasts) cast a soft shadow.

**Motion**
- Press: scale to 0.97 in 120 ms.
- Sheets: spring.
- Tabs and segmented thumbs: 220 ms.
- Rolling digits: 400 ms.
- Price flash: 600 ms tint.
- Entrances only move, never fade from zero, so content is readable even if animation never runs.
- Respect `prefers-reduced-motion`.

**Kit:** `Button` (primary / secondary / ghost, sizes L/M/S), `IconButton` (round, with label below, like Coinbase quick actions), `Card`, `Stat`, `Pill`/`Chip`, `Segmented`, `Switch`, `Sheet`, `ListRow`, `RollingNumber`, `PriceFlash`, `Sparkline`, `ProgressRing`, `Avatar` (agent, analyst, people), `Toast`, `Skeleton`, `EmptyState`.

## App shell

- **Phones**
  - Compact top bar: mark, the agent's live dot ("Live · next read 2:31"), wallet pill.
  - Bottom tab bar: Floor, Desk, Record. The active tab gets a foil thumb.
  - Safe areas respected.
  - Installable (PWA, standalone, ink theme colour).
  - Actions open as bottom sheets.
- **Desktop**
  - A top bar with a live ticker strip: each coin's price and 24h change, plus the agent's status.
  - Navigation and wallet pill.
  - Exchange-style three-column layouts where there's data.
- **Transitions:** tab changes slide a little (View Transitions where the browser has them).

## Screens

### Floor: the agent at work
- **Phones, top to bottom:**
  1. Agent status card: avatar pulse, "Watching 4 coins", next read, people here.
  2. Coin strip: price rolls, 24h, sparkline, status chip.
  3. Chart card: chart with its levels and MFI, timeframe control, "the chart it read".
  4. The agent's thought: its sentence as a message from its avatar, with the checklist ring (4/6) opening into the full list.
  5. Ask bar.
  6. The live floor.
  7. For visitors, a sticky "Hire ParallaxPay" bar above the tab bar.
- **Desktop:** three columns. Watchlist on the left; chart, thought and checklist in the middle; floor and ask on the right. The value line sits in the top bar area, one line and a button.
- **Trust:** "Why trust it" becomes a quiet row of three icons under the terminal: rules on NEAR, plans sealed, your money.
- **Done when:**
  - The first paint already has prices and the agent's status; no skeleton on reload.
  - The phone's first screen shows the agent, a coin and the hire button.
  - Every price ticks.

### Get started: hiring the agent, one decision per screen
0. **Hello.** The agent introduces itself with live proof ("I'm watching NEAR at $4.02. Momentum is mid-range, so I'm waiting.").
1. **How it works with you:** Ask first or Autopilot. Two big illustrated cards.
2. **Style:** Calm, Balanced or Bold, with what each means in practice.
3. **Coins:** live tiles with price and sparkline; tap to choose.
4. **Size:** largest buy as a slider with presets, buys a day as a stepper, and a live "most it puts into new trades in a day" line.
5. **Your agent's contract:** a ticket-style summary with the foil seal, and what signing does.
6. **Fund:** a big amount input with the wallet balance, or "from another chain" through NEAR Intents.
7. **Done:** the agent's moment ("I'm on it"), its first next step, then your desk.
- **Mechanics:** full-screen steps, progress dots, swipe or Next, the button pinned at the bottom.
- **While the vault isn't live:** finish everything, save the rules, and say plainly when joining opens. No dead end.
- **Done when:** every step fits one phone screen, every choice visibly changes the preview, and the flow takes under 60 seconds.

### Desk: your account
- **Top:** big rolling balance, today's change, and an account sparkline.
- **Quick actions:** Add, Withdraw, Rules, Stop, as round icon buttons.
- **Autopilot:** an iOS switch, with today's buys shown as a ring.
- **Approvals inbox:** a card per proposal, the chart it read in a sheet, and one-tap approve.
- **Open positions:** exchange-style rows (coin, size, entry, mark, P&L %, a stop-to-target mini bar).
- **Activity** (your floor) and **history** (receipts).
- **Done when:** every action is reachable in one tap from the top half.

### Record and receipt
- **Record:** win-rate ring, P&L, trade count, filter chips (all / open / closed), and exchange-style history rows.
- **Receipt:**
  - A ticket with a foil seal.
  - The chart the plan was sealed on.
  - Price since, with markers.
  - Verification checks that tick themselves off.

### How it trades: the agent's profile
- A profile header: avatar, name, "Trader · live on NEAR", stats.
- Method cards, live checklists per coin, the analyst, and the record.

### Fund: NEAR Intents
- An exchange-style deposit: asset and network picker with chain marks, amount, quote card, deposit address with a QR code, and a status timeline.

## Performance plan

1. Remove the intro screen.
2. Move fonts to `next/font`.
3. Server-render the floor, desk, record and receipt with their data, and hand it to React Query as initial data. The page arrives filled; polling takes over.
4. Prefetch the default coin's candles on the server, so the chart draws on hydration.
5. Short cache headers on the read APIs (`s-maxage`).
6. Measure before and after: LCP, CLS and TBT on phone and desktop.

## Order of work

Each step ends with desktop and phone screenshots, a commit, a push and a deploy.

- **M0. Unblock (needs the founder's 5 NEAR):** deploy the vault to mainnet, list the 4 coins, start the agent with its key, do a first real trade.
- **M1. Foundations:** tokens, type scale, `next/font`, splash removed, app shell (top bar, ticker, tab bar), motion helpers (press, rolling number, price flash), kit v2.
- **M2. Floor:** server-rendered, phone app layout, desktop three columns.
- **M3. Get started:** the full-screen hiring flow.
- **M4. Desk.**
- **M5. Record, receipt, How it trades, Fund.**
- **M6. QA:** phone and desktop pass, loading/empty/error states, copy pass, performance check, OG and share images.

Target: M1–M3 by 7 Nov, M4–M6 by 9 Nov, then mainnet trading, the demo video and the submission.
