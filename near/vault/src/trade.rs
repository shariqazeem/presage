//! Trades, sealed calls and recovery.
//!
//! A trade is three steps, each confirmed by a callback that knows exact amounts:
//!   1. `ft_transfer_call` the input into the vault's own Rhea account  → `after_deposit`
//!   2. `swap` there; Rhea returns the amount out                        → `after_swap`
//!   3. `withdraw` the output (or the input, if the swap failed) back    → `after_return`
//! The member's balance is debited when the trade starts and credited when the coins are back.
//! If a step's result is unclear, the vault reads its Rhea balances and settles from those.

use crate::account::ext_ft;
use crate::*;
use near_sdk::{assert_one_yocto, ext_contract, Gas, Promise, PromiseOrValue};
use std::collections::HashMap;

// Gas for one trade, taking the costliest branch at each step (Tgas):
//   trade          10 + deposit 60 + after_deposit 160                 = 230
//   after_deposit  10 + max(swap 40 + after_swap 105, check 90)        = 155
//   after_swap     10 + max(return 65, check 90)                       = 100
//   check          get_deposits 10 + after_check 80 (10 + return 65)   = 90
//   return         Rhea withdraw 45 + after_return 20                  = 65
const GAS_DEPOSIT: Gas = Gas::from_tgas(60);
const GAS_AFTER_DEPOSIT: Gas = Gas::from_tgas(160);
const GAS_SWAP: Gas = Gas::from_tgas(40);
const GAS_AFTER_SWAP: Gas = Gas::from_tgas(105);
const GAS_GET_DEPOSITS: Gas = Gas::from_tgas(10);
const GAS_AFTER_CHECK: Gas = Gas::from_tgas(80);
const GAS_EXCHANGE_WITHDRAW: Gas = Gas::from_tgas(45);
const GAS_AFTER_RETURN: Gas = Gas::from_tgas(20);
const GAS_REGISTER: Gas = Gas::from_tgas(20);
/// The least a `trade` call must attach.
pub const GAS_TRADE: Gas = Gas::from_tgas(240);
/// The least a `recover` call must attach.
pub const GAS_RECOVER: Gas = Gas::from_tgas(100);

/// One hop of a Rhea swap, in Rhea's own format.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SwapAction {
    pub pool_id: u64,
    pub token_in: AccountId,
    /// Only the first hop names an amount; later hops take everything the previous one produced.
    pub amount_in: Option<U128>,
    pub token_out: AccountId,
    pub min_amount_out: U128,
}

#[ext_contract(ext_exchange)]
#[allow(dead_code)]
pub trait Exchange {
    fn swap(&mut self, actions: Vec<SwapAction>, referral_id: Option<AccountId>) -> U128;
    fn withdraw(&mut self, token_id: AccountId, amount: U128, unregister: Option<bool>, skip_unwrap_near: Option<bool>) -> U128;
    fn get_deposits(&self, account_id: AccountId) -> HashMap<AccountId, U128>;
    fn register_tokens(&mut self, token_ids: Vec<AccountId>);
}

#[near]
impl Vault {
    /// Swap `amount_in` of a member's `token_in` for `token_out`, between USDC and one listed coin,
    /// receiving at least `min_out`. The agent may do it inside the member's rules; the member may do
    /// it any time with 1 yoctoNEAR. The agent can seal a new call with the trade (`seal`, hex sha256
    /// of salt + plan) or link one sealed earlier (`call`).
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn trade(
        &mut self,
        account_id: AccountId,
        token_in: AccountId,
        token_out: AccountId,
        amount_in: U128,
        min_out: U128,
        seal: Option<String>,
        call: Option<u64>,
    ) -> Promise {
        let caller = env::predecessor_account_id();
        let by_agent = caller == self.agent;
        if !by_agent {
            require!(caller == account_id, "Only the member or the agent can trade this account");
            require!(seal.is_none(), "Only the agent seals calls");
            assert_one_yocto();
        }
        require!(!self.paused, "Trading is paused");
        require!(self.trade.is_none(), "Another trade is running, try again in a few seconds");
        require!(env::prepaid_gas() >= GAS_TRADE, "Attach at least 240 Tgas");
        require!(amount_in.0 > 0 && min_out.0 > 0, "Amounts must be above zero");
        let (path, pools, buying) = self.path_between(&token_in, &token_out);
        if by_agent {
            self.check_agent_trade(&account_id, &token_out, amount_in.0, buying);
        }
        self.debit(&account_id, &token_in, amount_in.0);
        let call = match (seal, call) {
            (Some(hash), None) => Some(self.seal_call(&account_id, &hash)),
            (None, Some(id)) => {
                let owned = u32::try_from(id).ok().and_then(|i| self.calls.get(i)).is_some_and(|c| c.account_id == account_id);
                require!(owned, "Unknown call for this member");
                Some(id)
            }
            (None, None) => None,
            _ => env::panic_str("Pass a new seal or an existing call, not both"),
        };
        self.trade_count += 1;
        let trade = Trade {
            id: self.trade_count,
            account_id,
            by_agent,
            path,
            pools,
            amount_in,
            min_out,
            call,
            stage: Stage::Depositing,
            started_at: U64(env::block_timestamp()),
        };
        emit("trade_start", serde_json::to_value(&trade).unwrap());
        let (id, token) = (trade.id, trade.path[0].clone());
        self.trade = Some(trade);
        ext_ft::ext(token)
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_DEPOSIT)
            .ft_transfer_call(self.exchange.clone(), amount_in, None, String::new())
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_AFTER_DEPOSIT).after_deposit(id))
    }

    #[private]
    pub fn after_deposit(&mut self, id: u64) -> PromiseOrValue<U128> {
        let Some(t) = self.live(id) else { return PromiseOrValue::Value(U128(0)) };
        let sent = t.amount_in.0;
        let used = match outcome() {
            Outcome::Ok(bytes) => parse_u128(&bytes),
            _ => None,
        };
        // A failed transfer call may still have moved the coins (if only its resolve step failed).
        let Some(used) = used.map(|u| u.min(sent)) else { return PromiseOrValue::Promise(self.check_exchange(id)) };
        if used < sent {
            self.credit(&t.account_id, &t.path[0], sent - used);
        }
        if used == 0 {
            self.finish("not_sent", 0);
            return PromiseOrValue::Value(U128(0));
        }
        if used < sent {
            // Rhea takes all or nothing, so this shouldn't happen. If it does, take the coins back.
            return self.bring_back(id, &t.path[0], used, false);
        }
        self.set_stage(Stage::Swapping { amount: U128(used) });
        let actions = swap_actions(&t.path, &t.pools, used, t.min_out.0);
        PromiseOrValue::Promise(
            ext_exchange::ext(self.exchange.clone())
                .with_attached_deposit(ONE_YOCTO)
                .with_static_gas(GAS_SWAP)
                .swap(actions, None)
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_AFTER_SWAP).after_swap(id)),
        )
    }

    #[private]
    pub fn after_swap(&mut self, id: u64) -> PromiseOrValue<U128> {
        let Some(t) = self.live(id) else { return PromiseOrValue::Value(U128(0)) };
        let Stage::Swapping { amount } = t.stage else { return PromiseOrValue::Value(U128(0)) };
        match outcome() {
            Outcome::Ok(bytes) => match parse_u128(&bytes) {
                Some(out) if out > 0 => self.bring_back(id, t.path.last().unwrap(), out, true),
                _ => PromiseOrValue::Promise(self.check_exchange(id)),
            },
            // Rhea's swap is all or nothing; it fails when the price moved past `min_out`.
            Outcome::Failed => self.bring_back(id, &t.path[0], amount.0, false),
            Outcome::Unclear => PromiseOrValue::Promise(self.check_exchange(id)),
        }
    }

    #[private]
    pub fn after_return(&mut self, id: u64) -> U128 {
        let Some(t) = self.live(id) else { return U128(0) };
        let Stage::Returning { token, amount, filled } = t.stage.clone() else { return U128(0) };
        let arrived = match outcome() {
            Outcome::Ok(bytes) => parse_u128(&bytes),
            _ => None,
        };
        if arrived == Some(amount.0) {
            self.credit(&t.account_id, &token, amount.0);
            self.finish(if filled { "filled" } else { "refunded" }, if filled { amount.0 } else { 0 });
            return amount;
        }
        // Rhea keeps the coins in the vault's account there when its transfer fails (and reports 0),
        // or the result is unclear. Nothing is lost: `recover` settles from what Rhea holds.
        emit("trade_stuck", json!({ "id": id, "account_id": t.account_id, "stage": t.stage }));
        U128(0)
    }

    /// Settle a trade that stopped part-way, from what Rhea holds for the vault. The member, the
    /// agent or the owner can call it once the trade has been running for 10 minutes.
    pub fn recover(&mut self) -> Promise {
        let t = self.trade.clone().unwrap_or_else(|| env::panic_str("No trade is running"));
        let caller = env::predecessor_account_id();
        require!(caller == t.account_id || caller == self.agent || caller == self.owner, "Only the member, the agent or the owner");
        require!(env::block_timestamp() >= t.started_at.0 + RECOVER_AFTER_NS, "Give the trade 10 minutes first");
        require!(env::prepaid_gas() >= GAS_RECOVER, "Attach at least 100 Tgas");
        emit("recover", json!({ "id": t.id, "by": caller }));
        self.check_exchange(t.id)
    }

    /// Reads the vault's Rhea balances, which belong to the running trade alone, and moves it on.
    #[private]
    pub fn after_check(&mut self, id: u64) -> PromiseOrValue<U128> {
        let Some(t) = self.live(id) else { return PromiseOrValue::Value(U128(0)) };
        let held: Option<HashMap<AccountId, U128>> = match outcome() {
            Outcome::Ok(bytes) => serde_json::from_slice(&bytes).ok(),
            _ => None,
        };
        let Some(held) = held else {
            emit("trade_stuck", json!({ "id": id, "account_id": t.account_id, "stage": t.stage }));
            return PromiseOrValue::Value(U128(0));
        };
        let held = |token: &AccountId| held.get(token).map_or(0, |a| a.0);
        let first = t.path[0].clone();
        let last = t.path.last().unwrap().clone();
        match t.stage.clone() {
            Stage::Depositing => {
                if held(&first) >= t.amount_in.0 {
                    self.bring_back(id, &first, t.amount_in.0, false)
                } else {
                    // The coins never left the vault.
                    self.credit(&t.account_id, &first, t.amount_in.0);
                    self.finish("not_sent", 0);
                    PromiseOrValue::Value(U128(0))
                }
            }
            Stage::Swapping { amount } => {
                if held(&last) > 0 {
                    self.bring_back(id, &last, held(&last), true)
                } else if held(&first) >= amount.0 {
                    self.bring_back(id, &first, amount.0, false)
                } else {
                    emit("trade_stuck", json!({ "id": id, "account_id": t.account_id, "stage": t.stage }));
                    PromiseOrValue::Value(U128(0))
                }
            }
            Stage::Returning { token, amount, filled } => {
                if held(&token) >= amount.0 {
                    self.bring_back(id, &token, amount.0, filled)
                } else {
                    // Rhea's transfer went through; only our callback was lost.
                    self.credit(&t.account_id, &token, amount.0);
                    self.finish(if filled { "filled" } else { "refunded" }, if filled { amount.0 } else { 0 });
                    PromiseOrValue::Value(amount)
                }
            }
        }
    }

    /// The agent seals a call for a member: the sha256 of a random 32-byte salt followed by the plan.
    pub fn seal(&mut self, account_id: AccountId, hash: String) -> u64 {
        require!(env::predecessor_account_id() == self.agent, "Only the agent seals calls");
        require!(self.members.contains_key(&account_id), "Not a ParallaxPay member");
        self.seal_call(&account_id, &hash)
    }

    /// The agent opens a sealed call. The contract checks sha256(salt + plan) against the seal, then
    /// logs the plan for anyone to read.
    pub fn reveal(&mut self, call: u64, salt: String, plan: String) {
        require!(env::predecessor_account_id() == self.agent, "Only the agent opens calls");
        require!(plan.len() <= MAX_PLAN_BYTES, "The plan is too long");
        let salt = hex32(&salt);
        let now = env::block_timestamp();
        let index = u32::try_from(call).unwrap_or_else(|_| env::panic_str("Unknown call"));
        let c = self.calls.get_mut(index).unwrap_or_else(|| env::panic_str("Unknown call"));
        require!(c.opened_at == 0, "This call is already open");
        let mut sealed = salt.to_vec();
        sealed.extend_from_slice(plan.as_bytes());
        require!(env::sha256_array(&sealed) == c.hash, "The plan doesn't match its seal");
        c.opened_at = now;
        let account_id = c.account_id.clone();
        emit("reveal", json!({ "call": call, "account_id": account_id, "salt": to_hex(&salt), "plan": plan }));
    }
}

impl Vault {
    fn live(&self, id: u64) -> Option<Trade> {
        self.trade.as_ref().filter(|t| t.id == id).cloned()
    }

    fn set_stage(&mut self, stage: Stage) {
        if let Some(t) = self.trade.as_mut() {
            t.stage = stage;
        }
    }

    fn finish(&mut self, outcome: &str, amount_out: u128) {
        let t = self.trade.take().unwrap();
        emit(
            "trade_end",
            json!({
                "id": t.id,
                "account_id": t.account_id,
                "by_agent": t.by_agent,
                "outcome": outcome,
                "token_in": t.path[0],
                "token_out": t.path.last(),
                "amount_in": t.amount_in,
                "amount_out": U128(amount_out),
                "call": t.call,
            }),
        );
    }

    fn bring_back(&mut self, id: u64, token: &AccountId, amount: u128, filled: bool) -> PromiseOrValue<U128> {
        self.set_stage(Stage::Returning { token: token.clone(), amount: U128(amount), filled });
        PromiseOrValue::Promise(
            ext_exchange::ext(self.exchange.clone())
                .with_attached_deposit(ONE_YOCTO)
                .with_static_gas(GAS_EXCHANGE_WITHDRAW)
                .withdraw(token.clone(), U128(amount), None, Some(true))
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_AFTER_RETURN).after_return(id)),
        )
    }

    fn check_exchange(&self, id: u64) -> Promise {
        ext_exchange::ext(self.exchange.clone())
            .with_static_gas(GAS_GET_DEPOSITS)
            .get_deposits(env::current_account_id())
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_AFTER_CHECK).after_check(id))
    }

    pub(crate) fn register_on_exchange(&self, tokens: Vec<AccountId>) -> Promise {
        ext_exchange::ext(self.exchange.clone()).with_attached_deposit(ONE_YOCTO).with_static_gas(GAS_REGISTER).register_tokens(tokens)
    }

    /// The hops for a trade, and whether it buys a coin (true) or sells one back to USDC.
    fn path_between(&self, token_in: &AccountId, token_out: &AccountId) -> (Vec<AccountId>, Vec<u64>, bool) {
        if *token_in == self.usdc {
            let r = self.route_of(token_out).unwrap_or_else(|| env::panic_str("ParallaxPay doesn't trade this coin"));
            (r.path.clone(), r.pools.clone(), true)
        } else if *token_out == self.usdc {
            let r = self.route_of(token_in).unwrap_or_else(|| env::panic_str("ParallaxPay doesn't trade this coin"));
            (r.path.iter().rev().cloned().collect(), r.pools.iter().rev().copied().collect(), false)
        } else {
            env::panic_str("Trades go between USDC and one coin")
        }
    }

    fn check_agent_trade(&mut self, account_id: &AccountId, coin: &AccountId, amount_in: u128, buying: bool) {
        let today = env::block_timestamp() / DAY_NS;
        let m = self.members.get_mut(account_id).unwrap_or_else(|| env::panic_str("Not a ParallaxPay member"));
        require!(m.rules.autopilot, "Autopilot is off for this member");
        if !buying {
            return;
        }
        require!(m.rules.coins.contains(coin), "This coin isn't on the member's list");
        require!(amount_in <= m.rules.max_trade.0, "Bigger than the member's largest trade");
        if m.day != today {
            m.day = today;
            m.buys_today = 0;
        }
        require!(m.buys_today < m.rules.trades_per_day, "The member's buys for today are used up");
        m.buys_today += 1;
    }

    fn seal_call(&mut self, account_id: &AccountId, hash: &str) -> u64 {
        let hash = hex32(hash);
        let id = self.calls.len() as u64;
        self.calls.push(Call {
            account_id: account_id.clone(),
            hash,
            sealed_at: env::block_timestamp(),
            sealed_block: env::block_height(),
            opened_at: 0,
        });
        emit("seal", json!({ "call": id, "account_id": account_id, "hash": to_hex(&hash), "block": U64(env::block_height()) }));
        id
    }
}

/// Rhea actions for a path: the first hop spends `amount_in`, each later hop spends all of the one
/// before, and only the last hop carries the minimum, which covers the whole route.
pub(crate) fn swap_actions(path: &[AccountId], pools: &[u64], amount_in: u128, min_out: u128) -> Vec<SwapAction> {
    pools
        .iter()
        .enumerate()
        .map(|(i, pool)| SwapAction {
            pool_id: *pool,
            token_in: path[i].clone(),
            amount_in: (i == 0).then_some(U128(amount_in)),
            token_out: path[i + 1].clone(),
            min_amount_out: U128(if i + 1 == pools.len() { min_out } else { 0 }),
        })
        .collect()
}
