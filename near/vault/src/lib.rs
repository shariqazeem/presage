//! ParallaxPay vault: the account people fund on NEAR so the ParallaxPay agent can trade for them.
//!
//! - A member joins, deposits USDC and sets their rules: autopilot on or off, which coins the agent
//!   may buy (any coin the owner lists, or up to eight of them), the largest buy, and how many buys a
//!   day. `stop` turns autopilot off in one call.
//! - The agent may only swap a member's coins between USDC and those coins, through Rhea pools the
//!   owner has listed, inside the member's rules. Withdrawals pay the member and nobody else, and
//!   never wait on the agent or the exchange.
//! - Before the agent enters a trade it can seal its plan here (sha256 of a salt and the plan). When
//!   it opens the plan later, the contract checks it against the seal, so a call can't be rewritten.
//! - Every trade knows exactly what it got: the coins go into the vault's own account on Rhea, are
//!   swapped there (Rhea returns the amount) and withdrawn back (Rhea reports what arrived). One trade
//!   runs at a time, so whatever sits in that Rhea account belongs to the running trade, and
//!   `recover` can always settle a trade that stopped part-way.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, PromiseError};
use std::collections::BTreeMap;

mod account;
mod owner;
mod trade;
#[cfg(test)]
mod tests;

pub use trade::{SwapAction, GAS_RECOVER, GAS_TRADE};

pub(crate) const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// Paid on joining to cover the member's storage, and returned by `leave`.
pub const JOIN_DEPOSIT: NearToken = NearToken::from_millinear(20);
/// How long a trade must have been running before `recover` may settle it.
pub const RECOVER_AFTER_NS: u64 = 10 * 60 * 1_000_000_000;
pub(crate) const DAY_NS: u64 = 86_400 * 1_000_000_000;
pub(crate) const MAX_COINS: usize = 8;
pub(crate) const MAX_BUYS_PER_DAY: u32 = 48;
pub(crate) const MAX_PLAN_BYTES: usize = 4096;
pub(crate) const MAX_HOPS: usize = 3;
const MAX_RESULT_BYTES: usize = 16 * 1024;

/// What a member allows the agent to do with their account.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Rules {
    /// When off, the agent can't trade this account at all.
    pub autopilot: bool,
    /// The largest buy the agent may make, in USDC base units (6 decimals).
    pub max_trade: U128,
    /// Buys the agent may make per UTC day. Sells are never limited, so it can always get out.
    pub trades_per_day: u32,
    /// The coins the agent may buy. Empty means any coin the owner lists.
    pub coins: Vec<AccountId>,
    /// How picky the agent is about entries: 0 calm (only its best setups), 1 balanced, 2 bold.
    pub style: u8,
}

impl Rules {
    pub fn off() -> Self {
        Self { autopilot: false, max_trade: U128(0), trades_per_day: 0, coins: vec![], style: 1 }
    }
}

#[near(serializers = [borsh])]
pub struct Member {
    pub balances: BTreeMap<AccountId, u128>,
    pub rules: Rules,
    /// The UTC day `buys_today` counts.
    pub day: u64,
    pub buys_today: u32,
    pub joined_at: u64,
}

impl Member {
    fn new(rules: Rules) -> Self {
        Self { balances: BTreeMap::new(), rules, day: 0, buys_today: 0, joined_at: env::block_timestamp() }
    }
}

/// How to get from USDC to a coin on Rhea.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Route {
    /// From USDC to the coin, e.g. [USDC, wNEAR, ZEC].
    pub path: Vec<AccountId>,
    /// The Rhea pool for each hop along `path`.
    pub pools: Vec<u64>,
}

/// A sealed call: the agent's plan, hidden until it opens it.
#[near(serializers = [borsh])]
pub struct Call {
    pub account_id: AccountId,
    /// sha256 of the 32-byte salt followed by the plan's bytes.
    pub hash: [u8; 32],
    pub sealed_at: u64,
    pub sealed_block: u64,
    /// Zero while sealed.
    pub opened_at: u64,
}

/// Where the coins of the running trade are.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Stage {
    /// On their way from the vault into its Rhea account.
    Depositing,
    /// `amount` of the input is in the Rhea account and the swap is running.
    Swapping { amount: U128 },
    /// On their way back to the vault: the output after a swap (`filled`), or the input after a failed one.
    Returning { token: AccountId, amount: U128, filled: bool },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Trade {
    pub id: u64,
    pub account_id: AccountId,
    pub by_agent: bool,
    pub path: Vec<AccountId>,
    pub pools: Vec<u64>,
    pub amount_in: U128,
    pub min_out: U128,
    pub call: Option<u64>,
    pub stage: Stage,
    pub started_at: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner: AccountId,
    agent: AccountId,
    exchange: AccountId,
    usdc: AccountId,
    paused: bool,
    routes: Vec<Route>,
    members: LookupMap<AccountId, Member>,
    member_count: u32,
    calls: Vector<Call>,
    /// What the vault owes its members, per token. Its token balances never fall below this.
    totals: BTreeMap<AccountId, u128>,
    trade: Option<Trade>,
    trade_count: u64,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner: AccountId,
    pub agent: AccountId,
    pub exchange: AccountId,
    pub usdc: AccountId,
    pub paused: bool,
    pub routes: Vec<Route>,
    pub members: u32,
    pub calls: u64,
    pub trades: u64,
}

#[near(serializers = [json])]
pub struct MemberView {
    pub balances: BTreeMap<AccountId, U128>,
    pub rules: Rules,
    pub buys_today: u32,
    pub joined_at: U64,
}

#[near(serializers = [json])]
pub struct CallView {
    pub id: u64,
    pub account_id: AccountId,
    pub hash: String,
    pub sealed_at: U64,
    pub sealed_block: U64,
    pub opened_at: Option<U64>,
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner: AccountId, agent: AccountId, exchange: AccountId, usdc: AccountId) -> Self {
        Self {
            owner,
            agent,
            exchange,
            usdc,
            paused: false,
            routes: vec![],
            members: LookupMap::new(b"m"),
            member_count: 0,
            calls: Vector::new(b"c"),
            totals: BTreeMap::new(),
            trade: None,
            trade_count: 0,
        }
    }

    pub fn get_config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            agent: self.agent.clone(),
            exchange: self.exchange.clone(),
            usdc: self.usdc.clone(),
            paused: self.paused,
            routes: self.routes.clone(),
            members: self.member_count,
            calls: self.calls.len() as u64,
            trades: self.trade_count,
        }
    }

    pub fn get_member(&self, account_id: AccountId) -> Option<MemberView> {
        let today = env::block_timestamp() / DAY_NS;
        self.members.get(&account_id).map(|m| MemberView {
            balances: m.balances.iter().map(|(t, a)| (t.clone(), U128(*a))).collect(),
            rules: m.rules.clone(),
            buys_today: if m.day == today { m.buys_today } else { 0 },
            joined_at: U64(m.joined_at),
        })
    }

    pub fn get_call(&self, id: u64) -> Option<CallView> {
        let c = self.calls.get(u32::try_from(id).ok()?)?;
        Some(CallView {
            id,
            account_id: c.account_id.clone(),
            hash: to_hex(&c.hash),
            sealed_at: U64(c.sealed_at),
            sealed_block: U64(c.sealed_block),
            opened_at: (c.opened_at > 0).then_some(U64(c.opened_at)),
        })
    }

    pub fn get_calls(&self, from: u64, limit: u64) -> Vec<CallView> {
        (from..from.saturating_add(limit.min(100)).min(self.calls.len() as u64)).filter_map(|id| self.get_call(id)).collect()
    }

    /// The trade running now, if any.
    pub fn get_trade(&self) -> Option<Trade> {
        self.trade.clone()
    }

    /// What the vault owes its members, per token.
    pub fn get_totals(&self) -> BTreeMap<AccountId, U128> {
        self.totals.iter().map(|(t, a)| (t.clone(), U128(*a))).collect()
    }
}

impl Vault {
    pub(crate) fn assert_owner(&self) {
        near_sdk::assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner, "Only the owner can do this");
    }

    pub(crate) fn balance(&self, account_id: &AccountId, token: &AccountId) -> u128 {
        self.members.get(account_id).and_then(|m| m.balances.get(token).copied()).unwrap_or(0)
    }

    pub(crate) fn credit(&mut self, account_id: &AccountId, token: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        // A member can only be missing here if they left while a withdrawal was failing on its way
        // out; bring the record back so the coins stay theirs.
        if !self.members.contains_key(account_id) {
            self.members.insert(account_id.clone(), Member::new(Rules::off()));
            self.member_count += 1;
        }
        let member = self.members.get_mut(account_id).unwrap();
        let balance = member.balances.entry(token.clone()).or_insert(0);
        *balance = balance.checked_add(amount).unwrap_or_else(|| env::panic_str("Balance overflow"));
        let total = self.totals.entry(token.clone()).or_insert(0);
        *total = total.checked_add(amount).unwrap_or_else(|| env::panic_str("Balance overflow"));
    }

    pub(crate) fn debit(&mut self, account_id: &AccountId, token: &AccountId, amount: u128) {
        let member = self.members.get_mut(account_id).unwrap_or_else(|| env::panic_str("Not a ParallaxPay member"));
        let balance = member.balances.get(token).copied().unwrap_or(0);
        require!(amount > 0 && amount <= balance, "Not enough balance");
        if amount == balance {
            member.balances.remove(token);
        } else {
            member.balances.insert(token.clone(), balance - amount);
        }
        let total = self.totals.get_mut(token).unwrap_or_else(|| env::panic_str("Totals out of step"));
        *total -= amount;
    }

    pub(crate) fn route_of(&self, coin: &AccountId) -> Option<&Route> {
        self.routes.iter().find(|r| r.path.last() == Some(coin))
    }
}

/// Logs a NEP-297 event that indexers and the ParallaxPay app read.
pub(crate) fn emit(event: &str, data: serde_json::Value) {
    let line = json!({ "standard": "parallaxpay", "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{line}"));
}

/// The result of the single promise a callback is waiting on.
pub(crate) enum Outcome {
    Ok(Vec<u8>),
    Failed,
    /// No single result, or one too long to read. Treated as "don't know".
    Unclear,
}

pub(crate) fn outcome() -> Outcome {
    if env::promise_results_count() != 1 {
        return Outcome::Unclear;
    }
    match env::promise_result_checked(0, MAX_RESULT_BYTES) {
        Ok(bytes) => Outcome::Ok(bytes),
        Err(PromiseError::Failed) => Outcome::Failed,
        Err(_) => Outcome::Unclear,
    }
}

pub(crate) fn parse_u128(bytes: &[u8]) -> Option<u128> {
    serde_json::from_slice::<U128>(bytes).ok().map(|v| v.0)
}

pub(crate) fn hex32(s: &str) -> [u8; 32] {
    let s = s.strip_prefix("0x").unwrap_or(s);
    require!(s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()), "Expected 32 bytes as hex");
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap();
    }
    out
}

pub(crate) fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
