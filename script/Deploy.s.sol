// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ServiceMarket} from "../src/ServiceMarket.sol";
import {ServiceEscrow} from "../src/ServiceEscrow.sol";
import {SpendingPolicy} from "../src/SpendingPolicy.sol";

contract DeployScript is Script {
    // Arc Testnet ERC-8004 contracts
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    // Arc Testnet USDC ERC-20 interface
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        SpendingPolicy policy = new SpendingPolicy(IDENTITY_REGISTRY);
        ServiceMarket market = new ServiceMarket(IDENTITY_REGISTRY);
        ServiceEscrow escrow =
            new ServiceEscrow(USDC, IDENTITY_REGISTRY, REPUTATION_REGISTRY, address(policy), address(market));

        vm.stopBroadcast();

        console.log("SpendingPolicy:", address(policy));
        console.log("ServiceMarket:", address(market));
        console.log("ServiceEscrow:", address(escrow));
    }
}
