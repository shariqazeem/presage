//! Every path a trade can take, the member's rules, sealed calls, and the owner's limits.

use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::{testing_env, Gas, PromiseOrValue, PromiseResult, RuntimeFeesConfig};
use serde_json::Value;

const VAULT: &str = "vault.parallaxpay.near";
const OWNER: &str = "parallaxpay.near";
const AGENT: &str = "agent.parallaxpay.near";
const RHEA: &str = "v2.ref-finance.near";
const USDC: &str = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const WNEAR: &str = "wrap.near";
const ZEC: &str = "zec.omft.near";
const ALICE: &str = "alice.near";
const BOB: &str = "bob.near";
const T0: u64 = 1_793_000_000_000_000_000;
const USD: u128 = 1_000_000;
const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn at(who: &str, yocto: u128, now: u64, gas_tgas: u64, results: Vec<PromiseResult>) {
    let ctx = VMContextBuilder::new()
        .current_account_id(acc(VAULT))
        .predecessor_account_id(acc(who))
        .signer_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .prepaid_gas(Gas::from_tgas(gas_tgas))
        .block_timestamp(now)
        .block_height(150_000_000)
        .build();
    testing_env!(ctx, near_sdk::test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
}

fn call_as(who: &str, yocto: u128) {
    at(who, yocto, T0, 300, vec![]);
}

/// A callback, run by the vault itself with the given promise result.
fn callback(result: PromiseResult) {
    at(VAULT, 0, T0, 300, vec![result]);
}

fn ok(amount: u128) -> PromiseResult {
    PromiseResult::Successful(serde_json::to_vec(&U128(amount)).unwrap())
}

fn ok_json(v: Value) -> PromiseResult {
    PromiseResult::Successful(serde_json::to_vec(&v).unwrap())
}

fn vault() -> Vault {
    call_as(OWNER, 0);
    let mut v = Vault::new(acc(OWNER), acc(AGENT), acc(RHEA), acc(USDC));
    call_as(OWNER, 1);
    v.set_route(vec![acc(USDC), acc(WNEAR)], vec![4512]);
    v.set_route(vec![acc(USDC), acc(WNEAR), acc(ZEC)], vec![4512, 6065]);
    v
}

fn autopilot(max_usd: u128, per_day: u32, coins: &[&str]) -> Rules {
    Rules { autopilot: true, max_trade: U128(max_usd * USD), trades_per_day: per_day, coins: coins.iter().map(|c| acc(c)).collect(), style: 1 }
}

fn member(v: &mut Vault, who: &str, usd: u128, rules: Rules) {
    call_as(who, JOIN_DEPOSIT.as_yoctonear());
    v.join(Some(rules));
    call_as(USDC, 0);
    assert!(matches!(v.ft_on_transfer(acc(who), U128(usd * USD), String::new()), PromiseOrValue::Value(U128(0))));
}

fn bal(v: &Vault, who: &str, token: &str) -> u128 {
    v.balance(&acc(who), &acc(token))
}

fn stage(v: &Vault) -> Stage {
    v.get_trade().expect("a trade should be running").stage
}

fn trade_id(v: &Vault) -> u64 {
    v.get_trade().unwrap().id
}

fn events(name: &str) -> Vec<Value> {
    get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| serde_json::from_str::<Value>(j).unwrap())
        .filter(|e| e["event"] == name)
        .map(|e| e["data"][0].clone())
        .collect()
}

/// Function calls the last step scheduled: (receiver, method, args, attached yocto).
fn calls_made() -> Vec<(String, String, Value, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let to = r.receiver_id.to_string();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::FunctionCallWeight { method_name, args, attached_deposit, .. } => Some((
                    to.clone(),
                    String::from_utf8(method_name).unwrap(),
                    serde_json::from_slice(&args).unwrap_or(Value::Null),
                    attached_deposit.as_yoctonear(),
                )),
                _ => None,
            })
        })
        .collect()
}

fn call_to(receiver: &str, method: &str) -> (Value, u128) {
    calls_made()
        .into_iter()
        .find(|(to, m, _, _)| to == receiver && m == method)
        .map(|(_, _, args, yocto)| (args, yocto))
        .unwrap_or_else(|| panic!("expected a call to {receiver}.{method}, got {:?}", calls_made()))
}

fn sealed(salt: &[u8; 32], plan: &str) -> String {
    let mut bytes = salt.to_vec();
    bytes.extend_from_slice(plan.as_bytes());
    to_hex(&env::sha256_array(&bytes))
}

/// The agent buys `usd` of wNEAR for Alice, who has autopilot on.
fn agent_buys_near(v: &mut Vault, usd: u128) -> u64 {
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(usd * USD), U128(NEAR), None, None);
    trade_id(v)
}

fn totals_match_balances(v: &Vault, members: &[&str]) {
    for (token, total) in v.get_totals() {
        let sum: u128 = members.iter().map(|m| bal(v, m, token.as_str())).sum();
        assert_eq!(total.0, sum, "totals for {token}");
    }
}

// ---------- joining, deposits, withdrawals ----------

#[test]
fn members_join_deposit_and_withdraw() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);
    assert_eq!(v.get_config().members, 1);

    call_as(ALICE, 1);
    let _ = v.withdraw(acc(USDC), Some(U128(30 * USD)));
    assert_eq!(bal(&v, ALICE, USDC), 70 * USD);
    let (args, yocto) = call_to(USDC, "ft_transfer");
    assert_eq!(args["receiver_id"], ALICE);
    assert_eq!(args["amount"], (30 * USD).to_string());
    assert_eq!(yocto, 1);

    callback(PromiseResult::Successful(vec![]));
    assert_eq!(v.after_withdraw(acc(ALICE), acc(USDC), U128(30 * USD)), U128(30 * USD));
    assert_eq!(events("withdraw").len(), 1);
    totals_match_balances(&v, &[ALICE]);
}

#[test]
fn a_failed_withdrawal_puts_the_coins_back() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    call_as(ALICE, 1);
    let _ = v.withdraw(acc(USDC), None);
    assert_eq!(bal(&v, ALICE, USDC), 0);
    callback(PromiseResult::Failed);
    assert_eq!(v.after_withdraw(acc(ALICE), acc(USDC), U128(100 * USD)), U128(0));
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);
    totals_match_balances(&v, &[ALICE]);
}

#[test]
fn deposits_that_dont_fit_are_sent_back() {
    let mut v = vault();
    member(&mut v, ALICE, 10, Rules::off());
    // Not USDC.
    call_as(WNEAR, 0);
    assert!(matches!(v.ft_on_transfer(acc(ALICE), U128(NEAR), String::new()), PromiseOrValue::Value(U128(a)) if a == NEAR));
    // Not a member.
    call_as(USDC, 0);
    assert!(matches!(v.ft_on_transfer(acc(BOB), U128(USD), String::new()), PromiseOrValue::Value(U128(a)) if a == USD));
    // Unreadable msg.
    assert!(matches!(v.ft_on_transfer(acc(BOB), U128(USD), "hello".into()), PromiseOrValue::Value(U128(a)) if a == USD));
    // For another member: credited to them.
    assert!(matches!(v.ft_on_transfer(acc(BOB), U128(USD), r#"{"account_id":"alice.near"}"#.into()), PromiseOrValue::Value(U128(0))));
    assert_eq!(bal(&v, ALICE, USDC), 11 * USD);
    // Paused.
    call_as(OWNER, 1);
    v.set_paused(true);
    call_as(USDC, 0);
    assert!(matches!(v.ft_on_transfer(acc(ALICE), U128(USD), String::new()), PromiseOrValue::Value(U128(a)) if a == USD));
    assert_eq!(bal(&v, ALICE, USDC), 11 * USD);
}

#[test]
#[should_panic(expected = "Attach 0.02 NEAR")]
fn joining_needs_the_storage_deposit() {
    let mut v = vault();
    call_as(ALICE, JOIN_DEPOSIT.as_yoctonear() - 1);
    v.join(None);
}

#[test]
fn leaving_returns_the_storage_deposit() {
    let mut v = vault();
    member(&mut v, ALICE, 5, Rules::off());
    call_as(ALICE, 1);
    let _ = v.withdraw(acc(USDC), None);
    call_as(ALICE, 1);
    let _ = v.leave();
    assert!(v.get_member(acc(ALICE)).is_none());
    assert_eq!(v.get_config().members, 0);
    let transfers: Vec<_> = get_created_receipts()
        .into_iter()
        .filter(|r| r.receiver_id.as_str() == ALICE)
        .flat_map(|r| r.actions)
        .filter_map(|a| if let MockAction::Transfer { deposit, .. } = a { Some(deposit) } else { None })
        .collect();
    assert_eq!(transfers, vec![JOIN_DEPOSIT]);
}

#[test]
#[should_panic(expected = "Withdraw everything first")]
fn leaving_with_coins_is_refused() {
    let mut v = vault();
    member(&mut v, ALICE, 5, Rules::off());
    call_as(ALICE, 1);
    let _ = v.leave();
}

// ---------- rules ----------

#[test]
#[should_panic(expected = "ParallaxPay doesn't trade")]
fn rules_can_only_name_listed_coins() {
    let mut v = vault();
    call_as(ALICE, JOIN_DEPOSIT.as_yoctonear());
    v.join(Some(autopilot(10, 1, &["token.rhealab.near"])));
}

#[test]
#[should_panic(expected = "Style is 0 (calm), 1 (balanced) or 2 (bold)")]
fn style_is_one_of_three() {
    let mut v = vault();
    call_as(ALICE, JOIN_DEPOSIT.as_yoctonear());
    v.join(Some(Rules { style: 3, ..autopilot(10, 1, &[WNEAR]) }));
}

#[test]
#[should_panic(expected = "Autopilot needs")]
fn autopilot_needs_limits() {
    let mut v = vault();
    call_as(ALICE, JOIN_DEPOSIT.as_yoctonear());
    v.join(Some(autopilot(0, 1, &[WNEAR])));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn changing_rules_needs_the_wallet() {
    let mut v = vault();
    member(&mut v, ALICE, 5, Rules::off());
    call_as(ALICE, 0);
    v.set_rules(autopilot(5, 1, &[WNEAR]));
}

#[test]
fn stop_turns_autopilot_off_without_a_deposit() {
    let mut v = vault();
    member(&mut v, ALICE, 5, autopilot(5, 1, &[WNEAR]));
    call_as(ALICE, 0);
    v.stop();
    assert!(!v.get_member(acc(ALICE)).unwrap().rules.autopilot);
}

// ---------- trades ----------

#[test]
fn an_agent_buy_credits_exactly_what_came_back() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let salt = [7u8; 32];
    let plan = r#"{"coin":"NEAR","entry":"market","stop":2.1,"target":2.6}"#;

    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(20 * USD), U128(4 * NEAR), Some(sealed(&salt, plan)), None);
    assert_eq!(bal(&v, ALICE, USDC), 80 * USD);
    assert_eq!(stage(&v), Stage::Depositing);
    let (args, yocto) = call_to(USDC, "ft_transfer_call");
    assert_eq!((args["receiver_id"].as_str(), args["amount"].as_str(), args["msg"].as_str(), yocto), (Some(RHEA), Some("20000000"), Some(""), 1));
    assert_eq!(v.get_trade().unwrap().call, Some(0));
    assert!(v.get_call(0).unwrap().opened_at.is_none());
    let id = trade_id(&v);

    callback(ok(20 * USD));
    let _ = v.after_deposit(id);
    assert_eq!(stage(&v), Stage::Swapping { amount: U128(20 * USD) });
    let (args, yocto) = call_to(RHEA, "swap");
    assert_eq!(yocto, 1);
    assert_eq!(
        args["actions"],
        serde_json::json!([{ "pool_id": 4512, "token_in": USDC, "amount_in": "20000000", "token_out": WNEAR, "min_amount_out": (4 * NEAR).to_string() }])
    );

    let out = 4 * NEAR + NEAR / 5;
    callback(ok(out));
    let _ = v.after_swap(id);
    assert_eq!(stage(&v), Stage::Returning { token: acc(WNEAR), amount: U128(out), filled: true });
    let (args, yocto) = call_to(RHEA, "withdraw");
    assert_eq!((args["token_id"].as_str(), args["amount"].as_str(), args["skip_unwrap_near"].as_bool(), yocto), (Some(WNEAR), Some(out.to_string().as_str()), Some(true), 1));

    callback(ok(out));
    assert_eq!(v.after_return(id), U128(out));
    assert_eq!(bal(&v, ALICE, WNEAR), out);
    assert_eq!(bal(&v, ALICE, USDC), 80 * USD);
    assert!(v.get_trade().is_none());
    let end = &events("trade_end")[0];
    assert_eq!((end["outcome"].as_str(), end["amount_out"].as_str()), (Some("filled"), Some(out.to_string().as_str())));
    totals_match_balances(&v, &[ALICE]);
    assert_eq!(v.get_member(acc(ALICE)).unwrap().buys_today, 1);
}

#[test]
fn two_hop_routes_put_the_minimum_on_the_last_hop_and_sell_in_reverse() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 5, &[ZEC]));
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(ZEC), U128(10 * USD), U128(2_000_000), None, None);
    let id = trade_id(&v);
    callback(ok(10 * USD));
    let _ = v.after_deposit(id);
    let (args, _) = call_to(RHEA, "swap");
    assert_eq!(
        args["actions"],
        serde_json::json!([
            { "pool_id": 4512, "token_in": USDC, "amount_in": "10000000", "token_out": WNEAR, "min_amount_out": "0" },
            { "pool_id": 6065, "token_in": WNEAR, "amount_in": null, "token_out": ZEC, "min_amount_out": "2000000" },
        ])
    );
    callback(ok(2_100_000));
    let _ = v.after_swap(id);
    callback(ok(2_100_000));
    let _ = v.after_return(id);
    assert_eq!(bal(&v, ALICE, ZEC), 2_100_000);

    // Selling runs the route backwards.
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(ZEC), acc(USDC), U128(2_100_000), U128(9 * USD), None, None);
    let id = trade_id(&v);
    callback(ok(2_100_000));
    let _ = v.after_deposit(id);
    let (args, _) = call_to(RHEA, "swap");
    assert_eq!(args["actions"][0]["pool_id"], 6065);
    assert_eq!(args["actions"][0]["token_in"], ZEC);
    assert_eq!(args["actions"][1]["pool_id"], 4512);
    assert_eq!(args["actions"][1]["token_out"], USDC);
}

#[test]
fn a_swap_that_misses_its_minimum_returns_the_input() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(ok(20 * USD));
    let _ = v.after_deposit(id);
    callback(PromiseResult::Failed);
    let _ = v.after_swap(id);
    assert_eq!(stage(&v), Stage::Returning { token: acc(USDC), amount: U128(20 * USD), filled: false });
    callback(ok(20 * USD));
    let _ = v.after_return(id);
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);
    assert_eq!(bal(&v, ALICE, WNEAR), 0);
    assert_eq!(events("trade_end")[0]["outcome"], "refunded");
    totals_match_balances(&v, &[ALICE]);
}

#[test]
fn a_bounced_deposit_ends_the_trade_at_once() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(ok(0));
    let _ = v.after_deposit(id);
    assert!(v.get_trade().is_none());
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);
    assert_eq!(events("trade_end")[0]["outcome"], "not_sent");
}

#[test]
fn a_failed_deposit_call_asks_the_exchange_where_the_coins_are() {
    // The coins never left.
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(PromiseResult::Failed);
    let _ = v.after_deposit(id);
    let (args, _) = call_to(RHEA, "get_deposits");
    assert_eq!(args["account_id"], VAULT);
    callback(ok_json(serde_json::json!({})));
    let _ = v.after_check(id);
    assert!(v.get_trade().is_none());
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);

    // The coins reached the exchange: take them back out.
    let id = agent_buys_near(&mut v, 20);
    callback(PromiseResult::Failed);
    let _ = v.after_deposit(id);
    callback(ok_json(serde_json::json!({ USDC: "20000000", WNEAR: "0" })));
    let _ = v.after_check(id);
    assert_eq!(stage(&v), Stage::Returning { token: acc(USDC), amount: U128(20 * USD), filled: false });
    callback(ok(20 * USD));
    let _ = v.after_return(id);
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);
    totals_match_balances(&v, &[ALICE]);
}

#[test]
fn a_stuck_return_is_settled_by_recover() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(ok(20 * USD));
    let _ = v.after_deposit(id);
    callback(ok(3 * NEAR));
    let _ = v.after_swap(id);
    // Rhea's transfer failed and it kept the coins for us.
    callback(ok(0));
    assert_eq!(v.after_return(id), U128(0));
    assert_eq!(events("trade_stuck").len(), 1);
    assert_eq!(bal(&v, ALICE, WNEAR), 0);

    at(ALICE, 0, T0 + RECOVER_AFTER_NS, 300, vec![]);
    let _ = v.recover();
    call_to(RHEA, "get_deposits");
    callback(ok_json(serde_json::json!({ WNEAR: (3 * NEAR).to_string() })));
    let _ = v.after_check(id);
    assert_eq!(stage(&v), Stage::Returning { token: acc(WNEAR), amount: U128(3 * NEAR), filled: true });
    callback(ok(3 * NEAR));
    let _ = v.after_return(id);
    assert_eq!(bal(&v, ALICE, WNEAR), 3 * NEAR);
    assert!(v.get_trade().is_none());
}

#[test]
fn recover_credits_coins_that_arrived_when_only_the_callback_was_lost() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(ok(20 * USD));
    let _ = v.after_deposit(id);
    callback(ok(3 * NEAR));
    let _ = v.after_swap(id);
    // after_return never ran; Rhea holds nothing, so the coins are already in the vault.
    at(AGENT, 0, T0 + RECOVER_AFTER_NS, 300, vec![]);
    let _ = v.recover();
    callback(ok_json(serde_json::json!({ WNEAR: "0", USDC: "0" })));
    let _ = v.after_check(id);
    assert_eq!(bal(&v, ALICE, WNEAR), 3 * NEAR);
    assert!(v.get_trade().is_none());
    totals_match_balances(&v, &[ALICE]);
}

#[test]
fn recover_finds_the_output_of_a_swap_whose_callback_was_lost() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(ok(20 * USD));
    let _ = v.after_deposit(id);
    at(OWNER, 0, T0 + RECOVER_AFTER_NS, 300, vec![]);
    let _ = v.recover();
    callback(ok_json(serde_json::json!({ WNEAR: (5 * NEAR).to_string(), USDC: "0" })));
    let _ = v.after_check(id);
    assert_eq!(stage(&v), Stage::Returning { token: acc(WNEAR), amount: U128(5 * NEAR), filled: true });
}

#[test]
#[should_panic(expected = "Give the trade 10 minutes first")]
fn recover_waits_ten_minutes() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    agent_buys_near(&mut v, 20);
    at(ALICE, 0, T0 + RECOVER_AFTER_NS - 1, 300, vec![]);
    let _ = v.recover();
}

#[test]
#[should_panic(expected = "Only the member, the agent or the owner")]
fn strangers_cant_recover() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    agent_buys_near(&mut v, 20);
    at(BOB, 0, T0 + RECOVER_AFTER_NS, 300, vec![]);
    let _ = v.recover();
}

#[test]
fn stale_callbacks_change_nothing() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    let id = agent_buys_near(&mut v, 20);
    callback(ok(0));
    let _ = v.after_deposit(id);
    callback(ok(20 * USD));
    assert_eq!(v.after_return(id), U128(0));
    let _ = v.after_check(id);
    assert_eq!(bal(&v, ALICE, USDC), 100 * USD);
    totals_match_balances(&v, &[ALICE]);
}

// ---------- what the agent may and may not do ----------

#[test]
fn an_empty_coin_list_means_any_listed_coin() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[]));
    agent_buys_near(&mut v, 10);
    assert_eq!(v.get_member(acc(ALICE)).unwrap().buys_today, 1);
}

#[test]
#[should_panic(expected = "doesn't trade this coin")]
fn any_coin_still_means_only_listed_coins() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[]));
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc("scam.near"), U128(10 * USD), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Autopilot is off")]
fn the_agent_cant_trade_without_autopilot() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    agent_buys_near(&mut v, 10);
}

#[test]
#[should_panic(expected = "isn't on the member's list")]
fn the_agent_only_buys_listed_coins() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(ZEC), U128(10 * USD), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Bigger than the member's largest trade")]
fn the_agent_respects_the_largest_trade() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    agent_buys_near(&mut v, 26);
}

#[test]
fn the_daily_limit_counts_buys_and_resets_the_next_day() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    for _ in 0..2 {
        let id = agent_buys_near(&mut v, 10);
        callback(ok(0));
        let _ = v.after_deposit(id);
    }
    call_as(AGENT, 0);
    let third = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, None);
    }));
    assert!(third.is_err());
    at(AGENT, 0, T0 + DAY_NS, 300, vec![]);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, None);
    assert!(v.get_trade().is_some());
}

#[test]
fn sells_are_never_limited() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(5, 1, &[WNEAR]));
    // Alice bought 10 NEAR herself, above her agent's limit.
    call_as(ALICE, 1);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(50 * USD), U128(NEAR), None, None);
    let id = trade_id(&v);
    callback(ok(50 * USD));
    let _ = v.after_deposit(id);
    callback(ok(10 * NEAR));
    let _ = v.after_swap(id);
    callback(ok(10 * NEAR));
    let _ = v.after_return(id);
    // The agent can still sell all of it, and it doesn't count as a buy.
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(WNEAR), acc(USDC), U128(10 * NEAR), U128(40 * USD), None, None);
    assert!(v.get_trade().is_some());
    assert_eq!(v.get_member(acc(ALICE)).unwrap().buys_today, 0);
}

#[test]
#[should_panic(expected = "Only the member or the agent")]
fn nobody_else_can_trade_a_member() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 2, &[WNEAR]));
    call_as(BOB, 1);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn a_members_own_trade_needs_the_wallet() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    call_as(ALICE, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Another trade is running")]
fn one_trade_runs_at_a_time() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 5, &[WNEAR]));
    agent_buys_near(&mut v, 10);
    agent_buys_near(&mut v, 10);
}

#[test]
#[should_panic(expected = "Attach at least 240 Tgas")]
fn a_trade_needs_enough_gas_for_every_step() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 5, &[WNEAR]));
    at(AGENT, 0, T0, 200, vec![]);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Amounts must be above zero")]
fn a_trade_needs_a_minimum() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 5, &[WNEAR]));
    call_as(AGENT, 0);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(0), None, None);
}

#[test]
#[should_panic(expected = "Trading is paused")]
fn pausing_stops_trades() {
    let mut v = vault();
    member(&mut v, ALICE, 100, autopilot(25, 5, &[WNEAR]));
    call_as(OWNER, 1);
    v.set_paused(true);
    agent_buys_near(&mut v, 10);
}

#[test]
fn withdrawals_work_while_paused() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    call_as(OWNER, 1);
    v.set_paused(true);
    call_as(ALICE, 1);
    let _ = v.withdraw(acc(USDC), None);
    assert_eq!(bal(&v, ALICE, USDC), 0);
}

// ---------- sealed calls ----------

#[test]
fn a_call_opens_only_with_its_own_plan() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    let salt = [42u8; 32];
    let plan = r#"{"coin":"NEAR","side":"buy","stop":2.1,"target":2.6,"why":"breakout held"}"#;
    call_as(AGENT, 0);
    let id = v.seal(acc(ALICE), sealed(&salt, plan));
    assert_eq!(v.get_call(id).unwrap().hash, sealed(&salt, plan));
    assert_eq!(v.get_call(id).unwrap().sealed_block, U64(150_000_000));

    call_as(AGENT, 0);
    let wrong = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| v.reveal(id, to_hex(&salt), plan.replace("2.6", "2.9"))));
    assert!(wrong.is_err());

    call_as(AGENT, 0);
    v.reveal(id, to_hex(&salt), plan.into());
    assert!(v.get_call(id).unwrap().opened_at.is_some());
    assert_eq!(events("reveal")[0]["plan"], plan);
}

#[test]
#[should_panic(expected = "already open")]
fn a_call_opens_once() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    let salt = [1u8; 32];
    call_as(AGENT, 0);
    let id = v.seal(acc(ALICE), sealed(&salt, "plan"));
    v.reveal(id, to_hex(&salt), "plan".into());
    v.reveal(id, to_hex(&salt), "plan".into());
}

#[test]
#[should_panic(expected = "Only the agent opens calls")]
fn only_the_agent_opens_calls() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    let salt = [1u8; 32];
    call_as(AGENT, 0);
    let id = v.seal(acc(ALICE), sealed(&salt, "plan"));
    call_as(ALICE, 0);
    v.reveal(id, to_hex(&salt), "plan".into());
}

#[test]
fn a_member_can_act_on_the_agents_call() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    call_as(AGENT, 0);
    let id = v.seal(acc(ALICE), sealed(&[3u8; 32], "buy NEAR"));
    call_as(ALICE, 1);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, Some(id));
    assert_eq!(v.get_trade().unwrap().call, Some(id));
}

#[test]
#[should_panic(expected = "Unknown call for this member")]
fn a_member_cant_use_someone_elses_call() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    member(&mut v, BOB, 100, Rules::off());
    call_as(AGENT, 0);
    let id = v.seal(acc(ALICE), sealed(&[3u8; 32], "buy NEAR"));
    call_as(BOB, 1);
    let _ = v.trade(acc(BOB), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), None, Some(id));
}

#[test]
#[should_panic(expected = "Only the agent seals calls")]
fn members_cant_seal() {
    let mut v = vault();
    member(&mut v, ALICE, 100, Rules::off());
    call_as(ALICE, 1);
    let _ = v.trade(acc(ALICE), acc(USDC), acc(WNEAR), U128(10 * USD), U128(1), Some(sealed(&[3u8; 32], "x")), None);
}

// ---------- the owner ----------

#[test]
#[should_panic(expected = "Only the owner")]
fn only_the_owner_lists_coins() {
    let mut v = vault();
    call_as(ALICE, 1);
    v.set_route(vec![acc(USDC), acc("token.rhealab.near")], vec![9999]);
}

#[test]
#[should_panic(expected = "Routes start at USDC")]
fn routes_start_at_usdc() {
    let mut v = vault();
    call_as(OWNER, 1);
    v.set_route(vec![acc(WNEAR), acc(ZEC)], vec![6065]);
}

#[test]
fn listing_a_coin_again_replaces_its_route() {
    let mut v = vault();
    call_as(OWNER, 1);
    v.set_route(vec![acc(USDC), acc(WNEAR)], vec![1234]);
    let routes = v.get_config().routes;
    assert_eq!(routes.len(), 2);
    assert_eq!(routes.iter().find(|r| r.path.last() == Some(&acc(WNEAR))).unwrap().pools, vec![1234]);
}
