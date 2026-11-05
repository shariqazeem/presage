//! Joining, deposits, withdrawals and the member's own rules.

use crate::*;
use near_sdk::{assert_one_yocto, ext_contract, Gas, Promise, PromiseOrValue};

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_AFTER_WITHDRAW: Gas = Gas::from_tgas(10);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> U128;
}

/// Optional `msg` on a deposit, to credit another member (e.g. a cross-chain swap that lands here).
#[near(serializers = [json])]
struct DepositMsg {
    account_id: AccountId,
}

#[near]
impl Vault {
    /// Join with your rules (autopilot stays off if you leave them out). Attach 0.02 NEAR for storage.
    #[payable]
    pub fn join(&mut self, rules: Option<Rules>) {
        let account_id = env::predecessor_account_id();
        require!(!self.members.contains_key(&account_id), "Already a member");
        let paid = env::attached_deposit();
        require!(paid >= JOIN_DEPOSIT, "Attach 0.02 NEAR to cover your storage");
        let rules = rules.unwrap_or_else(Rules::off);
        self.check_rules(&rules);
        self.members.insert(account_id.clone(), Member::new(rules.clone()));
        self.member_count += 1;
        let extra = paid.saturating_sub(JOIN_DEPOSIT);
        if !extra.is_zero() {
            Promise::new(account_id.clone()).transfer(extra).detach();
        }
        emit("join", json!({ "account_id": account_id, "rules": rules }));
    }

    /// Change your rules. Needs 1 yoctoNEAR, so only a full-access key (your wallet) can do it.
    #[payable]
    pub fn set_rules(&mut self, rules: Rules) {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        self.check_rules(&rules);
        let member = self.members.get_mut(&account_id).unwrap_or_else(|| env::panic_str("Not a ParallaxPay member"));
        member.rules = rules.clone();
        emit("rules", json!({ "account_id": account_id, "rules": rules }));
    }

    /// Autopilot off, now. No deposit needed, so it works from any key you've given the app.
    pub fn stop(&mut self) {
        let account_id = env::predecessor_account_id();
        let member = self.members.get_mut(&account_id).unwrap_or_else(|| env::panic_str("Not a ParallaxPay member"));
        member.rules.autopilot = false;
        emit("stop", json!({ "account_id": account_id }));
    }

    /// Deposits arrive here through `ft_transfer_call` on the USDC contract. Anything else is sent back.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let refuse = |why: &str| {
            near_sdk::log!("Deposit returned: {}", why);
            PromiseOrValue::Value(amount)
        };
        if token != self.usdc {
            return refuse("only USDC can be deposited");
        }
        if self.paused {
            return refuse("deposits are paused");
        }
        let account_id = if msg.is_empty() {
            sender_id.clone()
        } else {
            match serde_json::from_str::<DepositMsg>(&msg) {
                Ok(m) => m.account_id,
                Err(_) => return refuse("unreadable msg"),
            }
        };
        if !self.members.contains_key(&account_id) {
            return refuse("join ParallaxPay first");
        }
        self.credit(&account_id, &token, amount.0);
        emit("deposit", json!({ "account_id": account_id, "token": token, "amount": amount, "from": sender_id }));
        PromiseOrValue::Value(U128(0))
    }

    /// Withdraw a token to your own account (all of it if `amount` is left out). Needs 1 yoctoNEAR.
    #[payable]
    pub fn withdraw(&mut self, token: AccountId, amount: Option<U128>) -> Promise {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let amount = amount.map_or_else(|| self.balance(&account_id, &token), |a| a.0);
        self.debit(&account_id, &token, amount);
        ext_ft::ext(token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(account_id.clone(), U128(amount), Some("ParallaxPay withdrawal".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_AFTER_WITHDRAW).after_withdraw(account_id, token, U128(amount)))
    }

    #[private]
    pub fn after_withdraw(&mut self, account_id: AccountId, token: AccountId, amount: U128) -> U128 {
        if let Outcome::Ok(_) = outcome() {
            emit("withdraw", json!({ "account_id": account_id, "token": token, "amount": amount }));
            amount
        } else {
            // Usually the account isn't registered with the token contract yet. The coins stay here.
            self.credit(&account_id, &token, amount.0);
            emit("withdraw_failed", json!({ "account_id": account_id, "token": token, "amount": amount }));
            U128(0)
        }
    }

    /// Leave and get the 0.02 NEAR back. Withdraw everything first. Needs 1 yoctoNEAR.
    #[payable]
    pub fn leave(&mut self) -> Promise {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let member = self.members.get(&account_id).unwrap_or_else(|| env::panic_str("Not a ParallaxPay member"));
        require!(member.balances.is_empty(), "Withdraw everything first");
        require!(self.trade.as_ref().map_or(true, |t| t.account_id != account_id), "A trade of yours is still running");
        self.members.remove(&account_id);
        self.member_count -= 1;
        emit("leave", json!({ "account_id": account_id }));
        Promise::new(account_id).transfer(JOIN_DEPOSIT)
    }
}

impl Vault {
    pub(crate) fn check_rules(&self, rules: &Rules) {
        require!(rules.coins.len() <= MAX_COINS, "Too many coins");
        require!(rules.trades_per_day <= MAX_BUYS_PER_DAY, "At most 48 buys a day");
        require!(rules.style <= 2, "Style is 0 (calm), 1 (balanced) or 2 (bold)");
        for (i, coin) in rules.coins.iter().enumerate() {
            require!(self.route_of(coin).is_some(), format!("ParallaxPay doesn't trade {coin}"));
            require!(!rules.coins[..i].contains(coin), "A coin is listed twice");
        }
        if rules.autopilot {
            require!(rules.max_trade.0 > 0 && rules.trades_per_day > 0, "Autopilot needs a trade size and a daily limit");
        }
    }
}
