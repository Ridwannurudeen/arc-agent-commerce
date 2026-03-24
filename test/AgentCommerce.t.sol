// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ServiceMarket} from "../src/ServiceMarket.sol";
import {ServiceEscrow} from "../src/ServiceEscrow.sol";
import {SpendingPolicy} from "../src/SpendingPolicy.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";

contract AgentCommerceTest is Test {
    MockUSDC usdc;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    SpendingPolicy policy;
    ServiceMarket market;
    ServiceEscrow escrow;

    address alice = makeAddr("alice"); // agent owner / client
    address bob = makeAddr("bob"); // provider agent owner
    address charlie = makeAddr("charlie"); // random third party
    address deployer = makeAddr("deployer");

    uint256 aliceAgentId;
    uint256 bobAgentId;

    bytes32 constant CAP_AUDIT = keccak256("smart_contract_audit");
    bytes32 constant CAP_MONITOR = keccak256("price_monitoring");

    function setUp() public {
        vm.startPrank(deployer);
        usdc = new MockUSDC();
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        policy = new SpendingPolicy(address(identity));
        market = new ServiceMarket(address(identity));
        escrow = new ServiceEscrow(
            address(usdc),
            address(identity),
            address(reputation),
            address(policy),
            address(market)
        );
        vm.stopPrank();

        // Register agents
        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice-agent");

        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob-agent");

        // Fund alice with USDC
        usdc.mint(alice, 100_000e6); // 100k USDC
    }

    // ==================== ServiceMarket Tests ====================

    function test_listService() public {
        vm.prank(bob);
        uint256 serviceId = market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://audit-service");

        ServiceMarket.Service memory svc = market.getService(serviceId);
        assertEq(svc.agentId, bobAgentId);
        assertEq(svc.provider, bob);
        assertEq(svc.capabilityHash, CAP_AUDIT);
        assertEq(svc.pricePerTask, 50e6);
        assertTrue(svc.active);
    }

    function test_listService_revertNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(ServiceMarket.NotAgentOwner.selector);
        market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://fake");
    }

    function test_listService_revertZeroPrice() public {
        vm.prank(bob);
        vm.expectRevert(ServiceMarket.ZeroPrice.selector);
        market.listService(bobAgentId, CAP_AUDIT, 0, "ipfs://free");
    }

    function test_delistService() public {
        vm.prank(bob);
        uint256 serviceId = market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://audit");

        vm.prank(bob);
        market.delistService(serviceId);

        ServiceMarket.Service memory svc = market.getService(serviceId);
        assertFalse(svc.active);
    }

    function test_delistService_revertNotOwner() public {
        vm.prank(bob);
        uint256 serviceId = market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://audit");

        vm.prank(alice);
        vm.expectRevert(ServiceMarket.NotAgentOwner.selector);
        market.delistService(serviceId);
    }

    function test_updateService() public {
        vm.prank(bob);
        uint256 serviceId = market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://v1");

        vm.prank(bob);
        market.updateService(serviceId, 75e6, "ipfs://v2");

        ServiceMarket.Service memory svc = market.getService(serviceId);
        assertEq(svc.pricePerTask, 75e6);
        assertEq(svc.metadataURI, "ipfs://v2");
    }

    function test_getServicesByCapability() public {
        vm.startPrank(bob);
        market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://audit1");
        market.listService(bobAgentId, CAP_MONITOR, 5e6, "ipfs://monitor1");
        market.listService(bobAgentId, CAP_AUDIT, 100e6, "ipfs://audit2");
        vm.stopPrank();

        uint256[] memory auditServices = market.getServicesByCapability(CAP_AUDIT);
        assertEq(auditServices.length, 2);

        uint256[] memory monitorServices = market.getServicesByCapability(CAP_MONITOR);
        assertEq(monitorServices.length, 1);
    }

    function test_getServicesByAgent() public {
        vm.startPrank(bob);
        market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://a");
        market.listService(bobAgentId, CAP_MONITOR, 5e6, "ipfs://b");
        vm.stopPrank();

        uint256[] memory bobServices = market.getServicesByAgent(bobAgentId);
        assertEq(bobServices.length, 2);
    }

    // ==================== ServiceEscrow Tests ====================

    function test_createAgreement() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob,
            bobAgentId,
            0, // human client
            50e6,
            block.timestamp + 1 days,
            keccak256("audit task"),
            0
        );
        vm.stopPrank();

        ServiceEscrow.Agreement memory agr = escrow.getAgreement(agId);
        assertEq(agr.client, alice);
        assertEq(agr.provider, bob);
        assertEq(agr.amount, 50e6);
        assertEq(uint8(agr.status), uint8(ServiceEscrow.Status.Active));
        assertEq(usdc.balanceOf(address(escrow)), 50e6);
    }

    function test_createAgreement_revertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ServiceEscrow.InvalidAmount.selector);
        escrow.createAgreement(bob, bobAgentId, 0, 0, block.timestamp + 1 days, bytes32(0), 0);
    }

    function test_createAgreement_revertPastDeadline() public {
        vm.prank(alice);
        vm.expectRevert(ServiceEscrow.InvalidDeadline.selector);
        escrow.createAgreement(bob, bobAgentId, 0, 50e6, block.timestamp - 1, bytes32(0), 0);
    }

    function test_confirmCompletion() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 1000e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 1000e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        escrow.confirmCompletion(agId);
        vm.stopPrank();

        // 0.1% fee = 1 USDC
        assertEq(usdc.balanceOf(bob), 999e6);
        assertEq(usdc.balanceOf(deployer), 1e6); // fee to deployer (escrow owner)
        assertEq(escrow.totalFeesCollected(), 1e6);

        // Check reputation was recorded
        assertEq(reputation.feedbackCount(), 1);
        (uint256 agentId, int128 score,,, ) = reputation.feedbacks(0);
        assertEq(agentId, bobAgentId);
        assertEq(score, 100);
    }

    function test_confirmCompletion_revertNotClient() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(ServiceEscrow.NotClient.selector);
        escrow.confirmCompletion(agId);
    }

    function test_dispute() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        escrow.dispute(agId);
        vm.stopPrank();

        ServiceEscrow.Agreement memory agr = escrow.getAgreement(agId);
        assertEq(uint8(agr.status), uint8(ServiceEscrow.Status.Disputed));
    }

    function test_dispute_byProvider() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        vm.stopPrank();

        vm.prank(bob);
        escrow.dispute(agId);

        ServiceEscrow.Agreement memory agr = escrow.getAgreement(agId);
        assertEq(uint8(agr.status), uint8(ServiceEscrow.Status.Disputed));
    }

    function test_dispute_revertThirdParty() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        vm.stopPrank();

        vm.prank(charlie);
        vm.expectRevert(ServiceEscrow.NotClient.selector);
        escrow.dispute(agId);
    }

    function test_resolveDispute_fullClientRefund() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        escrow.dispute(agId);
        vm.stopPrank();

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(deployer);
        escrow.resolveDispute(agId, 100); // 100% to client

        assertEq(usdc.balanceOf(alice), aliceBefore + 50e6);
        assertEq(usdc.balanceOf(bob), 0);

        // Provider lost dispute — negative reputation recorded
        assertEq(reputation.feedbackCount(), 1);
        (, int128 score,,,) = reputation.feedbacks(0);
        assertEq(score, -50);
    }

    function test_resolveDispute_splitPayout() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 100e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 100e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        escrow.dispute(agId);
        vm.stopPrank();

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(deployer);
        escrow.resolveDispute(agId, 30); // 30% client, 70% provider

        assertEq(usdc.balanceOf(alice), aliceBefore + 30e6);
        assertEq(usdc.balanceOf(bob), 70e6);

        // Provider didn't "lose" (clientPct <= 50), no negative rep
        assertEq(reputation.feedbackCount(), 0);
    }

    function test_resolveDispute_revertNotOwner() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        escrow.dispute(agId);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(ServiceEscrow.NotOwner.selector);
        escrow.resolveDispute(agId, 50);
    }

    function test_claimExpired() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        vm.stopPrank();

        uint256 aliceBefore = usdc.balanceOf(alice);

        // Fast forward past deadline
        vm.warp(block.timestamp + 2 days);

        vm.prank(alice);
        escrow.claimExpired(agId);

        assertEq(usdc.balanceOf(alice), aliceBefore + 50e6);

        // Negative reputation for deadline miss
        assertEq(reputation.feedbackCount(), 1);
        (, int128 score,,,) = reputation.feedbacks(0);
        assertEq(score, -30);
    }

    function test_claimExpired_revertBeforeDeadline() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );

        vm.expectRevert(ServiceEscrow.DeadlineNotReached.selector);
        escrow.claimExpired(agId);
        vm.stopPrank();
    }

    function test_doubleComplete_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("task"), 0
        );
        escrow.confirmCompletion(agId);

        vm.expectRevert();
        escrow.confirmCompletion(agId);
        vm.stopPrank();
    }

    function test_setFee() public {
        vm.prank(deployer);
        escrow.setFee(50); // 0.5%

        assertEq(escrow.feeBps(), 50);
    }

    function test_setFee_revertTooHigh() public {
        vm.prank(deployer);
        vm.expectRevert(ServiceEscrow.FeeTooHigh.selector);
        escrow.setFee(101);
    }

    function test_agreementTracking() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 200e6);
        escrow.createAgreement(bob, bobAgentId, 0, 50e6, block.timestamp + 1 days, keccak256("t1"), 0);
        escrow.createAgreement(bob, bobAgentId, 0, 100e6, block.timestamp + 2 days, keccak256("t2"), 0);
        vm.stopPrank();

        assertEq(escrow.getClientAgreements(alice).length, 2);
        assertEq(escrow.getProviderAgreements(bob).length, 2);
    }

    // ==================== SpendingPolicy Tests ====================

    function test_setPolicy() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        (uint256 maxPerTx, uint256 maxDaily,,,) = policy.policies(alice);
        assertEq(maxPerTx, 100e6);
        assertEq(maxDaily, 500e6);
    }

    function test_checkPolicy_passes() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        bool ok = policy.checkPolicy(alice, 50e6, bob);
        assertTrue(ok);
    }

    function test_checkPolicy_exceedsPerTx() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        vm.expectRevert();
        policy.checkPolicy(alice, 150e6, bob);
    }

    function test_checkPolicy_exceedsDaily() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        policy.checkPolicy(alice, 150e6, bob);

        vm.expectRevert();
        policy.checkPolicy(alice, 100e6, bob);
    }

    function test_checkPolicy_dailyResets() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        policy.checkPolicy(alice, 200e6, bob);

        // Next day
        vm.warp(block.timestamp + 1 days);

        // Should pass again
        bool ok = policy.checkPolicy(alice, 200e6, bob);
        assertTrue(ok);
    }

    function test_counterpartyRestriction() public {
        vm.startPrank(alice);
        policy.setPolicy(alice, 1000e6, 5000e6);
        policy.setCounterpartyRestriction(alice, true);
        policy.setAllowedCounterparty(alice, bob, true);
        vm.stopPrank();

        // Bob is allowed
        bool ok = policy.checkPolicy(alice, 50e6, bob);
        assertTrue(ok);

        // Charlie is not
        vm.expectRevert();
        policy.checkPolicy(alice, 50e6, charlie);
    }

    function test_wouldPass() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        assertTrue(policy.wouldPass(alice, 50e6, bob));
        assertFalse(policy.wouldPass(alice, 150e6, bob));
    }

    function test_dailyRemaining() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        assertEq(policy.dailyRemaining(alice), 200e6);

        policy.checkPolicy(alice, 80e6, bob);
        assertEq(policy.dailyRemaining(alice), 120e6);
    }

    function test_noPolicy_noRestrictions() public view {
        assertTrue(policy.wouldPass(charlie, 1_000_000e6, bob));
        assertEq(policy.dailyRemaining(charlie), type(uint256).max);
    }

    // ==================== Integration: Escrow + Policy ====================

    function test_escrow_respectsSpendingPolicy() public {
        // Alice sets a policy on her agent wallet
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 300e6);

        // Try to create an agreement above per-tx limit (as agent)
        vm.startPrank(alice);
        usdc.approve(address(escrow), 200e6);

        vm.expectRevert();
        escrow.createAgreement(
            bob,
            bobAgentId,
            aliceAgentId, // client IS an agent — policy enforced
            200e6,
            block.timestamp + 1 days,
            keccak256("big task"),
            0
        );
        vm.stopPrank();
    }

    function test_escrow_humanBypassesPolicy() public {
        // Alice sets a policy
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 300e6);

        // As human (clientAgentId = 0), policy is NOT checked
        vm.startPrank(alice);
        usdc.approve(address(escrow), 200e6);
        uint256 agId = escrow.createAgreement(
            bob,
            bobAgentId,
            0, // human — no policy check
            200e6,
            block.timestamp + 1 days,
            keccak256("big task"),
            0
        );
        vm.stopPrank();

        assertEq(escrow.getAgreement(agId).amount, 200e6);
    }

    // ==================== Full End-to-End Flow ====================

    function test_fullFlow() public {
        // 1. Bob lists a service
        vm.prank(bob);
        uint256 serviceId = market.listService(bobAgentId, CAP_AUDIT, 50e6, "ipfs://audit-svc");

        // 2. Alice discovers the service
        uint256[] memory auditServices = market.getServicesByCapability(CAP_AUDIT);
        assertEq(auditServices.length, 1);
        ServiceMarket.Service memory svc = market.getService(auditServices[0]);
        assertEq(svc.pricePerTask, 50e6);

        // 3. Alice creates an agreement referencing the service
        vm.startPrank(alice);
        usdc.approve(address(escrow), 50e6);
        uint256 agId = escrow.createAgreement(
            bob,
            bobAgentId,
            0,
            50e6,
            block.timestamp + 7 days,
            keccak256("audit my contract at 0x1234"),
            serviceId
        );
        vm.stopPrank();

        // 4. Verify escrow holds the funds
        assertEq(usdc.balanceOf(address(escrow)), 50e6);

        // 5. Alice confirms completion
        vm.prank(alice);
        escrow.confirmCompletion(agId);

        // 6. Verify payouts (0.1% fee = 0.05 USDC = 50000)
        uint256 expectedFee = (50e6 * 10) / 10000; // 50000
        uint256 expectedPayout = 50e6 - expectedFee;
        assertEq(usdc.balanceOf(bob), expectedPayout);
        assertEq(escrow.totalFeesCollected(), expectedFee);

        // 7. Verify reputation recorded
        assertEq(reputation.feedbackCount(), 1);

        // 8. Verify agreement status
        ServiceEscrow.Agreement memory agr = escrow.getAgreement(agId);
        assertEq(uint8(agr.status), uint8(ServiceEscrow.Status.Completed));
        assertEq(agr.serviceId, serviceId);
    }
}
