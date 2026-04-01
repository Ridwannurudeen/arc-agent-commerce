// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IACPHook} from "./interfaces/IACPHook.sol";
import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004Reputation.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @title CommerceHook
/// @notice Bridge between ERC-8183 ACP jobs and pipeline orchestration.
///         Implements IACPHook callbacks and acts as evaluator that calls
///         complete()/reject() on the ACP contract.
contract CommerceHook is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable, ERC165 {
    // ---- Errors ----
    error OnlyOrchestrator();
    error OnlyPipelineClient();
    error OnlyACP();
    error JobNotRegistered();
    error JobNotSubmitted();

    // ---- Events ----
    event PipelineJobRegistered(uint256 indexed pipelineId, uint256 indexed stageIndex, uint256 indexed jobId);
    event StageApproved(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId);
    event StageRejected(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId, string reason);
    event StageAutoApproved(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId);
    event ReputationRecordFailed(uint256 indexed jobId, uint256 indexed agentId, string reason);
    event AutoApproveSet(uint256 indexed pipelineId, bool enabled);

    // ---- Types ----
    struct JobInfo {
        uint256 pipelineId;
        uint256 stageIndex;
        uint256 providerAgentId;
        uint256 clientAgentId;
        bool exists;
    }

    // ---- State ----
    IAgenticCommerce public acp;
    IERC8004Identity public identityRegistry;
    IERC8004Reputation public reputationRegistry;
    address public orchestrator;

    mapping(uint256 => JobInfo) public jobRegistry;
    mapping(uint256 => bool) public autoApprove;
    mapping(uint256 => address) public pipelineClients;

    uint256[40] private __gap;

    // ---- Modifiers ----

    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert OnlyOrchestrator();
        _;
    }

    modifier onlyACP() {
        if (msg.sender != address(acp)) revert OnlyACP();
        _;
    }

    // ---- Constructor ----

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ---- Initializer ----

    function initialize(address acp_, address identityRegistry_, address reputationRegistry_, address owner_)
        external
        initializer
    {
        __Ownable_init(owner_);
        __Ownable2Step_init();

        acp = IAgenticCommerce(acp_);
        identityRegistry = IERC8004Identity(identityRegistry_);
        reputationRegistry = IERC8004Reputation(reputationRegistry_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ---- Admin ----

    function setOrchestrator(address orchestrator_) external onlyOwner {
        orchestrator = orchestrator_;
    }

    // ---- Orchestrator functions ----

    function registerPipelineJob(
        uint256 pipelineId,
        uint256 stageIndex,
        uint256 jobId,
        uint256 providerAgentId,
        uint256 clientAgentId
    ) external onlyOrchestrator {
        jobRegistry[jobId] = JobInfo({
            pipelineId: pipelineId,
            stageIndex: stageIndex,
            providerAgentId: providerAgentId,
            clientAgentId: clientAgentId,
            exists: true
        });
        emit PipelineJobRegistered(pipelineId, stageIndex, jobId);
    }

    function setPipelineClient(uint256 pipelineId, address client) external onlyOrchestrator {
        pipelineClients[pipelineId] = client;
    }

    // ---- Pipeline client functions ----

    function setAutoApprove(uint256 pipelineId, bool enabled) external {
        if (msg.sender != pipelineClients[pipelineId]) revert OnlyPipelineClient();
        autoApprove[pipelineId] = enabled;
        emit AutoApproveSet(pipelineId, enabled);
    }

    function approveStage(uint256 jobId) external {
        JobInfo memory info = jobRegistry[jobId];
        if (!info.exists) revert JobNotRegistered();
        if (msg.sender != pipelineClients[info.pipelineId]) revert OnlyPipelineClient();

        // Verify the job is in Submitted status
        IAgenticCommerce.Job memory job = acp.getJob(jobId);
        if (job.status != IAgenticCommerce.JobStatus.Submitted) revert JobNotSubmitted();

        _completeAndAdvance(jobId, info);
    }

    function rejectStage(uint256 jobId, string calldata reason) external {
        JobInfo memory info = jobRegistry[jobId];
        if (!info.exists) revert JobNotRegistered();
        if (msg.sender != pipelineClients[info.pipelineId]) revert OnlyPipelineClient();

        // Reject the ACP job
        acp.reject(jobId, keccak256(bytes(reason)), "");

        // Record negative reputation
        _tryRecordReputation(jobId, info.providerAgentId, -50, "delivery_rejected");

        // Notify orchestrator
        IPipelineOrchestrator(orchestrator).onStageRejected(info.pipelineId, info.stageIndex);

        emit StageRejected(info.pipelineId, info.stageIndex, jobId, reason);
    }

    // ---- IACPHook callbacks ----

    function beforeAction(uint256, bytes4, bytes calldata) external onlyACP {
        // No-op — required by IACPHook but nothing to validate before actions
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external onlyACP {
        JobInfo memory info = jobRegistry[jobId];
        if (!info.exists) return;

        // Auto-approve on submit if enabled
        if (selector == IAgenticCommerce.submit.selector && autoApprove[info.pipelineId]) {
            _completeAndAdvance(jobId, info);
            emit StageAutoApproved(info.pipelineId, info.stageIndex, jobId);
        }
    }

    // ---- ERC165 ----

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || super.supportsInterface(interfaceId);
    }

    // ---- Internal ----

    function _completeAndAdvance(uint256 jobId, JobInfo memory info) internal {
        // Complete the ACP job
        acp.complete(jobId, keccak256("approved"), "");

        // Try to record positive reputation
        _tryRecordReputation(jobId, info.providerAgentId, 100, "stage_completed");

        emit StageApproved(info.pipelineId, info.stageIndex, jobId);

        // Notify orchestrator
        IPipelineOrchestrator(orchestrator).onStageCompleted(info.pipelineId, info.stageIndex);
    }

    function _tryRecordReputation(uint256 jobId, uint256 agentId, int128 score, string memory tag) internal {
        bytes32 feedbackHash = keccak256(abi.encodePacked(agentId, score, tag));
        try reputationRegistry.giveFeedback(agentId, score, 1, tag, "", "", "", feedbackHash) {}
        catch (bytes memory reason) {
            emit ReputationRecordFailed(jobId, agentId, string(reason));
        }
    }
}

/// @title IPipelineOrchestrator
/// @notice Minimal interface for pipeline stage callbacks
interface IPipelineOrchestrator {
    function onStageCompleted(uint256 pipelineId, uint256 stageIndex) external;
    function onStageRejected(uint256 pipelineId, uint256 stageIndex) external;
}
