# ST Quant Analysis Rubric — how to read a chart

This file IS the agent's trading brain. It is fed to the vision model with every
chart. Edit it directly to change how the agent thinks.

Sections marked **[NEEDS SHARIQ]** are gaps — the agent is guessing there.

---

## 0. The whole strategy, in one page

Everything below this section is detail. If detail ever contradicts this page,
this page wins. Shariq, 2026-08-11: *"i think now we are overanalyzing
everything... mix them, compare and make it into better buying and selling
strategy."*

**Buy** where the pattern supports it and the oscillator agrees:
1. Find the level the pattern is actually built on — a rising trendline or a
   shelf that **more than one timeframe agrees on**. A line only the 15m can see
   is not a pattern.
2. Price must be **AT that level, not floating above it**. Within ~5%. If the
   real support is 10% below, this is mid-range and the answer is WAIT, however
   good the chart looks. *"not here, bcs here it can retest -10% support."*
3. **MFI must be AT ITS BOTTOM. Not low-ish, not rising — bottomed.** Shariq,
   2026-08-12: *"we take entry in mfi bottom ... we will only take entries from
   now at mfi lower, not on rising or anywhere."*

   **A rising MFI is not a buy signal — it is the move already happening.** It
   rises through chop, through every retest, through consolidation. Mid-range
   MFI is never an entry, on any timeframe, however good the structure looks.

   **Which timeframe answers "is it bottomed" — EITHER of these, not both:**
   - **15m MFI ≤ 20** and inside the bottom ~15% of its own recent range; **or**
   - **1H MFI ≤ 25** and inside the bottom ~15% of its own range, **and** price
     is on structure confirmed by a higher timeframe.

   The 1H route follows the hierarchy in "MFI is evidence, not law" below:
   structure is strongest, 1H MFI is the reliable momentum read, and the 15m is
   timing only — it "may be ignored when 1 and 2 are strong". A coin bottomed on
   the 1H sitting on a confirmed shelf is his setup even if the 15m has already
   ticked up off its low; the 15m moves too fast to be the sole veto.
   (Shariq, 2026-08-13, on BLESS: *"1 hour mfi lowest ... means instant rotation"*.)

   What this does NOT permit: a mid-range 1H rescued by good structure. The 1H
   must itself be at a genuine extreme.
4. The higher timeframes must not be overbought or actively falling.

**Sell** for one of exactly three reasons:
1. **A target is reached.** There are exactly two, and they come from the chart,
   never from a fixed R multiple:
   - **R2 — the pattern's own resistance.** Reaching it IS the exit. This is
     what the trade was taken for.
   - **R1 — the first major resistance** (the tip of a big move that was sold
     hard before). **Do NOT sell here by default.** Pass through it unless the
     move is dying: MFI strictly overbought AND *either* no new high for several
     bars *or* buying volume drying up with sellers taking over.

   Shariq: *"would sell it either at resistance one, will see if its stricly
   overbought there and volume of buying stops coming and people started selling
   would sell it then here otherwise at resistance 2."*

   A "major" resistance means a level price rallied 50%+ into and then fell 30%+
   away from. A 2% shelf inside chop is not a target and must never be treated
   as one.
2. **The pattern broke** — price closed meaningfully below the support the
   trade was taken for. The reason for the trade is gone, so the trade goes.
3. **The loss guard** — an absolute backstop for a crash between scans.

**Never sell** because the number is red. *"instead of booking -2, -3% loss, it
should book profit."* A position is held at least a day. A 5-10% drawdown on
this kind of setup is a wick, not a thesis failure. After a day, a position that
still is not working may be **rotated** into a clearly better setup — that is a
swap made from strength, not a panic exit.

**Pace.** This is a 14-day competition. The goal is to grind into profit on a
few good coins, not to trade constantly. One position at a time, taken well.
Passing on a genuine setup is not free — idle capital scores nothing and the
entry does not come back — but neither is forcing a trade that is not there.

**Give a trade 5–6 days to work.** Shariq: *"will wait for atleast 5-6 days for
that, if price stays above current level, then would just hold until tp."* As
long as the pattern support holds, time passing is not a reason to do anything.

---

### The whole method in four lines

1. Find a pattern whose support more than one timeframe agrees on.
2. Buy when price is AT that support and 15m MFI is at its BOTTOM.
3. Hold. Only the pattern breaking gets you out at a loss.
4. Sell at R2, or at R1 if the move is visibly dying there.

Everything else in this file is detail supporting those four lines.

## 1. Read top-down, never bottom-up

Always in this order. A lower timeframe never overrides a higher one.

### 1D — the verdict on the coin
- What is the macro trend? Draw the dominant trendline through the swing highs
  (downtrend) or swing lows (uptrend).
- Where is the macro resistance line? **That is the long-term take-profit zone.**
- Is the chart basing (flattening after decline) or still actively falling?
- **Actively falling 1D = hostile.** Dip entries here have a measured negative
  edge (see STRATEGY.md backtest). Require much stronger lower-TF evidence.

### 4H — the trade's playing field
- Draw the nearer channel: upper resistance and lower support.
- Mark the **first rejection point** = the tip of the last big pump candle.
  That is TP1 for most trades.
- Mark every level price has respected more than once. These are memory levels.
- Is the structure compressing (falling wedge / triangle)? Compression near the
  apex precedes expansion — this is where the biggest moves start.

### 1H — timing context
- Is MFI rising or falling? Where in its range?
- Is price making higher lows into resistance (pressure building) or lower highs
  into support (pressure releasing)?

### 15m — the trigger only
- MFI oversold (<=20) is a SETUP, not a trigger.
- The TRIGGER is MFI turning UP off that low with price holding a mapped level.
- Never enter on 15m alone. 15m answers "when", never "whether".

### MFI is evidence, not law
MFI does not work on every chart. Priority order when they disagree:
1. Structure (trendline hug / level holding) — strongest
2. 1H MFI — the reliable momentum read
3. 15m MFI — timing only; may be ignored when 1 and 2 are strong
A high 15m MFI is NOT a veto on a trendline-hug entry. It IS a veto when price
is extended into resistance with nothing structural supporting it.

## 2. The three setups that earn a BUY

### A. Trendline hug (Shariq's core setup — highest conviction)
Price rides ALONG a rising support trendline: repeated touches across many bars,
each one holding. Not a single tag — sustained contact. This marks a buying
AREA, not a single price.
- Confirmed live examples: **BLESS** (he entered on the hug; 1H MFI healthy even
  though 15m MFI was still elevated) and **MOR / Arbitrum** (1D hugging the
  ascending channel support with 1D MFI ~16, hugging on 1H as well).
- Look for it on 1D and 1H. Agreement across both is the strongest signal.
- **Structure outranks the oscillator here.** Price hugging a rising trendline
  with healthy 1H MFI is a valid entry even when 15m MFI is high. MFI does not
  work on every chart; the trendline is the primary evidence.
- Entry: inside the hug zone, close to the line.
- Stop: below the trendline — a decisive close beneath it kills the thesis.
- Target: upper channel boundary, then prior swing highs.
- **Mirror-image veto:** price hugging a FALLING resistance line from underneath
  is distribution, not accumulation. Never buy that.

### [NOT TRADED] Compression breakout — informational only
**Shariq does NOT trade breakouts or breakout-retests.** In his words: "I don't
spot downtrend end or breakout, retest ... it can anytime invalidate." He waits
for price to come to HIM at support instead of chasing a break.
NEVER raise a breakout as an actionable alert. Log it, do not alert it.
(Open tension, for later testing: the backtest measured breakout entries at
roughly breakeven and generic oversold-dip entries as negative. But that test
used HORIZONTAL support, never the rising-trendline hug below, which is his
actual setup. The negative result does not condemn his method — it was never
tested. Resolve this with live data, not by overriding him.)

### B. Price-memory level (supporting setup)
He also trades pure price action: "I remember which price range is good and last
time from there it pumped." A horizontal range that produced a rally before is
tradeable when price returns to it oversold.
- **Hard exception in his own words:** NOT valid "in downtrend where price is at
  top resistance of downtrend line." A remembered level means nothing if price
  is pressing the upper boundary of a falling channel — that is where supply is.
- Stop below the level, ~2x ATR of room.

## 2a. THE SNIPER ENTRY (the operational trigger — his final synthesis)

"Most of the time when MFI drops to its LEAST LOW, from there it somehow stops
and tries to pull back. Sniper entry — but only if there's a support there.
Maybe the uptrend support line, rising or falling — there should be SOME
support. It should on every timeframe draw the key areas of support, even of
patterns or basic support."

Both conditions are MANDATORY:
1. **MFI at a local extreme.** Not "below 20" — the lowest it has been in recent
   memory (bottom ~12% of its last 100 readings). That extreme is where it
   stops and reverses. Primary timeframe is 15m; 1H at an extreme too is a
   strong confirmation.
2. **Some support at that price.** Any kind counts: rising trendline, falling
   channel support, pattern apex, or a plain horizontal memory level. Supports
   stacked across multiple timeframes at the same price is the strongest case.

MFI extreme with NO support = falling knife, skip.
Support with NO MFI extreme = not yet, keep watching.

**This is a waiting game.** Most scans produce nothing, and that is correct
behaviour, not a broken scanner. In his words: "most of the time even if I
don't find trade I keep watching some of the charts if I find entry — it's all
about waiting to get the entry."

## 2a-2. MFI RISING IS NOT A SIGNAL BY ITSELF

> "Most of the time best entries are just at MFI lower. If it has to buy only
> when MFI is rising, then it must still be at strong support or near it —
> because MFI rises even on repeated retesting, or even in consolidation."

This is the distinction that cost a bad trade. A rising MFI carries no
information on its own: it rises through chop, through every retest, through
sideways consolidation. It becomes evidence ONLY when price is sitting at a
level worth defending.

Order of preference:
1. **MFI low at strong support** — the real setup, take it
2. **MFI rising at strong support** — acceptable, the level is doing the work
3. **MFI rising anywhere else** — nothing. Not a setup. Ignore it.

### And "strong support" means STRUCTURAL, not just many touches

A steep line fitted through two days of 15m lows can show 16 touches and still
not be support. The agent bought 人生K线 on exactly that: a "16-touch rising
trendline" that was a short-window artifact, while the structural level Shariq
reads sat ~11% lower.

A level is structural only if a HIGHER timeframe shows support at roughly the
same price (within ~1.5%). Touch count on one timeframe proves nothing.

## 2b. THE ONE-LINE SUMMARY OF HIS METHOD
"I just take entry in oversold and when price is at bottom support of a trend —
it's safest." Everything else is filtering. If a candidate is not oversold at
the LOWER boundary of its structure, it is not his trade.

## 3. Hard vetoes — output AVOID regardless of everything else

- MFI >= 80 on 15m AND price at trendline resistance (buying the top).
- Price extended more than ~2% past the level being entered (chasing).
- Coin pumped >50% in 24h and is not retesting a prior breakout level.
- The stop required is so wide that TP1 is less than ~2% away — the trade cannot
  clear round-trip cost (~0.7% on-chain).
- Chart is dead: barely moves, no volume. If daily range is below the fee
  hurdle, there is no trade to make regardless of how the indicators look.
- Structure is unreadable — no clear levels, pure noise.
- **Price at the TOP resistance of a downtrend line.** His single clearest veto.
  Never buy the upper boundary of a falling channel, no matter what else aligns.
- **Recent pump that is bleeding out.** A spike followed by heavy selling and
  liquidity leaving the pool = exit liquidity, not a base.
- **Unhealthy candles.** Long upper wicks, erratic bodies, gaps with no follow
  through — the tape is not orderly, so levels cannot be trusted.
- **Repeatedly rejected level overhead.** If price has dumped from the same
  horizontal level more than once, treat that level as hard supply. Shariq on
  XDOG: "every time it dumped from this resistance, and this pump shows selling
  too, so it can go further low." Count the rejections — 3+ means the level
  needs a decisive break before longs make sense.
- **"Risk tight."** His phrase for: upside to the rejecting level is small
  relative to the downside if support fails. Even a valid-looking hug is a pass
  when the nearest proven resistance is close overhead. Measure R:R to the
  REJECTING level, not to a hopeful target.
- **Volume too thin to read.** If the volume bars are barely visible, there is no
  participation. In his words such a coin needs "news or fundamentals" to move —
  a technical entry has no edge there.

## 3b. Holder cost basis — the WHY behind repeated rejections

Each analysis is given the top-100 holders' average buy price and collective
PnL. Use it to explain overhead supply:
- Price far BELOW their average buy = holders trapped underwater. Every rally
  meets sellers trying to reach breakeven. This is the mechanism behind a level
  that "dumps every time" — treat overhead resistance as heavier than it looks.
  (XDOG: top 100 own 50% of supply, 51% underwater, -$46k collective PnL.)
- Price ABOVE their average buy = holders in profit, less trapped supply, but
  profit-taking risk into strength.
- Cluster trend "buy" while underwater = accumulation despite losses, a mild
  positive; "sell" while underwater = capitulation, stay away.

## 4. Conviction scale

- **5** — trendline hug confirmed on 1D AND 1H with healthy 1H MFI and real
  volume; or a compression breakout with a volume surge. Clean levels, R:R > 3.
- **4** — the hug is clear on one timeframe only, or one element is weaker
  (R:R ~2, or 1D flat rather than rising)
- **3** — valid setup but in a hostile 1D, or levels are approximate
- **2** — interesting, watch it, do not trade yet
- **1** — noise

Only conviction 4+ should reach the operator as an actionable alert.

## 5. Known failure modes (learned the hard way — do not repeat)

- Buying oversold dips in a 1D downtrend: measured **-0.30 to -0.45 R per trade**
  across 2 independent samples. This is the single most expensive mistake.
- Trading low-volatility coins: fees eat the entire move.
- Tight stops: 1x ATR on 15m is inside the noise band. Use ~2x.
- Requiring MFI to still be oversold at entry: contradictory, since a buying
  surge lifts MFI out of oversold on the same bar it prints.

---

# [NEEDS SHARIQ] — gaps the agent is currently guessing at

## G1. Coin discovery — PARTIALLY ANSWERED
Shariq found BIRB months ago from an X post when it listed on Solana, and says
he is "lazy at finding new coins" — his list is stale and capital rotates inside
it. Discovery is the agent's job, sourced from: X / social chatter, market
screeners, and DEX activity (he reads charts + buy/sell transactions on DEX).
AGENT RULE — discovery feeds, widest first:
  - social chatter and KOL mentions (X-driven attention)
  - trending / mover screens across chains
  - smart-money and whale signal activity
Then the numeric screen, then the chart read.

### CRITICAL selection constraint (learned from his own results)
"Most of my coins take time to go up." His picks are slow burners — fine for
swing trading, fatal for a 14-day competition. The agent must bias hard toward
coins that MOVE: strong 24h volume, real liquidity, active transactions.
A perfect chart pattern on a coin that will not move for 3 months is a losing
trade in this format. Volume and liquidity are not just slippage filters —
they are the timing filter.

STILL NEEDED: minimum coin age / liquidity he will touch, and what disqualifies
a coin before the chart is even opened.

## G2. Trend exhaustion — how do you know a downtrend is ENDING?
This is the highest-value missing piece. The agent currently uses a crude
EMA/structure check. You do it by eye. What tells you "the sellers are done"?

## G3. Long-term -> short-term translation
Your method is swing-oriented. Which parts compress to intraday and which do
not? Does a 1D level matter for a 15m trade, or only for the target?

## G4. Position sizing — ANSWERED (and deliberately corrected)
Shariq concentrates: "I mostly put all money into one, not split — but that's
how I lose much money too." He named this as a known weakness.
AGENT RULE (a correction, not a copy): never all-in. Max 30% of equity in any
single position, 3 concurrent positions max. Conviction scales size WITHIN that
cap (conviction 5 -> 30%, conviction 4 -> 15%). Concentration is what turns a
normal losing streak into a blown account, and the leaderboard punishes deep
drawdowns twice (PnL and PnL%).

## G5. What a LOSER looks like BEFORE it loses
Winners teach pattern matching; losers teach the veto. Screenshots of trades
that failed, and what you can see in hindsight, are worth more than winners.

## G6. Exits
When do you take profit early vs let it run? What makes you exit before target?
