// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PipelineOrchestrator} from "../src/PipelineOrchestrator.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";
import {MockAgenticCommerce} from "./mocks/MockAgenticCommerce.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract PipelineOrchestratorTest is Test {
    PipelineOrchestrator orchestrator;
    CommerceHook hook;
    AgentPolicy policy;
    MockAgenticCommerce acp;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    MockUSDC usdc;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");   // client
    address bob = makeAddr("bob");       // provider
    address charlie = makeAddr("charlie"); // provider2

    uint256 aliceAgentId;
    uint256 bobAgentId;
    uint256 charlieAgentId;

    function setUp() public {
        vm.startPrank(deployer);

        // Deploy mocks
        acp = new MockAgenticCommerce();
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        usdc = new MockUSDC();

        // Deploy CommerceHook via UUPS proxy
        CommerceHook hookImpl = new CommerceHook();
        ERC1967Proxy hookProxy = new ERC1967Proxy(
            address(hookImpl),
            abi.encodeCall(
                CommerceHook.initialize,
                (address(acp), address(identity), address(reputation), deployer)
            )
        );
        hook = CommerceHook(address(hookProxy));

        // Deploy AgentPolicy via UUPS proxy
        AgentPolicy policyImpl = new AgentPolicy();
        ERC1967Proxy policyProxy = new ERC1967Proxy(
            address(policyImpl),
            abi.encodeCall(AgentPolicy.initialize, (address(identity), deployer))
        );
        policy = AgentPolicy(address(policyProxy));

        // Deploy PipelineOrchestrator via UUPS proxy
        PipelineOrchestrator orchImpl = new PipelineOrchestrator();
        ERC1967Proxy orchProxy = new ERC1967Proxy(
            address(orchImpl),
            abi.encodeCall(
                PipelineOrchestrator.initialize,
                (address(acp), address(usdc), address(identity), address(hook), address(policy), deployer)
            )
        );
        orchestrator = PipelineOrchestrator(address(orchProxy));

        // Wire: hook.setOrchestrator, policy.setOrchestrator
        hook.setOrchestrator(address(orchestrator));
        policy.setOrchestrator(address(orchestrator));

        vm.stopPrank();

        // Register agents
        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice-agent");

        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob-agent");

        vm.prank(charlie);
        charlieAgentId = identity.register("ipfs://charlie-agent");

        // Mint 1_000_000 USDC to alice
        usdc.mint(alice, 1_000_000e6);

        // Alice approves orchestrator to spend her USDC
        vm.prank(alice);
        usdc.approve(address(orchestrator), type(uint256).max);
    }

    // ---- Helpers ----

    function _twoStageParams() internal view returns (PipelineOrchestrator.StageParam[] memory) {
        PipelineOrchestrator.StageParam[] memory params = new PipelineOrchestrator.StageParam[](2);
        params[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("data-analysis"),
            budget: 50e6
        });
        params[1] = PipelineOrchestrator.StageParam({
            providerAgentId: charlieAgentId,
            providerAddress: charlie,
            capabilityHash: keccak256("report-generation"),
            budget: 30e6
        });
        return params;
    }

    function _createDefaultPipeline() internal returns (uint256 pipelineId) {
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();
        vm.prank(alice);
        pipelineId = orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);
    }

    // ==================== createPipeline ====================

    function test_createPipeline() public {
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, params, address(usdc), block.timestamp + 7 days
        );

        // Verify pipeline state
        (
            uint256 clientAgentId,
            address client,
            address currency,
            uint256 totalBudget,
            uint256 totalSpent,
            uint256 currentStage,
            uint256 stageCount,
            PipelineOrchestrator.PipelineStatus status,
            uint256 createdAt,
            uint256 deadline
        ) = orchestrator.pipelines(pipelineId);

        assertEq(clientAgentId, aliceAgentId);
        assertEq(client, alice);
        assertEq(currency, address(usdc));
        assertEq(totalBudget, 80e6); // 50 + 30
        assertEq(totalSpent, 0);
        assertEq(currentStage, 0);
        assertEq(stageCount, 2);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Active));
        assertEq(createdAt, block.timestamp);
        assertEq(deadline, block.timestamp + 7 days);

        // USDC transferred from alice to orchestrator
        assertEq(usdc.balanceOf(alice), aliceBefore - 80e6);
        assertEq(usdc.balanceOf(address(orchestrator)), 80e6);

        // First stage should be activated (has a jobId)
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(stageList.length, 2);
        assertGt(stageList[0].jobId, 0); // jobId assigned
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Active));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Pending));
    }

    function test_createPipeline_revertZeroStages() public {
        PipelineOrchestrator.StageParam[] memory params = new PipelineOrchestrator.StageParam[](0);

        vm.prank(alice);
        vm.expectRevert(PipelineOrchestrator.NoStages.selector);
        orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);
    }

    function test_createPipeline_revertPastDeadline() public {
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();

        vm.prank(alice);
        vm.expectRevert(PipelineOrchestrator.DeadlineInPast.selector);
        orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp - 1);
    }

    function test_createPipeline_revertNotAgentOwner() public {
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();

        // Bob tries to create a pipeline with alice's agent ID
        vm.prank(bob);
        vm.expectRevert(PipelineOrchestrator.NotAgentOwner.selector);
        orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);
    }

    function test_createPipeline_revertUnsupportedCurrency() public {
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();
        address randomToken = makeAddr("randomToken");

        vm.prank(alice);
        vm.expectRevert(PipelineOrchestrator.UnsupportedCurrency.selector);
        orchestrator.createPipeline(aliceAgentId, params, randomToken, block.timestamp + 7 days);
    }

    // ==================== onStageCompleted ====================

    function test_onStageCompleted_advancesToNextStage() public {
        uint256 pipelineId = _createDefaultPipeline();

        // Get current stage info before completion
        PipelineOrchestrator.Stage[] memory stagesBefore = orchestrator.getStages(pipelineId);
        assertEq(uint256(stagesBefore[0].status), uint256(PipelineOrchestrator.StageStatus.Active));

        // Hook calls onStageCompleted for stage 0
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        // Verify: stage 0 completed, stage 1 now active, currentStage incremented
        PipelineOrchestrator.Stage[] memory stagesAfter = orchestrator.getStages(pipelineId);
        assertEq(uint256(stagesAfter[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint256(stagesAfter[1].status), uint256(PipelineOrchestrator.StageStatus.Active));
        assertGt(stagesAfter[1].jobId, 0); // new ACP job created for stage 1

        (,,, uint256 totalBudget, uint256 totalSpent, uint256 currentStage,,,,) =
            orchestrator.pipelines(pipelineId);
        assertEq(currentStage, 1);
        assertEq(totalSpent, 50e6); // stage 0 budget
    }

    function test_onStageCompleted_lastStage_completesPipeline() public {
        uint256 pipelineId = _createDefaultPipeline();

        // Complete stage 0
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        // Complete stage 1 (last stage)
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 1);

        // Pipeline should be Completed
        (,,, uint256 totalBudget, uint256 totalSpent,,, PipelineOrchestrator.PipelineStatus status,,) =
            orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Completed));
        assertEq(totalSpent, 80e6); // 50 + 30
    }

    function test_onStageCompleted_revertNotHook() public {
        uint256 pipelineId = _createDefaultPipeline();

        // Alice tries to call directly — should revert
        vm.prank(alice);
        vm.expectRevert(PipelineOrchestrator.NotCommerceHook.selector);
        orchestrator.onStageCompleted(pipelineId, 0);
    }

    // ==================== cancelPipeline ====================

    function test_cancelPipeline() public {
        uint256 pipelineId = _createDefaultPipeline();
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        orchestrator.cancelPipeline(pipelineId);

        // Pipeline status should be Cancelled
        (,,,,,,, PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Cancelled));

        // Full refund — totalBudget (80e6) returned since nothing was spent
        assertEq(usdc.balanceOf(alice), aliceBefore + 80e6);

        // All stages should be Failed
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Failed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Failed));
    }

    function test_cancelPipeline_afterOneStage() public {
        uint256 pipelineId = _createDefaultPipeline();

        // Complete stage 0 (50 USDC spent)
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);

        // Cancel after stage 0 complete — should get back 30 USDC (stage 1 budget)
        vm.prank(alice);
        orchestrator.cancelPipeline(pipelineId);

        assertEq(usdc.balanceOf(alice), aliceBefore + 30e6);

        // Verify stage statuses
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Failed));
    }

    function test_cancelPipeline_revertNotClient() public {
        uint256 pipelineId = _createDefaultPipeline();

        vm.prank(bob);
        vm.expectRevert(PipelineOrchestrator.NotPipelineClient.selector);
        orchestrator.cancelPipeline(pipelineId);
    }

    // ==================== onStageRejected ====================

    function test_onStageRejected_haltsPipeline() public {
        uint256 pipelineId = _createDefaultPipeline();
        uint256 aliceBefore = usdc.balanceOf(alice);

        // Hook rejects stage 0 — should halt pipeline and refund stage 1 budget
        vm.prank(address(hook));
        orchestrator.onStageRejected(pipelineId, 0);

        // Pipeline should be Halted
        (,,,,,,, PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Halted));

        // Refund: stage 1 budget (30e6) since it was unstarted
        assertEq(usdc.balanceOf(alice), aliceBefore + 30e6);

        // Verify stage statuses
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Failed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Failed));
    }

    // ==================== Policy check ====================

    function test_createPipeline_policyCheck() public {
        // Set a daily limit lower than the pipeline total budget (80e6)
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 50e6); // daily limit = 50 USDC, pipeline needs 80

        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();

        vm.prank(alice);
        vm.expectRevert(AgentPolicy.ExceedsDailyLimit.selector);
        orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);
    }

    // ==================== Single stage pipeline ====================

    function test_singleStagePipeline() public {
        PipelineOrchestrator.StageParam[] memory params = new PipelineOrchestrator.StageParam[](1);
        params[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("single-task"),
            budget: 100e6
        });

        vm.prank(alice);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, params, address(usdc), block.timestamp + 7 days
        );

        // Verify single stage is active
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(stageList.length, 1);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Active));

        // Complete it
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        // Pipeline should be Completed
        (,,,,,,, PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Completed));

        (,,, uint256 totalBudget, uint256 totalSpent,,,,,) = orchestrator.pipelines(pipelineId);
        assertEq(totalSpent, 100e6);
    }

    // ==================== View functions ====================

    function test_getStages() public {
        uint256 pipelineId = _createDefaultPipeline();

        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(stageList.length, 2);
        assertEq(stageList[0].providerAgentId, bobAgentId);
        assertEq(stageList[0].providerAddress, bob);
        assertEq(stageList[0].capabilityHash, keccak256("data-analysis"));
        assertEq(stageList[0].budget, 50e6);
        assertEq(stageList[1].providerAgentId, charlieAgentId);
        assertEq(stageList[1].providerAddress, charlie);
        assertEq(stageList[1].capabilityHash, keccak256("report-generation"));
        assertEq(stageList[1].budget, 30e6);
    }

    function test_getClientPipelines() public {
        // Create two pipelines
        uint256 pid1 = _createDefaultPipeline();
        uint256 pid2 = _createDefaultPipeline();

        uint256[] memory pids = orchestrator.getClientPipelines(alice);
        assertEq(pids.length, 2);
        assertEq(pids[0], pid1);
        assertEq(pids[1], pid2);
    }
}
