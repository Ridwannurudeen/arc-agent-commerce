// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PipelineOrchestrator} from "../src/PipelineOrchestrator.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";
import {IAgenticCommerce} from "../src/interfaces/IAgenticCommerce.sol";
import {MockAgenticCommerce} from "./mocks/MockAgenticCommerce.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @title IntegrationTest
/// @notice Full lifecycle integration tests across PipelineOrchestrator, CommerceHook, and AgentPolicy
contract IntegrationTest is Test {
    PipelineOrchestrator orchestrator;
    CommerceHook hook;
    AgentPolicy policy;
    MockAgenticCommerce acp;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    MockUSDC usdc;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice"); // client
    address bob = makeAddr("bob"); // auditor / provider
    address charlie = makeAddr("charlie"); // deployer / provider2

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
            abi.encodeCall(CommerceHook.initialize, (address(acp), address(identity), address(reputation), deployer))
        );
        hook = CommerceHook(address(hookProxy));

        // Deploy AgentPolicy via UUPS proxy
        AgentPolicy policyImpl = new AgentPolicy();
        ERC1967Proxy policyProxy = new ERC1967Proxy(
            address(policyImpl), abi.encodeCall(AgentPolicy.initialize, (address(identity), deployer))
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

        // Register 3 agents
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
            providerAgentId: bobAgentId, providerAddress: bob, capabilityHash: keccak256("audit"), budget: 50e6
        });
        params[1] = PipelineOrchestrator.StageParam({
            providerAgentId: charlieAgentId, providerAddress: charlie, capabilityHash: keccak256("deploy"), budget: 30e6
        });
        return params;
    }

    function _createTwoStagePipeline() internal returns (uint256 pipelineId) {
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();
        vm.prank(alice);
        pipelineId = orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);
    }

    function _singleStageParams(uint256 budget) internal view returns (PipelineOrchestrator.StageParam[] memory) {
        PipelineOrchestrator.StageParam[] memory params = new PipelineOrchestrator.StageParam[](1);
        params[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId, providerAddress: bob, capabilityHash: keccak256("single-task"), budget: budget
        });
        return params;
    }

    // ==================== 1. Full Pipeline Lifecycle ====================

    /// @notice Hero test: Alice creates 2-stage pipeline (audit -> deploy), both stages complete end-to-end
    function test_fullPipelineLifecycle() public {
        uint256 aliceBefore = usdc.balanceOf(alice);

        // Step 1: Alice creates 2-stage pipeline: audit (bob, 50 USDC) -> deploy (charlie, 30 USDC)
        uint256 pipelineId = _createTwoStagePipeline();

        // Verify USDC transferred (80 USDC total)
        assertEq(usdc.balanceOf(alice), aliceBefore - 80e6, "Alice should have paid 80 USDC");
        assertEq(usdc.balanceOf(address(orchestrator)), 80e6, "Orchestrator should hold 80 USDC");

        // Verify stage 0 is Active, stage 1 is Pending
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(stageList.length, 2);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Active));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Pending));
        uint256 stage0JobId = stageList[0].jobId;
        assertGt(stage0JobId, 0, "Stage 0 should have a jobId");

        // Step 2: Bob submits on ACP (mock provider submission)
        acp.mockSetStatus(stage0JobId, IAgenticCommerce.JobStatus.Submitted);

        // Step 3: Alice approves stage 0 via hook.approveStage
        vm.prank(alice);
        hook.approveStage(stage0JobId);

        // Verify: stage 0 Completed, stage 1 now Active, new ACP job created for stage 1
        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Active));
        uint256 stage1JobId = stageList[1].jobId;
        assertGt(stage1JobId, 0, "Stage 1 should have a jobId after activation");
        assertTrue(stage1JobId != stage0JobId, "Stage 1 should have a different jobId");

        // Verify ACP job for stage 0 is completed
        assertTrue(acp.isCompleted(stage0JobId), "Stage 0 ACP job should be completed");

        // Verify pipeline state: currentStage=1, totalSpent=50e6
        (
            ,,,
            uint256 totalBudget,
            uint256 totalSpent,
            uint256 currentStage,,
            PipelineOrchestrator.PipelineStatus status,,
        ) = orchestrator.pipelines(pipelineId);
        assertEq(currentStage, 1, "Pipeline should be on stage 1");
        assertEq(totalSpent, 50e6, "50 USDC should be spent after stage 0");
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Active));

        // Step 4: Charlie submits on ACP
        acp.mockSetStatus(stage1JobId, IAgenticCommerce.JobStatus.Submitted);

        // Step 5: Alice approves stage 1
        vm.prank(alice);
        hook.approveStage(stage1JobId);

        // Verify: pipeline Completed, all stages Completed
        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Completed));

        (,,, totalBudget, totalSpent,,, status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Completed));
        assertEq(totalSpent, 80e6, "All 80 USDC should be spent");

        // Verify ACP jobs both completed
        assertTrue(acp.isCompleted(stage0JobId), "Stage 0 ACP job completed");
        assertTrue(acp.isCompleted(stage1JobId), "Stage 1 ACP job completed");

        // Verify reputation was recorded for both providers (2 positive feedbacks)
        assertEq(reputation.feedbackCount(), 2, "Two reputation feedbacks should be recorded");
    }

    // ==================== 2. Pipeline Halt On Reject ====================

    /// @notice Alice creates 2-stage pipeline, rejects stage 0 -> pipeline Halted, stage 1 budget refunded
    function test_pipelineHaltOnReject() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 pipelineId = _createTwoStagePipeline();
        uint256 aliceAfterCreate = usdc.balanceOf(alice);
        assertEq(aliceAfterCreate, aliceBefore - 80e6);

        // Get stage 0 jobId
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        uint256 stage0JobId = stageList[0].jobId;

        // Bob submits
        acp.mockSetStatus(stage0JobId, IAgenticCommerce.JobStatus.Submitted);

        // Alice rejects stage 0
        vm.prank(alice);
        hook.rejectStage(stage0JobId, "bad quality");

        // Verify: pipeline Halted
        (,,,,,,, PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Halted));

        // Verify: stage 1 budget (30 USDC) refunded to alice
        assertEq(usdc.balanceOf(alice), aliceAfterCreate + 30e6, "Stage 1 budget (30 USDC) should be refunded");

        // Verify: ACP job rejected
        assertTrue(acp.isRejected(stage0JobId), "Stage 0 ACP job should be rejected");

        // Verify both stages are Failed
        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Failed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Failed));

        // Verify negative reputation recorded for bob
        assertEq(reputation.feedbackCount(), 1);
        (uint256 agentId, int128 score,, string memory tag,) = reputation.feedbacks(0);
        assertEq(agentId, bobAgentId);
        assertEq(score, -50);
        assertEq(tag, "delivery_rejected");
    }

    // ==================== 3. Pipeline With Auto-Approve ====================

    /// @notice Alice creates 1-stage with autoApprove, bob submits -> ACP calls afterAction -> auto-completes
    function test_pipelineWithAutoApprove() public {
        // Create a 1-stage pipeline
        PipelineOrchestrator.StageParam[] memory params = _singleStageParams(50e6);
        vm.prank(alice);
        uint256 pipelineId = orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);

        // Get the jobId
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        uint256 jobId = stageList[0].jobId;

        // Enable autoApprove
        vm.prank(alice);
        hook.setAutoApprove(pipelineId, true);
        assertTrue(hook.autoApprove(pipelineId), "Auto-approve should be enabled");

        // Mock provider submission
        acp.mockSetStatus(jobId, IAgenticCommerce.JobStatus.Submitted);

        // Simulate ACP calling hook.afterAction with submit selector
        bytes4 submitSelector = IAgenticCommerce.submit.selector;
        vm.prank(address(acp));
        hook.afterAction(jobId, submitSelector, abi.encode(bob, bytes32(0), ""));

        // Verify: auto-completed -> pipeline Completed
        assertTrue(acp.isCompleted(jobId), "ACP job should be auto-completed");

        (,,,,,,, PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Completed));

        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));

        // Verify reputation recorded automatically
        assertEq(reputation.feedbackCount(), 1, "One reputation feedback from auto-approve");
    }

    // ==================== 4. Pipeline With Policy (passes) ====================

    /// @notice Alice sets policy (maxPerTx=50e6, maxDaily=200e6), creates 2-stage pipeline (50+30=80 < 200) -> succeeds
    function test_pipelineWithPolicy() public {
        // Alice sets policy
        vm.prank(alice);
        policy.setPolicy(alice, 50e6, 200e6);

        // Create pipeline (total 80 USDC, under 200 daily limit)
        uint256 pipelineId = _createTwoStagePipeline();

        // Verify pipeline was created successfully
        (uint256 clientAgentId,,, uint256 totalBudget,,,, PipelineOrchestrator.PipelineStatus status,,) =
            orchestrator.pipelines(pipelineId);
        assertEq(clientAgentId, aliceAgentId);
        assertEq(totalBudget, 80e6);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Active));

        // Verify stages are properly set up
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(stageList.length, 2);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Active));
    }

    // ==================== 5. Pipeline With Policy (reverts) ====================

    /// @notice Alice sets policy (maxDaily=40e6), creates pipeline with total 80e6 -> reverts ExceedsDailyLimit
    function test_pipelineWithPolicy_revert() public {
        // Alice sets restrictive daily policy
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 40e6); // maxPerTx=100, maxDaily=40

        // Pipeline needs 80 USDC (50 + 30) which exceeds 40 daily limit
        PipelineOrchestrator.StageParam[] memory params = _twoStageParams();
        vm.prank(alice);
        vm.expectRevert(AgentPolicy.ExceedsDailyLimit.selector);
        orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);
    }

    // ==================== 6. Single Stage Pipeline End-to-End ====================

    /// @notice 1-stage pipeline: create -> submit -> approve -> completed (equivalent to single job hire)
    function test_singleStagePipeline() public {
        uint256 aliceBefore = usdc.balanceOf(alice);

        // Create 1-stage pipeline
        PipelineOrchestrator.StageParam[] memory params = _singleStageParams(100e6);
        vm.prank(alice);
        uint256 pipelineId = orchestrator.createPipeline(aliceAgentId, params, address(usdc), block.timestamp + 7 days);

        // Verify USDC transferred
        assertEq(usdc.balanceOf(alice), aliceBefore - 100e6);

        // Verify single stage is active
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        assertEq(stageList.length, 1);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Active));
        uint256 jobId = stageList[0].jobId;
        assertGt(jobId, 0);

        // Bob submits
        acp.mockSetStatus(jobId, IAgenticCommerce.JobStatus.Submitted);

        // Alice approves
        vm.prank(alice);
        hook.approveStage(jobId);

        // Verify: pipeline Completed, single stage Completed
        (,,, uint256 totalBudget, uint256 totalSpent,,, PipelineOrchestrator.PipelineStatus status,,) =
            orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Completed));
        assertEq(totalSpent, 100e6);
        assertEq(totalBudget, 100e6);

        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));

        // ACP job completed
        assertTrue(acp.isCompleted(jobId));

        // Reputation recorded
        assertEq(reputation.feedbackCount(), 1);
    }

    // ==================== 7. Cancel And Refund ====================

    /// @notice Alice creates 2-stage, completes stage 0, cancels -> gets 30 USDC refund (stage 1 unspent)
    function test_cancelAndRefund() public {
        uint256 pipelineId = _createTwoStagePipeline();

        // Get stage 0 jobId and complete it through the full flow
        PipelineOrchestrator.Stage[] memory stageList = orchestrator.getStages(pipelineId);
        uint256 stage0JobId = stageList[0].jobId;

        // Bob submits stage 0
        acp.mockSetStatus(stage0JobId, IAgenticCommerce.JobStatus.Submitted);

        // Alice approves stage 0 (50 USDC spent)
        vm.prank(alice);
        hook.approveStage(stage0JobId);

        // Verify stage 0 completed, stage 1 now active
        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Active));

        uint256 aliceBeforeCancel = usdc.balanceOf(alice);

        // Alice cancels the pipeline (stage 1 not yet completed)
        vm.prank(alice);
        orchestrator.cancelPipeline(pipelineId);

        // Verify: alice gets 30 USDC refund (stage 1 budget, unspent)
        assertEq(usdc.balanceOf(alice), aliceBeforeCancel + 30e6, "Alice should get 30 USDC refund for unspent stage 1");

        // Verify pipeline is Cancelled
        (,,,,,,, PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint256(status), uint256(PipelineOrchestrator.PipelineStatus.Cancelled));

        // Verify stage statuses: stage 0 stays Completed, stage 1 becomes Failed
        stageList = orchestrator.getStages(pipelineId);
        assertEq(uint256(stageList[0].status), uint256(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint256(stageList[1].status), uint256(PipelineOrchestrator.StageStatus.Failed));
    }
}
