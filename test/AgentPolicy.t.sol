// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract AgentPolicyTest is Test {
    AgentPolicy policy;
    MockIdentityRegistry identity;
    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address orchestrator = makeAddr("orchestrator");

    function setUp() public {
        vm.startPrank(deployer);
        identity = new MockIdentityRegistry();
        AgentPolicy impl = new AgentPolicy();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(AgentPolicy.initialize, (address(identity), deployer))
        );
        policy = AgentPolicy(address(proxy));
        policy.setOrchestrator(orchestrator);
        vm.stopPrank();
    }

    // ==================== setPolicy ====================

    function test_setPolicy() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        (uint256 maxPerTx, uint256 maxDaily, uint256 dailySpent, uint256 dayStart, bool exists) =
            policy.policies(alice);
        assertEq(maxPerTx, 100e6);
        assertEq(maxDaily, 500e6);
        assertEq(dailySpent, 0);
        assertEq(dayStart, (block.timestamp / 1 days) * 1 days);
        assertTrue(exists);
        assertEq(policy.policyOwners(alice), alice);
    }

    // ==================== checkStageBudget ====================

    function test_checkStageBudget_withinLimits() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        vm.prank(orchestrator);
        bool ok = policy.checkStageBudget(alice, 50e6, bob);
        assertTrue(ok);
    }

    function test_checkStageBudget_exceedsPerTx() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.ExceedsPerTxLimit.selector);
        policy.checkStageBudget(alice, 150e6, bob);
    }

    function test_checkStageBudget_exceedsDaily() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 150e6, bob);

        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.ExceedsDailyLimit.selector);
        policy.checkStageBudget(alice, 100e6, bob);
    }

    function test_checkStageBudget_dailyReset() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 200e6, bob);

        // Warp forward 1 day — daily budget should reset
        vm.warp(block.timestamp + 1 days);

        vm.prank(orchestrator);
        bool ok = policy.checkStageBudget(alice, 200e6, bob);
        assertTrue(ok);
    }

    function test_checkStageBudget_noPolicy() public {
        // No policy set for bob — should always return true
        vm.prank(orchestrator);
        bool ok = policy.checkStageBudget(bob, 1_000_000e6, alice);
        assertTrue(ok);
    }

    // ==================== Counterparty Restriction ====================

    function test_counterpartyRestriction() public {
        address charlie = makeAddr("charlie");

        vm.startPrank(alice);
        policy.setPolicy(alice, 1000e6, 5000e6);
        policy.setCounterpartyRestriction(alice, true);
        vm.stopPrank();

        // Counterparty not allowed yet — should revert
        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.CounterpartyNotAllowed.selector);
        policy.checkStageBudget(alice, 50e6, bob);

        // Allow bob
        vm.prank(alice);
        policy.setAllowedCounterparty(alice, bob, true);

        // Now bob passes
        vm.prank(orchestrator);
        bool ok = policy.checkStageBudget(alice, 50e6, bob);
        assertTrue(ok);

        // Charlie still blocked
        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.CounterpartyNotAllowed.selector);
        policy.checkStageBudget(alice, 50e6, charlie);
    }

    // ==================== wouldPass ====================

    function test_wouldPass() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        // Within limits — true
        assertTrue(policy.wouldPass(alice, 50e6, bob));
        // Exceeds per-tx — false (no revert)
        assertFalse(policy.wouldPass(alice, 150e6, bob));

        // No policy — always true
        assertTrue(policy.wouldPass(bob, 1_000_000e6, alice));
    }

    // ==================== dailyRemaining ====================

    function test_dailyRemaining() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        assertEq(policy.dailyRemaining(alice), 200e6);

        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 80e6, bob);

        assertEq(policy.dailyRemaining(alice), 120e6);

        // No policy — type(uint256).max
        assertEq(policy.dailyRemaining(bob), type(uint256).max);
    }

    // ==================== checkPipelineBudget ====================

    function test_checkPipelineBudget() public {
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 200e6);

        // Within daily — should pass (view only, no state update)
        bool ok = policy.checkPipelineBudget(alice, 150e6);
        assertTrue(ok);

        // Exceeds daily — should revert
        vm.expectRevert(AgentPolicy.ExceedsDailyLimit.selector);
        policy.checkPipelineBudget(alice, 300e6);

        // No policy — always true
        ok = policy.checkPipelineBudget(bob, 1_000_000e6);
        assertTrue(ok);
    }

    // ==================== Access Control ====================

    function test_setPolicy_revertNotPolicyOwner() public {
        // Alice sets her own policy first
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        // Bob tries to change alice's counterparty restriction — should revert
        vm.prank(bob);
        vm.expectRevert(AgentPolicy.NotPolicyOwner.selector);
        policy.setCounterpartyRestriction(alice, true);

        // Bob tries to set an allowed counterparty for alice — should revert
        vm.prank(bob);
        vm.expectRevert(AgentPolicy.NotPolicyOwner.selector);
        policy.setAllowedCounterparty(alice, bob, true);
    }

    function test_setOrchestrator_onlyOwner() public {
        address newOrch = makeAddr("newOrch");

        // Non-owner can't set orchestrator
        vm.prank(alice);
        vm.expectRevert();
        policy.setOrchestrator(newOrch);

        // Owner can set orchestrator
        vm.prank(deployer);
        policy.setOrchestrator(newOrch);
        assertEq(policy.orchestrator(), newOrch);
    }

    function test_checkStageBudget_onlyOrchestrator() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        // Non-orchestrator can't call checkStageBudget
        vm.prank(alice);
        vm.expectRevert(AgentPolicy.OnlyOrchestrator.selector);
        policy.checkStageBudget(alice, 50e6, bob);
    }
}
