// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PresageAgents, IERC8004Identity} from "../src/PresageAgents.sol";
import {PresageCalls, IPresageAgents} from "../src/PresageCalls.sol";
import {PresageMarket, AggregatorV3Interface} from "../src/PresageMarket.sol";

interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
    function tokenURI(uint256 agentId) external view returns (string memory);
}

interface IERC20Meta {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

/// Runs against live Andromeda state: METIS_RPC_URL=https://andromeda.metis.io forge test --mc AndromedaFork
contract AndromedaForkTest is Test {
    address constant IDENTITY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant CL_METIS_USD = 0xD4a5Bb03B5D66d9bf81507379302Ac2C2DFDFa6D;
    address constant CL_SEQUENCER = 0x58218ea7422255EBE94e56b504035a784b7AA204;
    address constant M_USDC = 0xEA32A96608495e54156Ae48931A7c20f0dcc1a21;
    address constant M_USDT = 0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC;

    PresageAgents agents;
    PresageCalls calls;
    PresageMarket market;
    address creator = makeAddr("creator");
    address runner = makeAddr("runner");

    function setUp() public {
        string memory rpc = vm.envOr("METIS_RPC_URL", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);

        agents = new PresageAgents(IERC8004Identity(IDENTITY));
        calls = new PresageCalls(address(this), IPresageAgents(address(agents)));
        market = new PresageMarket(
            address(this),
            agents,
            calls,
            AggregatorV3Interface(CL_METIS_USD),
            AggregatorV3Interface(CL_SEQUENCER),
            25 hours,
            makeAddr("treasury")
        );
        calls.setCommitter(runner, true);
        calls.setCommitter(address(market), true);
        market.setStable(M_USDC, 6);
        market.setStable(M_USDT, 6);
    }

    function test_tokensAreWhatWeThink() public view {
        assertEq(IERC20Meta(M_USDC).symbol(), "m.USDC");
        assertEq(IERC20Meta(M_USDC).decimals(), 6);
        assertEq(IERC20Meta(M_USDT).symbol(), "m.USDT");
        assertEq(IERC20Meta(M_USDT).decimals(), 6);
    }

    function test_chainlinkPricesMetis() public view {
        uint256 price = market.metisUsdE8();
        assertGt(price, 0.1e8);
        assertLt(price, 1_000e8);
        uint256 callInMetis = market.quote(50_000, address(0)); // $0.05
        assertGt(callInMetis, 0);
        assertEq(market.quote(3e6, M_USDC), 3e6);
    }

    function test_realIdentityRegistryEndToEnd() public {
        vm.startPrank(creator);
        uint256 id = IIdentityRegistry(IDENTITY).register("https://presage.trade/agents/card/test.json");
        assertEq(IIdentityRegistry(IDENTITY).ownerOf(id), creator);
        agents.register(id, PresageAgents.Kind.Setup, keccak256("spec"), "https://presage.trade/specs/test", 3e6, 0);
        vm.stopPrank();

        bytes memory payload = bytes('{"v":1,"asset":"ETH","side":"long"}');
        bytes32 salt = keccak256("s");
        vm.startPrank(runner);
        uint256 callId = calls.seal(id, keccak256(abi.encodePacked(salt, payload)), uint40(block.timestamp + 1 hours));
        calls.reveal(callId, salt, payload, PresageCalls.Outcome.Win, 180);
        vm.stopPrank();

        assertEq(calls.recordOf(id).wins, 1);
    }
}
