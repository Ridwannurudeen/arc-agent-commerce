// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {StreamEscrow} from "../src/marketplace/StreamEscrow.sol";
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

    // ==================== balanceOf (Task 2) ====================

    function test_balanceOf_atZero() public {
        uint256 streamId = _createStream();
        assertEq(escrow.balanceOf(streamId), 0);
    }

    function test_balanceOf_atHalf() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION / 2);
        assertEq(escrow.balanceOf(streamId), DEPOSIT / 2);
    }

    function test_balanceOf_atFull() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION);
        assertEq(escrow.balanceOf(streamId), DEPOSIT);
    }

    function test_balanceOf_afterEnd_capped() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION + 1000);
        assertEq(escrow.balanceOf(streamId), DEPOSIT);
    }

    function test_remainingBalance() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION / 4);
        uint256 earned = escrow.balanceOf(streamId);
        uint256 remaining = escrow.remainingBalance(streamId);
        assertEq(earned + remaining, DEPOSIT);
    }

    // ==================== heartbeat + checkStream + pause + resume (Task 3) ====================

    function test_heartbeat_updatesTimestamp() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + 30);
        vm.prank(bob);
        escrow.heartbeat(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(s.lastHeartbeat, block.timestamp);
    }

    function test_heartbeat_revertsNonProvider() public {
        uint256 streamId = _createStream();
        vm.prank(alice);
        vm.expectRevert(StreamEscrow.NotProvider.selector);
        escrow.heartbeat(streamId);
    }

    function test_checkStream_noPauseWithinInterval() public {
        uint256 streamId = _createStream();
        // Warp 1 interval (not > 2*interval), should still be Active
        vm.warp(block.timestamp + HEARTBEAT);
        escrow.checkStream(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Active));
    }

    function test_checkStream_pausesAfterTwoIntervals() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + HEARTBEAT * 2 + 1);
        escrow.checkStream(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Paused));
        assertEq(s.pausedAt, block.timestamp);
        assertEq(s.missedBeats, 1);
    }

    function test_checkStream_noop_alreadyPaused() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + HEARTBEAT * 2 + 1);
        escrow.checkStream(streamId);
        uint256 pausedAt = escrow.getStream(streamId).pausedAt;

        // Second checkStream should be a noop (status is Paused, early return)
        vm.warp(block.timestamp + 100);
        escrow.checkStream(streamId);
        assertEq(escrow.getStream(streamId).pausedAt, pausedAt);
    }

    function test_heartbeat_revertsOnCompleted() public {
        uint256 streamId = _createStream();
        // Warp past endTime, call checkStream to trigger _checkCompletion
        vm.warp(block.timestamp + DURATION + 1);
        escrow.checkStream(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Completed));

        // Heartbeat should revert with StreamNotActive
        vm.prank(bob);
        vm.expectRevert(StreamEscrow.StreamNotActive.selector);
        escrow.heartbeat(streamId);
    }

    function test_pause_stopsEarnings() public {
        uint256 streamId = _createStream();
        // Warp past 2 intervals to trigger pause
        vm.warp(block.timestamp + HEARTBEAT * 2 + 1);
        escrow.checkStream(streamId);
        uint256 balanceAtPause = escrow.balanceOf(streamId);

        // Warp more, balance should not change
        vm.warp(block.timestamp + 500);
        assertEq(escrow.balanceOf(streamId), balanceAtPause);
    }

    function test_resume_byProvider() public {
        uint256 streamId = _createStream();
        uint256 startTs = block.timestamp;

        // Pause
        vm.warp(startTs + HEARTBEAT * 2 + 1);
        escrow.checkStream(streamId);
        uint256 pauseTs = block.timestamp;

        // Resume after 200s paused
        vm.warp(pauseTs + 200);
        vm.prank(bob);
        escrow.resume(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(s.totalPausedTime, 200);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Active));
        assertEq(s.pausedAt, 0);
    }

    function test_resume_revertsNonProvider() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + HEARTBEAT * 2 + 1);
        escrow.checkStream(streamId);

        vm.prank(alice);
        vm.expectRevert(StreamEscrow.NotProvider.selector);
        escrow.resume(streamId);
    }

    function test_earnings_correctAfterPauseResume() public {
        uint256 streamId = _createStream();
        uint256 startTs = block.timestamp;

        // Active for 600s, then pause
        vm.warp(startTs + 600);
        // lastHeartbeat = startTs, timestamp > startTs + 2*60 = startTs+120, so pause triggers
        escrow.checkStream(streamId);
        // Now paused at startTs+600

        // Paused for 300s, then resume
        vm.warp(startTs + 900);
        vm.prank(bob);
        escrow.resume(streamId);
        // totalPausedTime = 300

        // After resume, totalDuration = endTime - startTime - totalPausedTime = 3600 - 300 = 3300
        // For balanceOf = DEPOSIT/2, we need elapsed = totalDuration/2 = 1650
        // elapsed = current - startTs - totalPausedTime = current - startTs - 300
        // 1650 = current - startTs - 300 => current = startTs + 1950
        vm.warp(startTs + 1950);
        // earned = DEPOSIT * 1650 / 3300 = DEPOSIT / 2
        assertEq(escrow.balanceOf(streamId), DEPOSIT / 2);
    }

    function test_multiplePauseResumeCycles() public {
        uint256 streamId = _createStream();
        uint256 startTs = block.timestamp;

        // Cycle 1: pause at startTs+200 (well past 2*60=120 threshold)
        vm.warp(startTs + 200);
        escrow.checkStream(streamId);
        // Paused for 100s
        vm.warp(startTs + 300);
        vm.prank(bob);
        escrow.resume(streamId);
        assertEq(escrow.getStream(streamId).totalPausedTime, 100);

        // Cycle 2: need to miss heartbeat again. lastHeartbeat is now startTs+300
        // Pause threshold: startTs+300 + 2*60 = startTs+420
        vm.warp(startTs + 500);
        escrow.checkStream(streamId);
        // Paused for 150s
        vm.warp(startTs + 650);
        vm.prank(bob);
        escrow.resume(streamId);
        assertEq(escrow.getStream(streamId).totalPausedTime, 250); // 100 + 150
    }

    // ==================== withdraw (Task 4) ====================

    function test_withdraw_accrued() public {
        uint256 streamId = _createStream();
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.warp(block.timestamp + DURATION / 2);
        vm.prank(bob);
        escrow.withdraw(streamId);
        assertEq(usdc.balanceOf(bob), bobBefore + DEPOSIT / 2);
    }

    function test_withdraw_updatesWithdrawn() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION / 2);
        vm.prank(bob);
        escrow.withdraw(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(s.withdrawn, DEPOSIT / 2);
    }

    function test_withdraw_nothingToWithdraw() public {
        uint256 streamId = _createStream();
        vm.prank(bob);
        vm.expectRevert(StreamEscrow.NothingToWithdraw.selector);
        escrow.withdraw(streamId);
    }

    function test_withdraw_doubleWithdraw() public {
        uint256 streamId = _createStream();
        uint256 startTs = block.timestamp;

        // First withdraw at 1/4
        vm.warp(startTs + DURATION / 4);
        vm.prank(bob);
        escrow.withdraw(streamId);
        uint256 bobAfterFirst = usdc.balanceOf(bob);

        // Second withdraw at 3/4
        vm.warp(startTs + DURATION * 3 / 4);
        vm.prank(bob);
        escrow.withdraw(streamId);
        // Should get only the new accrual: 3/4 - 1/4 = 1/2
        assertEq(usdc.balanceOf(bob), bobAfterFirst + DEPOSIT / 2);
    }

    function test_withdraw_triggersCompletion() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(bob);
        escrow.withdraw(streamId);
        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Completed));
    }

    // ==================== cancel (Task 5) ====================

    function test_cancel_splitsCorrectly() public {
        uint256 streamId = _createStream();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.warp(block.timestamp + DURATION / 2);
        vm.prank(alice);
        escrow.cancel(streamId);

        // Provider gets half, client gets half
        assertEq(usdc.balanceOf(bob), bobBefore + DEPOSIT / 2);
        assertEq(usdc.balanceOf(alice), aliceBefore + DEPOSIT / 2);
    }

    function test_cancel_revertsNonClient() public {
        uint256 streamId = _createStream();
        vm.prank(bob);
        vm.expectRevert(StreamEscrow.NotClient.selector);
        escrow.cancel(streamId);
    }

    function test_cancel_afterFullDuration() public {
        uint256 streamId = _createStream();
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.warp(block.timestamp + DURATION + 100);
        vm.prank(alice);
        escrow.cancel(streamId);

        // Provider gets everything
        assertEq(usdc.balanceOf(bob), bobBefore + DEPOSIT);
        assertEq(usdc.balanceOf(alice), aliceBefore);
    }

    function test_cancel_atZero() public {
        uint256 streamId = _createStream();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(alice);
        escrow.cancel(streamId);

        // Client gets full refund
        assertEq(usdc.balanceOf(alice), aliceBefore + DEPOSIT);
        assertEq(usdc.balanceOf(bob), bobBefore);
    }

    function test_cancel_emitsEvent() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION / 2);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit StreamEscrow.StreamCancelled(streamId, DEPOSIT / 2, DEPOSIT / 2);
        escrow.cancel(streamId);
    }

    // ==================== topUp (Task 6) ====================

    function test_topUp_extendsEndTime() public {
        uint256 streamId = _createStream();
        StreamEscrow.Stream memory sBefore = escrow.getStream(streamId);
        uint256 topUpAmount = 50e6;

        // Rate = DEPOSIT / DURATION = 100e6 / 3600
        // Extension = topUpAmount / rate = 50e6 / (100e6/3600) = 50e6 * 3600 / 100e6 = 1800
        uint256 expectedExtension = topUpAmount * DURATION / DEPOSIT;

        // Mint more USDC to alice for topUp
        usdc.mint(alice, topUpAmount);
        vm.prank(alice);
        usdc.approve(address(escrow), topUpAmount);

        vm.prank(alice);
        escrow.topUp(streamId, topUpAmount);

        StreamEscrow.Stream memory sAfter = escrow.getStream(streamId);
        assertEq(sAfter.deposit, sBefore.deposit + topUpAmount);
        assertEq(sAfter.endTime, sBefore.endTime + expectedExtension);
    }

    function test_topUp_revertsCancelled() public {
        uint256 streamId = _createStream();
        vm.prank(alice);
        escrow.cancel(streamId);

        vm.prank(alice);
        vm.expectRevert(StreamEscrow.StreamNotActive.selector);
        escrow.topUp(streamId, 10e6);
    }

    function test_topUp_revertsCompleted() public {
        uint256 streamId = _createStream();
        // Complete by warping past end and calling checkStream
        vm.warp(block.timestamp + DURATION + 1);
        escrow.checkStream(streamId);

        vm.prank(alice);
        vm.expectRevert(StreamEscrow.StreamNotActive.selector);
        escrow.topUp(streamId, 10e6);
    }

    // ==================== reputation integration (Task 7) ====================

    function test_completion_recordsPositiveReputation() public {
        uint256 streamId = _createStream();
        vm.warp(block.timestamp + DURATION + 1);

        // Withdraw triggers _checkCompletion which records reputation
        vm.prank(bob);
        escrow.withdraw(streamId);

        StreamEscrow.Stream memory s = escrow.getStream(streamId);
        assertEq(uint256(s.status), uint256(StreamEscrow.StreamStatus.Completed));

        // Verify reputation feedback was recorded
        assertEq(reputation.feedbackCount(), 1);
        (uint256 agentId, int128 score, uint8 category, string memory tag,) = reputation.feedbacks(0);
        assertEq(agentId, bobAgentId);
        assertEq(score, 100);
        assertEq(category, 0);
        assertEq(tag, "stream_completed");
    }
}
