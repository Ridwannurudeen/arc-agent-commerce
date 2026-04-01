// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {IACPHook} from "../src/interfaces/IACPHook.sol";
import {IAgenticCommerce} from "../src/interfaces/IAgenticCommerce.sol";
import {MockAgenticCommerce} from "./mocks/MockAgenticCommerce.sol";
import {MockOrchestrator} from "./mocks/MockOrchestrator.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";

contract CommerceHookTest is Test {
    CommerceHook hook;
    MockAgenticCommerce acp;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    MockOrchestrator orch;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice"); // pipeline client
    address bob = makeAddr("bob"); // provider

    uint256 aliceAgentId;
    uint256 bobAgentId;

    uint256 constant PIPELINE_ID = 1;
    uint256 constant STAGE_INDEX = 0;

    function setUp() public {
        vm.startPrank(deployer);

        acp = new MockAgenticCommerce();
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        orch = new MockOrchestrator();

        // Deploy CommerceHook via UUPS proxy
        CommerceHook impl = new CommerceHook();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(CommerceHook.initialize, (address(acp), address(identity), address(reputation), deployer))
        );
        hook = CommerceHook(address(proxy));
        hook.setOrchestrator(address(orch));

        vm.stopPrank();

        // Register agents
        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice-agent");

        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob-agent");
    }

    // ---- Helpers ----

    /// @dev Creates an ACP job and registers it in the hook, returns jobId
    function _createAndRegisterJob() internal returns (uint256 jobId) {
        // Create a job in the mock ACP
        vm.prank(alice);
        jobId = acp.createJob(bob, address(hook), block.timestamp + 1 days, "test job", address(hook));

        // Set status to Submitted so approveStage can work
        acp.mockSetStatus(jobId, IAgenticCommerce.JobStatus.Submitted);

        // Register it in the hook via orchestrator
        vm.prank(address(orch));
        hook.registerPipelineJob(PIPELINE_ID, STAGE_INDEX, jobId, bobAgentId, aliceAgentId);

        // Set pipeline client
        vm.prank(address(orch));
        hook.setPipelineClient(PIPELINE_ID, alice);
    }

    // ==================== ERC165 ====================

    function test_supportsInterface() public view {
        // IACPHook interface
        bytes4 iACPHookId = type(IACPHook).interfaceId;
        assertTrue(hook.supportsInterface(iACPHookId));

        // ERC165
        bytes4 erc165Id = 0x01ffc9a7;
        assertTrue(hook.supportsInterface(erc165Id));

        // Random interface should return false
        assertFalse(hook.supportsInterface(0xdeadbeef));
    }

    // ==================== registerPipelineJob ====================

    function test_registerPipelineJob() public {
        uint256 jobId = 42;
        vm.prank(address(orch));
        hook.registerPipelineJob(PIPELINE_ID, STAGE_INDEX, jobId, bobAgentId, aliceAgentId);

        (uint256 pipelineId, uint256 stageIndex, uint256 providerAgentId, uint256 clientAgentId, bool exists) =
            hook.jobRegistry(jobId);

        assertEq(pipelineId, PIPELINE_ID);
        assertEq(stageIndex, STAGE_INDEX);
        assertEq(providerAgentId, bobAgentId);
        assertEq(clientAgentId, aliceAgentId);
        assertTrue(exists);
    }

    function test_registerPipelineJob_revertNotOrchestrator() public {
        vm.prank(alice);
        vm.expectRevert(CommerceHook.OnlyOrchestrator.selector);
        hook.registerPipelineJob(PIPELINE_ID, STAGE_INDEX, 42, bobAgentId, aliceAgentId);
    }

    // ==================== approveStage ====================

    function test_approveStage() public {
        uint256 jobId = _createAndRegisterJob();

        vm.prank(alice);
        hook.approveStage(jobId);

        // Verify ACP job was completed
        assertTrue(acp.isCompleted(jobId));

        // Verify orchestrator was notified
        assertEq(orch.lastCompletedPipeline(), PIPELINE_ID);
        assertEq(orch.lastCompletedStage(), STAGE_INDEX);

        // Verify positive reputation was recorded
        assertEq(reputation.feedbackCount(), 1);
        (uint256 agentId, int128 score,, string memory tag,) = reputation.feedbacks(0);
        assertEq(agentId, bobAgentId);
        assertEq(score, 100);
        assertEq(tag, "stage_completed");
    }

    function test_approveStage_revertNotClient() public {
        uint256 jobId = _createAndRegisterJob();

        vm.prank(bob);
        vm.expectRevert(CommerceHook.OnlyPipelineClient.selector);
        hook.approveStage(jobId);
    }

    function test_approveStage_revertJobNotRegistered() public {
        vm.prank(alice);
        vm.expectRevert(CommerceHook.JobNotRegistered.selector);
        hook.approveStage(999);
    }

    function test_approveStage_revertJobNotSubmitted() public {
        // Create a job but set status to Funded (not Submitted)
        vm.prank(alice);
        uint256 jobId = acp.createJob(bob, address(hook), block.timestamp + 1 days, "test", address(hook));
        acp.mockSetStatus(jobId, IAgenticCommerce.JobStatus.Funded);

        vm.prank(address(orch));
        hook.registerPipelineJob(PIPELINE_ID, STAGE_INDEX, jobId, bobAgentId, aliceAgentId);
        vm.prank(address(orch));
        hook.setPipelineClient(PIPELINE_ID, alice);

        vm.prank(alice);
        vm.expectRevert(CommerceHook.JobNotSubmitted.selector);
        hook.approveStage(jobId);
    }

    // ==================== rejectStage ====================

    function test_rejectStage() public {
        uint256 jobId = _createAndRegisterJob();

        vm.prank(alice);
        hook.rejectStage(jobId, "bad quality");

        // Verify ACP job was rejected
        assertTrue(acp.isRejected(jobId));

        // Verify orchestrator was notified
        assertEq(orch.lastRejectedPipeline(), PIPELINE_ID);
        assertEq(orch.lastRejectedStage(), STAGE_INDEX);

        // Verify negative reputation was recorded
        assertEq(reputation.feedbackCount(), 1);
        (uint256 agentId, int128 score,, string memory tag,) = reputation.feedbacks(0);
        assertEq(agentId, bobAgentId);
        assertEq(score, -50);
        assertEq(tag, "delivery_rejected");
    }

    function test_rejectStage_revertNotClient() public {
        uint256 jobId = _createAndRegisterJob();

        vm.prank(bob);
        vm.expectRevert(CommerceHook.OnlyPipelineClient.selector);
        hook.rejectStage(jobId, "bad");
    }

    // ==================== setAutoApprove ====================

    function test_setAutoApprove() public {
        // Set pipeline client first
        vm.prank(address(orch));
        hook.setPipelineClient(PIPELINE_ID, alice);

        vm.prank(alice);
        hook.setAutoApprove(PIPELINE_ID, true);
        assertTrue(hook.autoApprove(PIPELINE_ID));

        vm.prank(alice);
        hook.setAutoApprove(PIPELINE_ID, false);
        assertFalse(hook.autoApprove(PIPELINE_ID));
    }

    function test_setAutoApprove_revertNotClient() public {
        vm.prank(address(orch));
        hook.setPipelineClient(PIPELINE_ID, alice);

        vm.prank(bob);
        vm.expectRevert(CommerceHook.OnlyPipelineClient.selector);
        hook.setAutoApprove(PIPELINE_ID, true);
    }

    // ==================== afterAction (auto-approve on submit) ====================

    function test_afterAction_autoApprove_onSubmit() public {
        // Create job in ACP
        vm.prank(alice);
        uint256 jobId = acp.createJob(bob, address(hook), block.timestamp + 1 days, "test", address(hook));

        // Register in hook
        vm.prank(address(orch));
        hook.registerPipelineJob(PIPELINE_ID, STAGE_INDEX, jobId, bobAgentId, aliceAgentId);
        vm.prank(address(orch));
        hook.setPipelineClient(PIPELINE_ID, alice);

        // Enable auto-approve
        vm.prank(alice);
        hook.setAutoApprove(PIPELINE_ID, true);

        // Set status to Submitted (simulating what ACP does before calling afterAction)
        acp.mockSetStatus(jobId, IAgenticCommerce.JobStatus.Submitted);

        // ACP calls afterAction with the submit selector
        bytes4 submitSelector = IAgenticCommerce.submit.selector;
        vm.prank(address(acp));
        hook.afterAction(jobId, submitSelector, "");

        // Verify auto-completion happened
        assertTrue(acp.isCompleted(jobId));
        assertEq(orch.lastCompletedPipeline(), PIPELINE_ID);
        assertEq(orch.lastCompletedStage(), STAGE_INDEX);
    }

    function test_afterAction_noAutoApprove_doesNotComplete() public {
        // Create job in ACP
        vm.prank(alice);
        uint256 jobId = acp.createJob(bob, address(hook), block.timestamp + 1 days, "test", address(hook));

        // Register in hook (auto-approve NOT enabled)
        vm.prank(address(orch));
        hook.registerPipelineJob(PIPELINE_ID, STAGE_INDEX, jobId, bobAgentId, aliceAgentId);
        vm.prank(address(orch));
        hook.setPipelineClient(PIPELINE_ID, alice);

        acp.mockSetStatus(jobId, IAgenticCommerce.JobStatus.Submitted);

        // ACP calls afterAction
        bytes4 submitSelector = IAgenticCommerce.submit.selector;
        vm.prank(address(acp));
        hook.afterAction(jobId, submitSelector, "");

        // Should NOT have been completed
        assertFalse(acp.isCompleted(jobId));
    }

    function test_afterAction_revertNotACP() public {
        vm.prank(alice);
        vm.expectRevert(CommerceHook.OnlyACP.selector);
        hook.afterAction(1, bytes4(0), "");
    }

    // ==================== beforeAction ====================

    function test_beforeAction_noop() public {
        // Should not revert when called by ACP
        vm.prank(address(acp));
        hook.beforeAction(1, bytes4(0), "");
    }

    function test_beforeAction_revertNotACP() public {
        vm.prank(alice);
        vm.expectRevert(CommerceHook.OnlyACP.selector);
        hook.beforeAction(1, bytes4(0), "");
    }
}
