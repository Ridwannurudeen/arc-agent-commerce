// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PipelineOrchestrator} from "../src/PipelineOrchestrator.sol";
import {CommerceHook} from "../src/CommerceHook.sol";

contract DeployV3Script is Script {
    // Arc Testnet addresses
    address constant ACP = 0x0747EEf0706327138c69792bF28Cd525089e4583; // ERC-8183
    address constant USDC = 0x3600000000000000000000000000000000000000; // USDC
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a; // EURC
    address constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e; // ERC-8004 Identity
    address constant REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713; // ERC-8004 Reputation

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy CommerceHook (impl + proxy)
        address hookProxy = address(
            new ERC1967Proxy(
                address(new CommerceHook()),
                abi.encodeCall(CommerceHook.initialize, (ACP, IDENTITY, REPUTATION, deployer))
            )
        );

        // 2. Deploy PipelineOrchestrator (impl + proxy)
        address orchProxy = address(
            new ERC1967Proxy(
                address(new PipelineOrchestrator()),
                abi.encodeCall(PipelineOrchestrator.initialize, (ACP, USDC, IDENTITY, hookProxy, deployer))
            )
        );

        // 3. Wire up
        CommerceHook(hookProxy).setOrchestrator(orchProxy);

        // 4. Add EURC as supported currency
        PipelineOrchestrator(orchProxy).addSupportedCurrency(EURC);

        vm.stopBroadcast();

        // Log addresses
        console.log("=== V3 Deployed ===");
        console.log("CommerceHook:", hookProxy);
        console.log("PipelineOrchestrator:", orchProxy);
    }
}
