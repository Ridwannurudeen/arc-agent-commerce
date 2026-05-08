// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {CommerceHook} from "./CommerceHook.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title PipelineOrchestrator
/// @notice Chains multiple ERC-8183 jobs into conditional multi-stage workflows
///         with atomic funding and partial refunds.
contract PipelineOrchestrator is Initializable, UUPSUpgradeable, PausableUpgradeable, Ownable2StepUpgradeable {
    using SafeERC20 for IERC20;

    // ---- Errors ----
    error NoStages();
    error DeadlineInPast();
    error NotAgentOwner();
    error NotPipelineClient();
    error NotCommerceHook();
    error PipelineNotActive();
    error WrongStage();
    error UnsupportedCurrency();

    // ---- Events ----
    event PipelineCreated(
        uint256 indexed pipelineId,
        uint256 indexed clientAgentId,
        uint256 stageCount,
        uint256 totalBudget,
        address currency
    );
    event StageActivated(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId);
    event PipelineCompleted(uint256 indexed pipelineId, uint256 totalSpent);
    event PipelineHalted(uint256 indexed pipelineId, uint256 failedStage, uint256 refundAmount);
    event PipelineCancelled(uint256 indexed pipelineId, uint256 refundAmount);

    // ---- Types ----
    enum StageStatus {
        Pending,
        Active,
        Completed,
        Failed
    }
    enum PipelineStatus {
        Active,
        Completed,
        Halted,
        Cancelled
    }

    struct StageParam {
        uint256 providerAgentId;
        address providerAddress;
        bytes32 capabilityHash;
        uint256 budget;
    }

    struct Stage {
        uint256 providerAgentId;
        address providerAddress;
        bytes32 capabilityHash;
        uint256 budget;
        uint256 jobId;
        StageStatus status;
    }

    struct Pipeline {
        uint256 clientAgentId;
        address client;
        address currency;
        uint256 totalBudget;
        uint256 totalSpent;
        uint256 currentStage;
        uint256 stageCount;
        PipelineStatus status;
        uint256 createdAt;
        uint256 deadline;
    }

    // ---- State ----
    IAgenticCommerce public acp;
    IERC20 public usdc;
    IERC8004Identity public identityRegistry;
    CommerceHook public commerceHook;

    mapping(address => bool) public supportedCurrencies;
    mapping(uint256 => Pipeline) public pipelines;
    mapping(uint256 => mapping(uint256 => Stage)) public stages;
    mapping(address => uint256[]) internal _clientPipelines;
    uint256 public nextPipelineId;

    uint256[40] private __gap;

    // ---- Modifiers ----

    modifier onlyCommerceHook() {
        if (msg.sender != address(commerceHook)) revert NotCommerceHook();
        _;
    }

    // ---- Constructor ----

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ---- Initializer ----

    function initialize(address acp_, address usdc_, address identityRegistry_, address commerceHook_, address owner_)
        external
        initializer
    {
        __Pausable_init();
        __Ownable_init(owner_);
        __Ownable2Step_init();

        acp = IAgenticCommerce(acp_);
        usdc = IERC20(usdc_);
        identityRegistry = IERC8004Identity(identityRegistry_);
        commerceHook = CommerceHook(commerceHook_);

        supportedCurrencies[usdc_] = true;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ---- Admin ----

    /// @notice Add a supported currency (e.g. EURC)
    function addSupportedCurrency(address currency) external onlyOwner {
        supportedCurrencies[currency] = true;
    }

    /// @notice Pause all pipeline creation and stage transitions
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---- Core ----

    /// @notice Create a multi-stage pipeline with atomic funding
    /// @param clientAgentId ERC-8004 agent ID of the client
    /// @param stageParams Array of stage definitions (provider, capability, budget)
    /// @param currency Payment token address (must be supported)
    /// @param deadline Pipeline deadline timestamp
    /// @return pipelineId The ID of the newly created pipeline
    function createPipeline(
        uint256 clientAgentId,
        StageParam[] calldata stageParams,
        address currency,
        uint256 deadline
    ) external whenNotPaused returns (uint256 pipelineId) {
        if (stageParams.length == 0) revert NoStages();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (!supportedCurrencies[currency]) revert UnsupportedCurrency();
        if (identityRegistry.ownerOf(clientAgentId) != msg.sender) revert NotAgentOwner();

        // Sum total budget
        uint256 totalBudget;
        for (uint256 i; i < stageParams.length; i++) {
            totalBudget += stageParams[i].budget;
        }

        // Pull total budget from client
        IERC20(currency).safeTransferFrom(msg.sender, address(this), totalBudget);

        // Store pipeline
        pipelineId = nextPipelineId++;
        Pipeline storage p = pipelines[pipelineId];
        p.clientAgentId = clientAgentId;
        p.client = msg.sender;
        p.currency = currency;
        p.totalBudget = totalBudget;
        p.stageCount = stageParams.length;
        p.status = PipelineStatus.Active;
        p.createdAt = block.timestamp;
        p.deadline = deadline;

        // Store stages
        for (uint256 i; i < stageParams.length; i++) {
            stages[pipelineId][i] = Stage({
                providerAgentId: stageParams[i].providerAgentId,
                providerAddress: stageParams[i].providerAddress,
                capabilityHash: stageParams[i].capabilityHash,
                budget: stageParams[i].budget,
                jobId: 0,
                status: StageStatus.Pending
            });
        }

        // Track client pipelines
        _clientPipelines[msg.sender].push(pipelineId);

        // Register pipeline client on hook
        commerceHook.setPipelineClient(pipelineId, msg.sender);

        // Activate first stage
        _activateStage(pipelineId, 0);

        emit PipelineCreated(pipelineId, clientAgentId, stageParams.length, totalBudget, currency);
    }

    /// @notice Called by CommerceHook when a stage is evaluated as complete
    /// @param pipelineId The pipeline ID
    /// @param stageIndex The index of the completed stage
    function onStageCompleted(uint256 pipelineId, uint256 stageIndex) external onlyCommerceHook {
        Pipeline storage p = pipelines[pipelineId];
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();
        if (stageIndex != p.currentStage) revert WrongStage();

        Stage storage s = stages[pipelineId][stageIndex];
        s.status = StageStatus.Completed;
        p.totalSpent += s.budget;

        uint256 nextStage = stageIndex + 1;
        if (nextStage < p.stageCount) {
            // Advance to next stage
            p.currentStage = nextStage;
            _activateStage(pipelineId, nextStage);
        } else {
            // Last stage completed — finalize pipeline
            p.status = PipelineStatus.Completed;

            // Refund any dust (totalBudget - totalSpent)
            uint256 dust = p.totalBudget - p.totalSpent;
            if (dust > 0) {
                IERC20(p.currency).safeTransfer(p.client, dust);
            }

            emit PipelineCompleted(pipelineId, p.totalSpent);
        }
    }

    /// @notice Called by CommerceHook when a stage is rejected
    /// @param pipelineId The pipeline ID
    /// @param stageIndex The index of the rejected stage
    function onStageRejected(uint256 pipelineId, uint256 stageIndex) external onlyCommerceHook {
        Pipeline storage p = pipelines[pipelineId];
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();

        // Mark current stage as Failed
        stages[pipelineId][stageIndex].status = StageStatus.Failed;
        p.status = PipelineStatus.Halted;

        // Sum budgets of unstarted stages (stageIndex+1 to end) and mark them Failed
        uint256 refundAmount;
        for (uint256 i = stageIndex + 1; i < p.stageCount; i++) {
            refundAmount += stages[pipelineId][i].budget;
            stages[pipelineId][i].status = StageStatus.Failed;
        }

        // Refund unstarted stage budgets to client
        if (refundAmount > 0) {
            IERC20(p.currency).safeTransfer(p.client, refundAmount);
        }

        emit PipelineHalted(pipelineId, stageIndex, refundAmount);
    }

    /// @notice Cancel an active pipeline — only the pipeline client can call
    /// @param pipelineId The pipeline ID to cancel
    function cancelPipeline(uint256 pipelineId) external {
        Pipeline storage p = pipelines[pipelineId];
        if (msg.sender != p.client) revert NotPipelineClient();
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();

        p.status = PipelineStatus.Cancelled;

        // Mark remaining stages as Failed
        for (uint256 i; i < p.stageCount; i++) {
            if (stages[pipelineId][i].status != StageStatus.Completed) {
                stages[pipelineId][i].status = StageStatus.Failed;
            }
        }

        // Refund unspent budget
        uint256 refundAmount = p.totalBudget - p.totalSpent;
        if (refundAmount > 0) {
            IERC20(p.currency).safeTransfer(p.client, refundAmount);
        }

        emit PipelineCancelled(pipelineId, refundAmount);
    }

    /// @notice Fund the active stage's ACP job after the provider sets a budget.
    ///         The orchestrator is the ACP job client and must call fund().
    /// @param pipelineId The pipeline ID whose active stage to fund
    function fundStage(uint256 pipelineId) external {
        Pipeline storage p = pipelines[pipelineId];
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();
        Stage storage s = stages[pipelineId][p.currentStage];
        acp.fund(s.jobId, "");
    }

    // ---- View ----

    /// @notice Get all stages for a pipeline
    /// @param pipelineId The pipeline ID
    /// @return stageList Array of Stage structs
    function getStages(uint256 pipelineId) external view returns (Stage[] memory stageList) {
        uint256 count = pipelines[pipelineId].stageCount;
        stageList = new Stage[](count);
        for (uint256 i; i < count; i++) {
            stageList[i] = stages[pipelineId][i];
        }
    }

    /// @notice Get all pipeline IDs for a client address
    /// @param client The client address
    /// @return Array of pipeline IDs
    function getClientPipelines(address client) external view returns (uint256[] memory) {
        return _clientPipelines[client];
    }

    // ---- Internal ----

    function _activateStage(uint256 pipelineId, uint256 stageIndex) internal {
        Stage storage s = stages[pipelineId][stageIndex];
        Pipeline storage p = pipelines[pipelineId];

        // Approve ACP to pull funds for this stage
        IERC20(p.currency).approve(address(acp), s.budget);

        // Create an ERC-8183 job on ACP
        // Hook is address(0) because ACP whitelists hooks — CommerceHook
        // serves as evaluator (can call complete/reject) which doesn't
        // require whitelisting. Auto-approve via afterAction callback is
        // not available; use approveStage() for manual approval.
        uint256 jobId = acp.createJob(
            s.providerAddress,
            address(commerceHook), // evaluator
            p.deadline,
            "", // description
            address(0) // hook (ACP requires whitelist)
        );

        s.jobId = jobId;
        s.status = StageStatus.Active;

        // Register the job in the hook
        commerceHook.registerPipelineJob(pipelineId, stageIndex, jobId, s.providerAgentId, p.clientAgentId);

        emit StageActivated(pipelineId, stageIndex, jobId);
    }
}
