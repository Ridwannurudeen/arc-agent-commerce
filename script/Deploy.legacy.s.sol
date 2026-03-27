// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// DEPRECATED: This script used the old constructor-based (non-upgradeable) deployment pattern.
// Use DeployProxy.s.sol for UUPS proxy deployment instead.
//
// Original deployment (pre-UUPS):
//   SpendingPolicy policy = new SpendingPolicy(IDENTITY_REGISTRY);
//   ServiceMarket market = new ServiceMarket(IDENTITY_REGISTRY);
//   ServiceEscrow escrow = new ServiceEscrow(USDC, IDENTITY_REGISTRY, REPUTATION_REGISTRY, address(policy), address(market));

import "forge-std/Script.sol";

contract DeployLegacyScript is Script {
    function run() external pure {
        revert("DEPRECATED: use DeployProxy.s.sol instead");
    }
}
