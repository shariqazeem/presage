// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PresageAgents, IERC8004Identity} from "../src/PresageAgents.sol";
import {PresageCalls, IPresageAgents} from "../src/PresageCalls.sol";
import {PresageMarket, AggregatorV3Interface} from "../src/PresageMarket.sol";
import {ManualFeed} from "../src/testnet/ManualFeed.sol";
import {TestDollar} from "../src/testnet/TestDollar.sol";

/// Deploys Presage to Metis Andromeda (1088) or Metis Sepolia (59902).
///
///   RUNNER=0x... TREASURY=0x... forge script script/Deploy.s.sol \
///     --rpc-url metis --broadcast --legacy --account presage-deployer
///
/// RUNNER is the engine's key: it seals and reveals calls and delivers paid calls.
/// TREASURY receives the platform's 20%. The deployer stays owner and can hand ownership on later.
contract Deploy is Script {
    // ERC-8004 identity registries (canonical deployments, v2.0.0)
    address constant IDENTITY_ANDROMEDA = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant IDENTITY_SEPOLIA = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    // Andromeda tokens, read on chain on 14 Oct 2026 (name, symbol, decimals)
    address constant M_USDC = 0xEA32A96608495e54156Ae48931A7c20f0dcc1a21; // "USDC Token" m.USDC 6
    address constant M_USDT = 0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC; // "USDT Token" m.USDT 6

    // Chainlink on Andromeda
    address constant CL_METIS_USD = 0xD4a5Bb03B5D66d9bf81507379302Ac2C2DFDFa6D;
    address constant CL_SEQUENCER = 0x58218ea7422255EBE94e56b504035a784b7AA204;

    uint256 constant MAX_PRICE_AGE = 25 hours; // the METIS/USD heartbeat is 24h

    function run() external {
        address runner = vm.envAddress("RUNNER");
        address treasury = vm.envAddress("TREASURY");
        uint256 chainId = block.chainid;
        require(chainId == 1088 || chainId == 59902, "Andromeda or Metis Sepolia only");
        bool mainnet = chainId == 1088;

        vm.startBroadcast();
        address deployer = msg.sender;

        address feed;
        address sequencer;
        address[] memory stables;
        if (mainnet) {
            feed = CL_METIS_USD;
            sequencer = CL_SEQUENCER;
            stables = new address[](2);
            stables[0] = M_USDC;
            stables[1] = M_USDT;
        } else {
            feed = address(new ManualFeed(deployer, int256(vm.envOr("TESTNET_METIS_USD_E8", uint256(360_000_000)))));
            sequencer = address(0);
            stables = new address[](1);
            stables[0] = address(new TestDollar());
        }

        PresageAgents agents = new PresageAgents(IERC8004Identity(mainnet ? IDENTITY_ANDROMEDA : IDENTITY_SEPOLIA));
        PresageCalls calls = new PresageCalls(deployer, IPresageAgents(address(agents)));
        PresageMarket market = new PresageMarket(
            deployer, agents, calls, AggregatorV3Interface(feed), AggregatorV3Interface(sequencer), MAX_PRICE_AGE, treasury
        );

        calls.setCommitter(runner, true);
        calls.setCommitter(address(market), true);
        market.setOperator(runner, true);
        for (uint256 i; i < stables.length; i++) {
            market.setStable(stables[i], 6);
        }
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", chainId);
        vm.serializeUint(key, "deployedAtBlock", block.number);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "runner", runner);
        vm.serializeAddress(key, "treasury", treasury);
        vm.serializeAddress(key, "identityRegistry", address(agents.identity()));
        vm.serializeAddress(key, "metisUsdFeed", feed);
        vm.serializeAddress(key, "sequencerFeed", sequencer);
        vm.serializeAddress(key, "stables", stables);
        vm.serializeAddress(key, "agents", address(agents));
        vm.serializeAddress(key, "calls", address(calls));
        string memory json = vm.serializeAddress(key, "market", address(market));
        // A rehearsal on a local fork writes elsewhere (DEPLOY_OUT), so it can never pass for mainnet.
        string memory out = vm.envOr("DEPLOY_OUT", string.concat("./deployments/", vm.toString(chainId), ".json"));
        vm.writeJson(json, out);

        console2.log("PresageAgents", address(agents));
        console2.log("PresageCalls ", address(calls));
        console2.log("PresageMarket", address(market));
    }
}
