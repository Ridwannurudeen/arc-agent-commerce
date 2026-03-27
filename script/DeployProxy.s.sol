// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ServiceMarket} from "../src/ServiceMarket.sol";
import {ServiceEscrow} from "../src/ServiceEscrow.sol";
import {SpendingPolicy} from "../src/SpendingPolicy.sol";

contract DeployProxyScript is Script {
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        SpendingPolicy policyImpl = new SpendingPolicy();
        ServiceMarket marketImpl = new ServiceMarket();
        ServiceEscrow escrowImpl = new ServiceEscrow();

        ERC1967Proxy policyProxy = new ERC1967Proxy(
            address(policyImpl), abi.encodeCall(SpendingPolicy.initialize, (IDENTITY_REGISTRY, deployer))
        );
        ERC1967Proxy marketProxy = new ERC1967Proxy(
            address(marketImpl), abi.encodeCall(ServiceMarket.initialize, (IDENTITY_REGISTRY, deployer))
        );
        ERC1967Proxy escrowProxy = new ERC1967Proxy(
            address(escrowImpl),
            abi.encodeCall(
                ServiceEscrow.initialize,
                (USDC, IDENTITY_REGISTRY, REPUTATION_REGISTRY, address(policyProxy), address(marketProxy), deployer)
            )
        );

        vm.stopBroadcast();

        SpendingPolicy p = SpendingPolicy(address(policyProxy));
        ServiceMarket m = ServiceMarket(address(marketProxy));
        ServiceEscrow e = ServiceEscrow(address(escrowProxy));

        require(p.owner() == deployer, "policy owner mismatch");
        require(m.owner() == deployer, "market owner mismatch");
        require(e.owner() == deployer, "escrow owner mismatch");
        require(e.feeBps() == 10, "fee not initialized");

        console.log("=== Proxy Addresses (use these) ===");
        console.log("SpendingPolicy:", address(policyProxy));
        console.log("ServiceMarket:", address(marketProxy));
        console.log("ServiceEscrow:", address(escrowProxy));
        console.log("");
        console.log("=== Implementation Addresses ===");
        console.log("SpendingPolicy impl:", address(policyImpl));
        console.log("ServiceMarket impl:", address(marketImpl));
        console.log("ServiceEscrow impl:", address(escrowImpl));
    }
}
