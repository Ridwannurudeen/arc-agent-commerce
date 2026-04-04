// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {StreamEscrow} from "../src/StreamEscrow.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract StreamEscrowTest is Test {
    StreamEscrow escrow;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    MockUSDC usdc;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice"); // client
    address bob = makeAddr("bob"); // provider

    uint256 aliceAgentId;
    uint256 bobAgentId;

    uint256 constant DEPOSIT = 100e6;
    uint256 constant DURATION = 3600;
    uint256 constant HEARTBEAT = 60;

    function setUp() public {
        vm.startPrank(deployer);

        // Deploy mocks
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        usdc = new MockUSDC();

        // Deploy StreamEscrow via UUPS proxy
        StreamEscrow impl = new StreamEscrow();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(StreamEscrow.initialize, (address(usdc), address(identity), address(reputation), deployer))
        );
        escrow = StreamEscrow(address(proxy));

        vm.stopPrank();

        // Register agents
        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice-agent");

        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob-agent");

        // Mint USDC to alice and approve escrow
        usdc.mint(alice, 1_000_000e6);
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ---- Helpers ----

    function _createStream() internal returns (uint256 streamId) {
        vm.prank(alice);
        streamId = escrow.createStream(aliceAgentId, bobAgentId, bob, address(usdc), DEPOSIT, DURATION, HEARTBEAT);
    }

    // ==================== createStream ====================

    function test_createStream_success() public {
        uint256 streamId = _createStream();

        StreamEscrow.Stream memory s = escrow.getStream(streamId);

        assertEq(s.client, alice);
        assertEq(s.provider, bob);
        assertEq(s.clientAgentId, aliceAgentId);
        assertEq(s.providerAgentId, bobAgentId);
        assertEq(s.currency, address(usdc));
        assertEq(s.deposit, DEPOSIT);
        assertEq(s.withdrawn, 0);
        assertEq(s.startTime, block.timestamp);
        assertEq(s.endTime, block.timestamp + DURATION);
        assertEq(s.heartbeatInterval, HEARTBEAT);
        assertEq(s.lastHeartbeat, block.timestamp);
        assertEq(s.missedBeats, 0);
        assertEq(s.pausedAt, 0);
        assertEq(s.totalPausedTime, 0);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Active));

        // streamCount incremented
        assertEq(escrow.streamCount(), 1);

        // Tracked in client and provider arrays
        uint256[] memory clientStreams = escrow.getClientStreams(alice);
        assertEq(clientStreams.length, 1);
        assertEq(clientStreams[0], streamId);

        uint256[] memory providerStreams = escrow.getProviderStreams(bob);
        assertEq(providerStreams.length, 1);
        assertEq(providerStreams[0], streamId);
    }

    function test_createStream_transfersDeposit() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        _createStream();

        assertEq(usdc.balanceOf(alice), aliceBefore - DEPOSIT);
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + DEPOSIT);
    }

    function test_createStream_revertsUnownedAgent() public {
        // Bob tries to create a stream with alice's agent ID
        vm.prank(bob);
        vm.expectRevert(StreamEscrow.NotAgentOwner.selector);
        escrow.createStream(aliceAgentId, bobAgentId, bob, address(usdc), DEPOSIT, DURATION, HEARTBEAT);
    }

    function test_createStream_revertsZeroDuration() public {
        vm.prank(alice);
        vm.expectRevert(StreamEscrow.InvalidDuration.selector);
        escrow.createStream(aliceAgentId, bobAgentId, bob, address(usdc), DEPOSIT, 0, HEARTBEAT);
    }

    function test_createStream_revertsUnsupportedCurrency() public {
        address randomToken = makeAddr("randomToken");

        vm.prank(alice);
        vm.expectRevert(StreamEscrow.UnsupportedCurrency.selector);
        escrow.createStream(aliceAgentId, bobAgentId, bob, randomToken, DEPOSIT, DURATION, HEARTBEAT);
    }

    function test_createStream_emitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit StreamEscrow.StreamCreated(0, alice, bob, DEPOSIT, DURATION);
        escrow.createStream(aliceAgentId, bobAgentId, bob, address(usdc), DEPOSIT, DURATION, HEARTBEAT);
    }
}
