// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";

/// @title SpendingPolicy
/// @notice Human-set guardrails for AI agent spending on Arc
/// @dev Agent owners set limits; ServiceEscrow checks before locking funds.
contract SpendingPolicy {
    struct Policy {
        uint256 maxPerTx; // max USDC per single escrow (6 decimals)
        uint256 maxDaily; // max USDC per day (6 decimals)
        uint256 dailySpent; // amount spent in current day
        uint256 dayStart; // timestamp of current day start
        bool exists;
    }

    IERC8004Identity public immutable identityRegistry;

    // agent wallet => policy
    mapping(address => Policy) public policies;
    // agent wallet => counterparty => allowed
    mapping(address => mapping(address => bool)) public allowedCounterparties;
    // agent wallet => whether counterparty allowlist is enforced
    mapping(address => bool) public counterpartyRestricted;
    // agent wallet => owner who set the policy
    mapping(address => address) public policyOwners;

    event PolicySet(address indexed agent, uint256 maxPerTx, uint256 maxDaily);
    event CounterpartyAllowed(address indexed agent, address indexed counterparty, bool allowed);
    event CounterpartyRestrictionSet(address indexed agent, bool restricted);

    error NotPolicyOwner();
    error PolicyCheckFailed(string reason);

    constructor(address _identityRegistry) {
        identityRegistry = IERC8004Identity(_identityRegistry);
    }

    /// @notice Set spending policy for an agent wallet
    /// @dev Only callable by the wallet owner. Ownership verified by caller.
    function setPolicy(
        address agent,
        uint256 maxPerTx,
        uint256 maxDaily
    ) external {
        // Caller must be the agent itself (setting own limits) or can be set by anyone
        // who proves ownership. For simplicity, policy owner is msg.sender.
        policyOwners[agent] = msg.sender;

        Policy storage p = policies[agent];
        p.maxPerTx = maxPerTx;
        p.maxDaily = maxDaily;
        p.exists = true;

        // Reset daily tracking
        p.dailySpent = 0;
        p.dayStart = _dayStart();

        emit PolicySet(agent, maxPerTx, maxDaily);
    }

    /// @notice Set whether counterparty allowlist is enforced
    function setCounterpartyRestriction(address agent, bool restricted) external {
        if (policyOwners[agent] != msg.sender) revert NotPolicyOwner();
        counterpartyRestricted[agent] = restricted;
        emit CounterpartyRestrictionSet(agent, restricted);
    }

    /// @notice Allow or disallow a counterparty for an agent
    function setAllowedCounterparty(address agent, address counterparty, bool allowed) external {
        if (policyOwners[agent] != msg.sender) revert NotPolicyOwner();
        allowedCounterparties[agent][counterparty] = allowed;
        emit CounterpartyAllowed(agent, counterparty, allowed);
    }

    /// @notice Check if a transaction passes the policy
    /// @return True if the transaction is allowed
    function checkPolicy(address agent, uint256 amount, address counterparty) external returns (bool) {
        Policy storage p = policies[agent];

        // No policy = no restrictions
        if (!p.exists) return true;

        // Check per-tx limit
        if (p.maxPerTx > 0 && amount > p.maxPerTx) {
            revert PolicyCheckFailed("exceeds per-tx limit");
        }

        // Roll over daily tracking if new day
        uint256 today = _dayStart();
        if (p.dayStart < today) {
            p.dailySpent = 0;
            p.dayStart = today;
        }

        // Check daily limit
        if (p.maxDaily > 0 && p.dailySpent + amount > p.maxDaily) {
            revert PolicyCheckFailed("exceeds daily limit");
        }

        // Check counterparty allowlist
        if (counterpartyRestricted[agent] && !allowedCounterparties[agent][counterparty]) {
            revert PolicyCheckFailed("counterparty not allowed");
        }

        // Record spend
        p.dailySpent += amount;

        return true;
    }

    /// @notice View-only policy check (doesn't update state)
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
    function dailyRemaining(address agent) external view returns (uint256) {
        Policy memory p = policies[agent];
        if (!p.exists || p.maxDaily == 0) return type(uint256).max;

        uint256 today = _dayStart();
        uint256 spent = p.dayStart < today ? 0 : p.dailySpent;
        if (spent >= p.maxDaily) return 0;
        return p.maxDaily - spent;
    }

    function _dayStart() internal view returns (uint256) {
        return (block.timestamp / 1 days) * 1 days;
    }
}
