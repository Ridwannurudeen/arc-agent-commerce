// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title AgentPolicy
/// @notice Multi-currency aware spending guardrails for agent pipelines
/// @dev Called by PipelineOrchestrator to enforce per-stage and per-pipeline budgets
contract AgentPolicy is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    error ExceedsPerTxLimit();
    error ExceedsDailyLimit();
    error CounterpartyNotAllowed();
    error NotPolicyOwner();
    error OnlyOrchestrator();

    event PolicySet(address indexed agent, uint256 maxPerTx, uint256 maxDaily);
    event CounterpartyRestrictionSet(address indexed agent, bool restricted);
    event CounterpartyAllowed(address indexed agent, address indexed counterparty, bool allowed);

    struct Policy {
        uint256 maxPerTx;
        uint256 maxDaily;
        uint256 dailySpent;
        uint256 dayStart;
        bool exists;
    }

    IERC8004Identity public identityRegistry;
    address public orchestrator;
    mapping(address => Policy) public policies;
    mapping(address => address) public policyOwners;
    mapping(address => bool) public counterpartyRestricted;
    mapping(address => mapping(address => bool)) public allowedCounterparties;

    uint256[43] private __gap;

    modifier onlyPolicyOwner(address agent) {
        if (policyOwners[agent] != address(0) && policyOwners[agent] != msg.sender) {
            revert NotPolicyOwner();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address identityRegistry_, address owner_) external initializer {
        __Ownable_init(owner_);
        __Ownable2Step_init();
        identityRegistry = IERC8004Identity(identityRegistry_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Set the orchestrator address (PipelineOrchestrator)
    /// @param _orchestrator Address of the orchestrator contract
    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
    }

    /// @notice Set a spending policy for an agent
    /// @param agent Agent address to set policy for
    /// @param maxPerTx Maximum amount per single transaction
    /// @param maxDaily Maximum cumulative amount per day
    function setPolicy(address agent, uint256 maxPerTx, uint256 maxDaily) external {
        policyOwners[agent] = msg.sender;
        Policy storage p = policies[agent];
        p.maxPerTx = maxPerTx;
        p.maxDaily = maxDaily;
        p.dailySpent = 0;
        p.dayStart = _dayStart();
        p.exists = true;
        emit PolicySet(agent, maxPerTx, maxDaily);
    }

    /// @notice Enable or disable counterparty restriction for an agent
    /// @param agent Agent address
    /// @param restricted Whether to restrict counterparties
    function setCounterpartyRestriction(address agent, bool restricted) external onlyPolicyOwner(agent) {
        counterpartyRestricted[agent] = restricted;
        emit CounterpartyRestrictionSet(agent, restricted);
    }

    /// @notice Add or remove an allowed counterparty for an agent
    /// @param agent Agent address
    /// @param counterparty Counterparty address to allow or disallow
    /// @param allowed Whether the counterparty is allowed
    function setAllowedCounterparty(address agent, address counterparty, bool allowed) external onlyPolicyOwner(agent) {
        allowedCounterparties[agent][counterparty] = allowed;
        emit CounterpartyAllowed(agent, counterparty, allowed);
    }

    /// @notice Check and enforce stage budget — called by orchestrator before each pipeline stage
    /// @dev Reverts if the spend violates policy; updates dailySpent on success
    /// @param agent Agent address
    /// @param amount Amount being spent
    /// @param counterparty Counterparty in the transaction
    /// @return True if no policy exists or all checks pass
    function checkStageBudget(address agent, uint256 amount, address counterparty) external returns (bool) {
        if (msg.sender != orchestrator) revert OnlyOrchestrator();

        Policy storage p = policies[agent];
        if (!p.exists) return true;

        if (p.maxPerTx > 0 && amount > p.maxPerTx) revert ExceedsPerTxLimit();

        uint256 today = _dayStart();
        if (p.dayStart < today) {
            p.dailySpent = 0;
            p.dayStart = today;
        }

        if (p.maxDaily > 0 && p.dailySpent + amount > p.maxDaily) revert ExceedsDailyLimit();

        if (counterpartyRestricted[agent] && !allowedCounterparties[agent][counterparty]) {
            revert CounterpartyNotAllowed();
        }

        p.dailySpent += amount;
        return true;
    }

    /// @notice Read-only check whether a pipeline's total budget fits within daily limits
    /// @dev Reverts if exceeds daily limit; does NOT update dailySpent
    /// @param agent Agent address
    /// @param totalBudget Total pipeline budget to check
    /// @return True if the pipeline budget is within daily remaining allowance
    function checkPipelineBudget(address agent, uint256 totalBudget) external view returns (bool) {
        Policy memory p = policies[agent];
        if (!p.exists) return true;

        uint256 today = _dayStart();
        uint256 spent = p.dayStart < today ? 0 : p.dailySpent;

        if (p.maxDaily > 0 && spent + totalBudget > p.maxDaily) revert ExceedsDailyLimit();

        return true;
    }

    /// @notice Simulate whether a spend would pass without reverting
    /// @param agent Agent address
    /// @param amount Amount to check
    /// @param counterparty Counterparty address
    /// @return True if the spend would pass, false otherwise
    function wouldPass(address agent, uint256 amount, address counterparty) external view returns (bool) {
        Policy memory p = policies[agent];
        if (!p.exists) return true;

        if (p.maxPerTx > 0 && amount > p.maxPerTx) return false;

        uint256 today = _dayStart();
        uint256 spent = p.dayStart < today ? 0 : p.dailySpent;

        if (p.maxDaily > 0 && spent + amount > p.maxDaily) return false;

        if (counterpartyRestricted[agent] && !allowedCounterparties[agent][counterparty]) return false;

        return true;
    }

    /// @notice Get remaining daily allowance for an agent
    /// @param agent Agent address
    /// @return Remaining daily allowance (type(uint256).max if no policy)
    function dailyRemaining(address agent) external view returns (uint256) {
        Policy memory p = policies[agent];
        if (!p.exists || p.maxDaily == 0) return type(uint256).max;

        uint256 today = _dayStart();
        uint256 spent = p.dayStart < today ? 0 : p.dailySpent;

        if (spent >= p.maxDaily) return 0;
        return p.maxDaily - spent;
    }

    /// @dev Returns the start of the current day (UTC midnight)
    function _dayStart() internal view returns (uint256) {
        return (block.timestamp / 1 days) * 1 days;
    }
}
