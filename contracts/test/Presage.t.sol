// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PresageAgents, IERC8004Identity} from "../src/PresageAgents.sol";
import {PresageCalls, IPresageAgents} from "../src/PresageCalls.sol";
import {PresageMarket} from "../src/PresageMarket.sol";

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

contract Refuser {
    receive() external payable {
        revert("no");
    }
}

contract PresageTest is Test {
    MockIdentity identity;
    MockStable usdc;
    PresageAgents agents;
    PresageCalls calls;
    PresageMarket market;

    address owner = makeAddr("owner");
    address committer = makeAddr("committer");
    address treasury = makeAddr("treasury");
    address keeper = makeAddr("keeper");
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
        agents = new PresageAgents(identity);
        calls = new PresageCalls(owner, IPresageAgents(address(agents)));
        market = new PresageMarket(owner, agents, calls, treasury, keeper);

        vm.startPrank(owner);
        calls.setCommitter(committer, true);
        market.setStable(address(usdc), 6);
        vm.stopPrank();

        vm.prank(keeper);
        market.setMetisRate(20e8); // $20 per METIS

        vm.startPrank(creator);
        agentId = identity.register();
        agents.register(agentId, PresageAgents.Kind.Setup, keccak256("spec"), "https://presage.trade/specs/1", 3e6, 0);
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
            calls.reveal(id, SALT, PAYLOAD, PresageCalls.Outcome.Win, 150);
        }
    }

    // ------------------------------------------------------------ agents

    function test_registerRequiresIdentityOwner() public {
        vm.prank(alice);
        uint256 id = identity.register();
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(PresageAgents.NotIdentityOwner.selector, id));
        agents.register(id, PresageAgents.Kind.Setup, keccak256("x"), "", 3e6, 0);
    }

    function test_specCannotBeRegisteredTwice() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(PresageAgents.AlreadyRegistered.selector, agentId));
        agents.register(agentId, PresageAgents.Kind.Setup, keccak256("other spec"), "", 3e6, 0);
    }

    function test_priceFloorIsTwoDollars() public {
        vm.prank(creator);
        vm.expectRevert(PresageAgents.PriceOutOfRange.selector);
        agents.setPrices(agentId, 1_999_999, 0);

        vm.prank(creator);
        agents.setPrices(agentId, 2e6, 0);
        assertEq(agents.getAgent(agentId).priceUsd6, 2e6);
    }

    function test_onlyCreatorChangesPriceOrRetires() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(PresageAgents.NotCreator.selector, agentId));
        agents.setPrices(agentId, 5e6, 0);

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(PresageAgents.NotCreator.selector, agentId));
        agents.retire(agentId);
    }

    function test_retiredAgentKeepsRecordButCannotSeal() public {
        uint256 id = _seal();
        vm.prank(creator);
        agents.retire(agentId);

        vm.prank(committer);
        vm.expectRevert(abi.encodeWithSelector(PresageCalls.AgentNotActive.selector, agentId));
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 1 days));

        // An open call can still be revealed after retirement, so losses can't be dodged by retiring.
        vm.prank(committer);
        calls.reveal(id, SALT, PAYLOAD, PresageCalls.Outcome.Loss, -100);
        assertEq(calls.recordOf(agentId).losses, 1);
        assertEq(agents.agentsOf(creator).length, 1);
    }

    // ------------------------------------------------------------ calls

    function test_onlyCommitterSeals() public {
        vm.prank(mallory);
        vm.expectRevert(PresageCalls.NotCommitter.selector);
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 1 days));
    }

    function test_revealWindowBounds() public {
        vm.startPrank(committer);
        vm.expectRevert(PresageCalls.BadRevealWindow.selector);
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 4 minutes));
        vm.expectRevert(PresageCalls.BadRevealWindow.selector);
        calls.seal(agentId, keccak256("x"), uint40(block.timestamp + 31 days));
        vm.stopPrank();
    }

    function test_revealMustMatchTheSealedCall() public {
        uint256 id = _seal();
        bytes memory edited = bytes('{"v":1,"asset":"BTC","side":"long","entry":61250,"stop":60400,"target":62000}');

        vm.startPrank(committer);
        vm.expectRevert(abi.encodeWithSelector(PresageCalls.CommitmentMismatch.selector, id));
        calls.reveal(id, SALT, edited, PresageCalls.Outcome.Win, 100);

        vm.expectRevert(abi.encodeWithSelector(PresageCalls.CommitmentMismatch.selector, id));
        calls.reveal(id, keccak256("other salt"), PAYLOAD, PresageCalls.Outcome.Win, 100);

        calls.reveal(id, SALT, PAYLOAD, PresageCalls.Outcome.Win, 218);
        vm.expectRevert(abi.encodeWithSelector(PresageCalls.NotSealed.selector, id));
        calls.reveal(id, SALT, PAYLOAD, PresageCalls.Outcome.Win, 218);
        vm.stopPrank();

        PresageCalls.Call memory c = calls.getCall(id);
        assertEq(uint8(c.status), uint8(PresageCalls.Status.Revealed));
        assertEq(c.result, 218);
    }

    function test_revealEmitsThePayload() public {
        uint256 id = _seal();
        vm.expectEmit(true, true, false, true, address(calls));
        emit PresageCalls.CallRevealed(id, agentId, PresageCalls.Outcome.Loss, -100, SALT, PAYLOAD);
        vm.prank(committer);
        calls.reveal(id, SALT, PAYLOAD, PresageCalls.Outcome.Loss, -100);
    }

    function test_lateCallsAreForfeitedByAnyone() public {
        uint256 id = _seal();

        vm.expectRevert(abi.encodeWithSelector(PresageCalls.RevealDeadlineNotPassed.selector, id));
        calls.forfeit(id);

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(committer);
        vm.expectRevert(abi.encodeWithSelector(PresageCalls.RevealDeadlinePassed.selector, id));
        calls.reveal(id, SALT, PAYLOAD, PresageCalls.Outcome.Win, 300);

        vm.prank(mallory);
        calls.forfeit(id);
        PresageCalls.Record memory r = calls.recordOf(agentId);
        assertEq(r.forfeited, 1);
        assertEq(r.wins, 0);
        assertEq(calls.resolvedCount(agentId), 1);

        vm.expectRevert(abi.encodeWithSelector(PresageCalls.NotSealed.selector, id));
        calls.forfeit(id);
    }

    function test_recordCountsEveryOutcome() public {
        PresageCalls.Outcome[4] memory outcomes =
            [PresageCalls.Outcome.Win, PresageCalls.Outcome.Loss, PresageCalls.Outcome.Flat, PresageCalls.Outcome.NoFill];
        int32[4] memory results = [int32(250), int32(-100), int32(12), int32(0)];
        for (uint256 i; i < 4; i++) {
            uint256 id = _seal();
            vm.prank(committer);
            calls.reveal(id, SALT, PAYLOAD, outcomes[i], results[i]);
        }
        _seal(); // still open

        PresageCalls.Record memory r = calls.recordOf(agentId);
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
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.RecordTooShort.selector, agentId, 0, 0));
        market.subscribe(agentId, address(usdc), 1, 3e6);
        vm.stopPrank();

        _buildRecord(10); // ten resolved calls, but all in one day
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.RecordTooShort.selector, agentId, 10, 0));
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
        vm.expectRevert(PresageMarket.NothingToClaim.selector);
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
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.AboveMaxAmount.selector, 50e6, 3e6));
        market.subscribe(agentId, address(usdc), 1, 3e6);
        vm.stopPrank();
    }

    function test_nativeSubscriptionUsesRateAndRefundsExcess() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        vm.prank(keeper);
        market.setMetisRate(20e8);

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

    function test_staleRateBlocksNativePayments() public {
        vm.warp(block.timestamp + 3 days + 1);
        vm.expectRevert(PresageMarket.RateStale.selector);
        market.quote(3e6, address(0));
    }

    function test_onlyKeeperOrOwnerSetsRate() public {
        vm.prank(mallory);
        vm.expectRevert(PresageMarket.NotRateKeeper.selector);
        market.setMetisRate(1);
        vm.prank(owner);
        market.setMetisRate(25e8);
        assertEq(market.usdPerMetisE8(), 25e8);
    }

    function test_unknownTokenRejected() public {
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.TokenNotAccepted.selector, address(0xBEEF)));
        market.quote(3e6, address(0xBEEF));
    }

    function test_payForCallOncePerRequest() public {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        bytes32 req = keccak256("request-1");

        vm.startPrank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.expectEmit(true, true, true, true, address(market));
        emit PresageMarket.CallPaid(req, agentId, alice, address(usdc), 50_000);
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.AlreadyPaid.selector, req));
        market.payForCall(agentId, req, address(usdc), 50_000);
        vm.stopPrank();

        assertEq(market.callPayer(req), alice);
        assertEq(market.earnings(creator, address(usdc)), 40_000);
        assertEq(market.earnings(treasury, address(usdc)), 10_000);
    }

    function test_payForCallInMetis() public {
        vm.prank(creator);
        agents.setPrices(agentId, 3e6, 50_000);
        uint256 price = market.callQuote(agentId, address(0));
        assertEq(price, 0.0025 ether); // $0.05 at $20

        vm.prank(alice);
        market.payForCall{value: price}(agentId, keccak256("r"), address(0), price);
        assertEq(address(market).balance, price);
    }

    function test_noPaidCallsWhenAgentHasNoCallPrice() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.NotForSale.selector, agentId));
        market.payForCall(agentId, keccak256("r"), address(usdc), 1e6);
    }

    function test_retiredAgentTakesNoSubscribers() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        vm.prank(creator);
        agents.retire(agentId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PresageMarket.AgentNotActive.selector, agentId));
        market.subscribe(agentId, address(usdc), 1, 3e6);
    }

    function test_nativeRefundToRefuserReverts() public {
        _buildRecord(10);
        vm.warp(block.timestamp + 7 days);
        vm.prank(keeper);
        market.setMetisRate(20e8);
        Refuser r = new Refuser();
        vm.deal(address(r), 1 ether);
        vm.prank(address(r));
        vm.expectRevert(PresageMarket.NativeTransferFailed.selector);
        market.subscribe{value: 1 ether}(agentId, address(0), 1, 1 ether);
    }

    function testFuzz_quoteRoundsUpForStables(uint64 usd6) public {
        MockStable eighteen = new MockStable();
        vm.prank(owner);
        market.setStable(address(eighteen), 18);
        assertEq(market.quote(usd6, address(eighteen)), uint256(usd6) * 1e12);
        assertEq(market.quote(usd6, address(usdc)), usd6);
    }
}
