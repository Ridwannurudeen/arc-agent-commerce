// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ServiceEscrow} from "../src/marketplace/ServiceEscrow.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Fix the escrow proxy that was upgraded with the wrong implementation
contract FixEscrowScript is Script {
    function run() external {
        address escrowProxy = vm.envAddress("SERVICE_ESCROW_PROXY");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // owner() still works since OZ uses namespaced storage
        console.log("Escrow proxy owner:", ServiceEscrow(escrowProxy).owner());

        vm.startBroadcast(deployerKey);

        // Deploy correct ServiceEscrow implementation
        ServiceEscrow newEscrowImpl = new ServiceEscrow();
        console.log("New ServiceEscrow impl:", address(newEscrowImpl));

        // Upgrade the proxy to the correct implementation
        // Use UUPSUpgradeable interface since the proxy currently delegates to wrong impl
        UUPSUpgradeable(escrowProxy).upgradeToAndCall(address(newEscrowImpl), "");

        vm.stopBroadcast();

        // Verify fix
        ServiceEscrow escrow = ServiceEscrow(escrowProxy);
        console.log("feeBps:", escrow.feeBps());
        console.log("owner:", escrow.owner());
        console.log("nextAgreementId:", escrow.nextAgreementId());

        require(escrow.feeBps() == 10, "feeBps not 10");
        console.log("=== Escrow Fix Complete ===");
    }
}
