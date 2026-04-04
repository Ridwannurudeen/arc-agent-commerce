// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {StreamEscrow} from "../src/StreamEscrow.sol";

contract DeployStreamEscrowScript is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        address proxy = address(
            new ERC1967Proxy(
                address(new StreamEscrow()),
                abi.encodeCall(StreamEscrow.initialize, (USDC, IDENTITY, REPUTATION, deployer))
            )
        );

        StreamEscrow(proxy).addSupportedCurrency(EURC);

        vm.stopBroadcast();

        console.log("=== StreamEscrow Deployed ===");
        console.log("StreamEscrow:", proxy);
    }
}
