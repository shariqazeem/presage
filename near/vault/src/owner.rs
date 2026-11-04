//! The owner lists the coins and pools, sets the agent's account, and can pause trading.
//! The owner can't move members' coins: nothing here touches a balance.

use crate::*;
use near_sdk::Promise;

#[near]
impl Vault {
    /// List a coin, or change how it's reached: `path` runs from USDC to the coin, one Rhea pool per hop.
    #[payable]
    pub fn set_route(&mut self, path: Vec<AccountId>, pools: Vec<u64>) {
        self.assert_owner();
        require!(!pools.is_empty() && pools.len() <= MAX_HOPS, "One to three hops");
        require!(path.len() == pools.len() + 1, "One more token than pools");
        require!(path[0] == self.usdc, "Routes start at USDC");
        for (i, token) in path.iter().enumerate() {
            require!(!path[..i].contains(token), "A token appears twice");
        }
        let coin = path.last().unwrap().clone();
        self.routes.retain(|r| r.path.last() != Some(&coin));
        let route = Route { path, pools };
        emit("route", json!({ "coin": coin, "route": route }));
        self.routes.push(route);
    }

    /// Stop listing a coin. Members who hold it can still withdraw it.
    #[payable]
    pub fn remove_route(&mut self, coin: AccountId) {
        self.assert_owner();
        self.routes.retain(|r| r.path.last() != Some(&coin));
        emit("route_removed", json!({ "coin": coin }));
    }

    #[payable]
    pub fn set_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        emit("agent", json!({ "agent": agent }));
        self.agent = agent;
    }

    #[payable]
    pub fn set_owner(&mut self, owner: AccountId) {
        self.assert_owner();
        emit("owner", json!({ "owner": owner }));
        self.owner = owner;
    }

    /// Pause new trades and deposits. Withdrawals always stay open.
    #[payable]
    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
        emit("paused", json!({ "paused": paused }));
    }

    /// Register tokens in the vault's own Rhea account (only needed for tokens Rhea hasn't whitelisted).
    #[payable]
    pub fn register_tokens_on_exchange(&mut self, tokens: Vec<AccountId>) -> Promise {
        self.assert_owner();
        self.register_on_exchange(tokens)
    }
}
