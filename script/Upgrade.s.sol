// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ServiceMarket} from "../src/ServiceMarket.sol";
import {ServiceEscrow} from "../src/ServiceEscrow.sol";
import {SpendingPolicy} from "../src/SpendingPolicy.sol";

contract UpgradeScript is Script {
    function run() external {
        address marketProxy = vm.envAddress("SERVICE_MARKET_PROXY");
        address escrowProxy = vm.envAddress("SERVICE_ESCROW_PROXY");
        address policyProxy = vm.envAddress("SPENDING_POLICY_PROXY");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // Record pre-upgrade state
        ServiceMarket market = ServiceMarket(marketProxy);
        ServiceEscrow escrow = ServiceEscrow(escrowProxy);
        SpendingPolicy policy = SpendingPolicy(policyProxy);

        address preMarketOwner = market.owner();
        address preEscrowOwner = escrow.owner();
        address prePolicyOwner = policy.owner();
        uint256 preFeeBps = escrow.feeBps();

        console.log("=== Pre-Upgrade State ===");
        console.log("ServiceMarket owner:", preMarketOwner);
        console.log("ServiceEscrow owner:", preEscrowOwner);
        console.log("SpendingPolicy owner:", prePolicyOwner);
        console.log("ServiceEscrow feeBps:", preFeeBps);

        vm.startBroadcast(deployerKey);

        // Deploy new implementations
        ServiceMarket newMarketImpl = new ServiceMarket();
        ServiceEscrow newEscrowImpl = new ServiceEscrow();
        SpendingPolicy newPolicyImpl = new SpendingPolicy();

        // Upgrade proxies
        market.upgradeToAndCall(address(newMarketImpl), "");
        escrow.upgradeToAndCall(address(newEscrowImpl), "");
        policy.upgradeToAndCall(address(newPolicyImpl), "");

        vm.stopBroadcast();

        // Verify state preserved
        require(market.owner() == preMarketOwner, "market owner changed");
        require(escrow.owner() == preEscrowOwner, "escrow owner changed");
        require(policy.owner() == prePolicyOwner, "policy owner changed");
        require(escrow.feeBps() == preFeeBps, "feeBps changed");

        console.log("=== Upgrade Complete ===");
        console.log("ServiceMarket new impl:", address(newMarketImpl));
        console.log("ServiceEscrow new impl:", address(newEscrowImpl));
        console.log("SpendingPolicy new impl:", address(newPolicyImpl));
    }
}
