// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CalledAgents, IERC8004Identity} from "../src/CalledAgents.sol";
import {CalledLedger, ICalledAgents} from "../src/CalledLedger.sol";
import {CalledMarket, AggregatorV3Interface} from "../src/CalledMarket.sol";

contract MockIdentity is IERC8004Identity {
    mapping(uint256 => address) public owners;
    uint256 public next = 1;

    function register() external returns (uint256 id) {
        id = next++;
        owners[id] = msg.sender;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }
}

contract MockStable is ERC20 {
    constructor() ERC20("Metis USDC", "m.USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockFeed is AggregatorV3Interface {
    uint8 public decimals;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function set(int256 answer_, uint256 startedAt_, uint256 updatedAt_) external {
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, startedAt, updatedAt, 1);
    }
}

contract Refuser {
    receive() external payable {
        revert("no");
    }
}

contract CalledTest is Test {
    MockIdentity identity;
    MockStable usdc;
    CalledAgents agents;
    CalledLedger calls;
    CalledMarket market;
    MockFeed metisUsd;
    MockFeed sequencer;

    address owner = makeAddr("owner");
    address committer = makeAddr("committer");
    address treasury = makeAddr("treasury");
    address operator = makeAddr("operator");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address mallory = makeAddr("mallory");

    uint256 agentId;
    bytes constant PAYLOAD = bytes('{"v":1,"asset":"BTC","side":"long","entry":61250,"stop":60400,"target":63100}');
    bytes32 constant SALT = keccak256("salt");

    function setUp() public {
        vm.warp(1_760_000_000);
        identity = new MockIdentity();
        usdc = new MockStable();
        agents = new CalledAgents(identity);
        calls = new CalledLedger(owner, ICalledAgents(address(agents)));
        metisUsd = new MockFeed(8);
        metisUsd.set(20e8, block.timestamp, block.timestamp); // $20 per METIS
        sequencer = new MockFeed(0);
        sequencer.set(0, block.timestamp - 2 hours, block.timestamp);
        market = new CalledMarket(owner, agents, calls, metisUsd, sequencer, 25 hours, treasury);

        vm.startPrank(owner);
        calls.setCommitter(committer, true);
        calls.setCommitter(address(market), true);
        market.setStable(address(usdc), 6);
        market.setOperator(operator, true);
        vm.stopPrank();

        vm.startPrank(creator);
        agentId = identity.register();
        agents.register(agentId, CalledAgents.Kind.Setup, keccak256("spec"), "https://called.xyz/specs/1", 3e6, 0);
        vm.stopPrank();

        usdc.mint(alice, 1_000e6);
        vm.deal(alice, 100 ether);
    }

    // ------------------------------------------------------------ helpers

    function _commitment(bytes32 salt, bytes memory payload) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(salt, payload));
    }

    function _seal() internal returns (uint256) {
        vm.prank(committer);
        return calls.seal(agentId, _commitment(SALT, PAYLOAD), uint40(block.timestamp + 1 days));
    }

    function _buildRecord(uint256 n) internal {
        for (uint256 i; i < n; i++) {
            uint256 id = _seal();
            vm.prank(committer);
            calls.reveal(id, SALT, PAYLOAD, CalledLedger.Outcome.Win, 150);
        }
    }

    // ------------------------------------------------------------ agents

    function test_registerRequiresIdentityOwner() public {
        vm.prank(alice);
        uint256 id = identity.register();
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(CalledAgents.NotIdentityOwner.selector, id));
        agents.register(id, CalledAgents.Kind.Setup, keccak256("x"), "", 3e6, 0);
    }

    function test_specCannotBeRegisteredTwice() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(CalledAgents.AlreadyRegistered.selector, agentId));
        agents.register(agentId, CalledAgents.Kind.Setup, keccak256("other spec"), "", 3e6, 0);
    }

    function test_priceFloorIsTwoDollars() public {
        vm.prank(creator);
        vm.expectRevert(CalledAgents.PriceOutOfRange.selector);
        agents.setPrices(agentId, 1_999_999, 0);

        vm.prank(creator);
        agents.setPrices(agentId, 2e6, 0);
        assertEq(agents.getAgent(agentId).priceUsd6, 2e6);
    }

    function test_onlyCreatorChangesPriceOrRetires() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(CalledAgents.NotCreator.selector, agentId));
        agents.setPrices(agentId, 5e6, 0);

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(CalledAgents.NotCreator.selector, agentId));
        agents.retire(agentId);
    }

    function test_retiredAgentKeepsRecordButCannotSeal() public {
        uint256 id = _seal();
        vm.prank(creator);
        agents.retire(agentId);

        vm.prank(committer);
        vm.expectRevert(abi.encodeWithSelector(CalledLedger.AgentNotActive.selector, agentId));
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 1 days));

        // An open call can still be revealed after retirement, so losses can't be dodged by retiring.
        vm.prank(committer);
        calls.reveal(id, SALT, PAYLOAD, CalledLedger.Outcome.Loss, -100);
        assertEq(calls.recordOf(agentId).losses, 1);
        assertEq(agents.agentsOf(creator).length, 1);
    }

    // ------------------------------------------------------------ calls

    function test_onlyCommitterSeals() public {
        vm.prank(mallory);
        vm.expectRevert(CalledLedger.NotCommitter.selector);
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 1 days));
    }

    function test_revealWindowBounds() public {
        vm.startPrank(committer);
        vm.expectRevert(CalledLedger.BadRevealWindow.selector);
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 4 minutes));
        vm.expectRevert(CalledLedger.BadRevealWindow.selector);
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 31 days));
        vm.stopPrank();
    }

    function test_revealMustMatchTheSealedCall() public {
        uint256 id = _seal();
        bytes memory edited = bytes('{"v":1,"asset":"BTC","side":"long","entry":61250,"stop":60400,"target":62000}');

        vm.startPrank(committer);
        vm.expectRevert(abi.encodeWithSelector(CalledLedger.CommitmentMismatch.selector, id));
        calls.reveal(id, SALT, edited, CalledLedger.Outcome.Win, 100);

        vm.expectRevert(abi.encodeWithSelector(CalledLedger.CommitmentMismatch.selector, id));
        calls.reveal(id, keccak256("other salt"), PAYLOAD, CalledLedger.Outcome.Win, 100);

        calls.reveal(id, SALT, PAYLOAD, CalledLedger.Outcome.Win, 218);
        vm.expectRevert(abi.encodeWithSelector(CalledLedger.NotSealed.selector, id));
        calls.reveal(id, SALT, PAYLOAD, CalledLedger.Outcome.Win, 218);
        vm.stopPrank();

        CalledLedger.Call memory c = calls.getCall(id);
        assertEq(uint8(c.status), uint8(CalledLedger.Status.Revealed));
        assertEq(c.result, 218);
    }

    function test_revealEmitsThePayload() public {
        uint256 id = _seal();
        vm.expectEmit(true, true, false, true, address(calls));
        emit CalledLedger.CallRevealed(id, agentId, CalledLedger.Outcome.Loss, -100, SALT, PAYLOAD);
        vm.prank(committer);
        calls.reveal(id, SALT, PAYLOAD, CalledLedger.Outcome.Loss, -100);
    }

    function test_lateCallsAreForfeitedByAnyone() public {
        uint256 id = _seal();

        vm.expectRevert(abi.encodeWithSelector(CalledLedger.RevealDeadlineNotPassed.selector, id));
        calls.forfeit(id);

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(committer);
        vm.expectRevert(abi.encodeWithSelector(CalledLedger.RevealDeadlinePassed.selector, id));
        calls.reveal(id, SALT, PAYLOAD, CalledLedger.Outcome.Win, 300);

        vm.prank(mallory);
        calls.forfeit(id);
        CalledLedger.Record memory r = calls.recordOf(agentId);
        assertEq(r.forfeited, 1);
        assertEq(r.wins, 0);
        assertEq(calls.resolvedCount(agentId), 1);

        vm.expectRevert(abi.encodeWithSelector(CalledLedger.NotSealed.selector, id));
        calls.forfeit(id);
    }

    function test_recordCountsEveryOutcome() public {
        CalledLedger.Outcome[4] memory outcomes =
            [CalledLedger.Outcome.Win, CalledLedger.Outcome.Loss, CalledLedger.Outcome.Flat, CalledLedger.Outcome.NoFill];
        int32[4] memory results = [int32(250), int32(-100), int32(12), int32(0)];
        for (uint256 i; i < 4; i++) {
            uint256 id = _seal();
            vm.prank(committer);
            calls.reveal(id, SALT, PAYLOAD, outcomes[i], results[i]);
        }
        _seal(); // still open

        CalledLedger.Record memory r = calls.recordOf(agentId);
        assertEq(r.total, 5);
        assertEq(r.revealed, 4);
        assertEq(r.wins, 1);
        assertEq(r.losses, 1);
        assertEq(r.flats, 1);
        assertEq(r.noFills, 1);
        assertEq(r.resultSum, 162);
    }

    // ------------------------------------------------------------ market

    function test_noSubscribersWithoutARecord() public {
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.RecordTooShort.selector, agentId, 0, 0));
        market.subscribe(agentId, address(usdc), 1, 3e6);
        vm.stopPrank();

        _buildRecord(10); // ten resolved calls, but all in one day
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.RecordTooShort.selector, agentId, 10, 0));
        market.subscribe(agentId, address(usdc), 1, 3e6);

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        market.subscribe(agentId, address(usdc), 1, 3e6);
        assertTrue(market.isSubscribed(agentId, alice));
    }

    function test_forfeitsCountTowardTheRecordBar() public {
        for (uint256 i; i < 10; i++) _seal();
        vm.warp(block.timestamp + 8 days);
        for (uint256 i = 1; i <= 10; i++) calls.forfeit(i);
        (bool ready, uint256 resolved,) = market.recordReady(agentId);
        assertTrue(ready);
        assertEq(resolved, 10);
    }

    function test_stableSubscriptionSplitsEightyTwenty() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);

        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        uint40 until = market.subscribe(agentId, address(usdc), 2, 6e6);
        vm.stopPrank();

        assertEq(until, uint40(block.timestamp + 60 days));
        assertEq(market.earnings(creator, address(usdc)), 4_800_000);
        assertEq(market.earnings(treasury, address(usdc)), 1_200_000);
        assertEq(usdc.balanceOf(address(market)), 6e6);

        vm.prank(creator);
        assertEq(market.claim(address(usdc)), 4_800_000);
        assertEq(usdc.balanceOf(creator), 4_800_000);

        vm.prank(creator);
        vm.expectRevert(CalledMarket.NothingToClaim.selector);
        market.claim(address(usdc));
    }

    function test_subscriptionExtendsFromCurrentExpiry() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        uint40 first = market.subscribe(agentId, address(usdc), 1, 3e6);
        vm.warp(block.timestamp + 10 days);
        uint40 second = market.subscribe(agentId, address(usdc), 1, 3e6);
        vm.stopPrank();
        assertEq(second, first + 30 days);
    }

    function test_maxAmountStopsAPriceHikeFrontRun() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        vm.prank(creator);
        agents.setPrices(agentId, 50e6, 0);

        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.AboveMaxAmount.selector, 50e6, 3e6));
        market.subscribe(agentId, address(usdc), 1, 3e6);
        vm.stopPrank();
    }

    function test_nativeSubscriptionUsesRateAndRefundsExcess() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        metisUsd.set(20e8, block.timestamp, block.timestamp);
        uint256 price = market.subscriptionQuote(agentId, address(0), 1);
        assertEq(price, 0.15 ether); // $3 at $20 per METIS

        uint256 before = alice.balance;
        vm.prank(alice);
        market.subscribe{value: 1 ether}(agentId, address(0), 1, 1 ether);
        assertEq(before - alice.balance, 0.15 ether);
        assertEq(address(market).balance, 0.15 ether);
        assertEq(market.earnings(creator, address(0)), 0.12 ether);
        assertEq(market.earnings(treasury, address(0)), 0.03 ether);

        uint256 creatorBefore = creator.balance;
        vm.prank(creator);
        market.claim(address(0));
        assertEq(creator.balance - creatorBefore, 0.12 ether);
    }

    function test_stalePriceBlocksNativePayments() public {
        vm.warp(block.timestamp + 25 hours + 1);
        vm.expectRevert(CalledMarket.PriceUnavailable.selector);
        market.quote(3e6, address(0));
        // stablecoins keep working
        assertEq(market.quote(3e6, address(usdc)), 3e6);
    }

    function test_sequencerDownBlocksNativePayments() public {
        sequencer.set(1, block.timestamp - 3 hours, block.timestamp);
        vm.expectRevert(CalledMarket.PriceUnavailable.selector);
        market.quote(3e6, address(0));

        // back up, but inside the grace period
        sequencer.set(0, block.timestamp - 10 minutes, block.timestamp);
        vm.expectRevert(CalledMarket.PriceUnavailable.selector);
        market.quote(3e6, address(0));
    }

    function test_feedDecimalsAreNormalised() public {
        MockFeed eighteen = new MockFeed(18);
        eighteen.set(20e18, block.timestamp, block.timestamp);
        CalledMarket m = new CalledMarket(owner, agents, calls, eighteen, AggregatorV3Interface(address(0)), 25 hours, treasury);
        assertEq(m.metisUsdE8(), 20e8);
        assertEq(m.quote(3e6, address(0)), 0.15 ether);
    }

    function test_unknownTokenRejected() public {
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.TokenNotAccepted.selector, address(0xBEEF)));
        market.quote(3e6, address(0xBEEF));
    }

    function _paidCall(bytes32 req) internal returns (uint256 callId) {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.stopPrank();
        vm.prank(operator);
        callId = market.sealPaidCall(req, _commitment(SALT, PAYLOAD), uint40(block.timestamp + 2 hours));
    }

    function test_paidCallIsEscrowedUntilRevealed() public {
        bytes32 req = keccak256("request-1");
        uint256 callId = _paidCall(req);

        CalledMarket.PaidRequest memory r = market.getRequest(req);
        assertEq(uint8(r.state), uint8(CalledMarket.RequestState.Sealed));
        assertEq(r.callId, callId);
        assertEq(r.payer, alice);
        assertEq(usdc.balanceOf(address(market)), 50_000);
        assertEq(market.earnings(creator, address(usdc)), 0);

        vm.expectRevert(abi.encodeWithSelector(CalledMarket.NotResolved.selector, req));
        market.settle(req);

        vm.prank(committer);
        calls.reveal(callId, SALT, PAYLOAD, CalledLedger.Outcome.Loss, -40);

        vm.prank(mallory); // anyone can settle
        market.settle(req);
        assertEq(market.earnings(creator, address(usdc)), 40_000);
        assertEq(market.earnings(treasury, address(usdc)), 10_000);

        vm.expectRevert(abi.encodeWithSelector(CalledMarket.BadRequest.selector, req));
        market.settle(req);
    }

    function test_forfeitedPaidCallRefundsThePayer() public {
        bytes32 req = keccak256("request-2");
        uint256 callId = _paidCall(req);

        vm.warp(block.timestamp + 2 hours + 1);
        calls.forfeit(callId);
        market.settle(req);

        assertEq(market.earnings(creator, address(usdc)), 0);
        assertEq(market.earnings(alice, address(usdc)), 50_000);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claim(address(usdc));
        assertEq(usdc.balanceOf(alice) - before, 50_000);
    }

    function test_undeliveredPaidCallIsRefundable() public {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        bytes32 req = keccak256("request-3");
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(CalledMarket.DeliveryWindowOpen.selector, req));
        market.refundUndelivered(req);

        vm.warp(block.timestamp + 15 minutes + 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.DeliveryWindowClosed.selector, req));
        market.sealPaidCall(req, keccak256("late"), uint40(block.timestamp + 1 hours));

        market.refundUndelivered(req);
        assertEq(market.earnings(alice, address(usdc)), 50_000);
        assertEq(uint8(market.getRequest(req).state), uint8(CalledMarket.RequestState.Refunded));
    }

    function test_requestIsPaidOnce() public {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        bytes32 req = keccak256("request-4");
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.expectEmit(true, true, true, true, address(market));
        emit CalledMarket.CallPaid(req, agentId, alice, address(usdc), 50_000);
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.AlreadyPaid.selector, req));
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.stopPrank();
    }

    function test_onlyOperatorSealsPaidCalls() public {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        bytes32 req = keccak256("request-5");
        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.stopPrank();
        vm.prank(mallory);
        vm.expectRevert(CalledMarket.NotOperator.selector);
        market.sealPaidCall(req, keccak256("x"), uint40(block.timestamp + 1 hours));
    }

    function test_payForCallInMetis() public {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        uint256 price = market.callQuote(agentId, address(0));
        assertEq(price, 0.0025 ether); // $0.05 at $20

        vm.prank(alice);
        market.payForCall{value: 1 ether}(agentId, keccak256("r"), address(0), 1 ether);
        assertEq(address(market).balance, price); // excess refunded
    }

    function test_noPaidCallsWhenAgentHasNoCallPrice() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.NotForSale.selector, agentId));
        market.payForCall(agentId, keccak256("r"), address(usdc), 1e6);
    }

    function test_retiredAgentTakesNoSubscribers() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        vm.prank(creator);
        agents.retire(agentId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CalledMarket.AgentNotActive.selector, agentId));
        market.subscribe(agentId, address(usdc), 1, 3e6);
    }

    function test_nativeRefundToRefuserReverts() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        metisUsd.set(20e8, block.timestamp, block.timestamp);
        Refuser r = new Refuser();
        vm.deal(address(r), 1 ether);
        vm.prank(address(r));
        vm.expectRevert(CalledMarket.NativeTransferFailed.selector);
        market.subscribe{value: 1 ether}(agentId, address(0), 1, 1 ether);
    }

    function test_pauseStopsNewPaymentsButNotClaims() public {
        bytes32 req = keccak256("before-pause");
        uint256 callId = _paidCall(req);
        vm.prank(committer);
        calls.reveal(callId, SALT, PAYLOAD, CalledLedger.Outcome.Win, 90);

        vm.prank(mallory);
        vm.expectRevert();
        market.setPaymentsPaused(true);
        vm.prank(owner);
        market.setPaymentsPaused(true);

        vm.prank(alice);
        vm.expectRevert(CalledMarket.Paused.selector);
        market.payForCall(agentId, keccak256("after-pause"), address(usdc), 50_000);

        market.settle(req); // settlement still works
        vm.prank(creator);
        market.claim(address(usdc)); // and so do claims
        assertEq(usdc.balanceOf(creator), 40_000);
    }

    function testFuzz_quoteRoundsUpForStables(uint64 usd6) public {
        MockStable eighteen = new MockStable();
        vm.prank(owner);
        market.setStable(address(eighteen), 18);
        assertEq(market.quote(usd6, address(eighteen)), uint256(usd6) * 1e12);
        assertEq(market.quote(usd6, address(usdc)), usd6);
    }
}
