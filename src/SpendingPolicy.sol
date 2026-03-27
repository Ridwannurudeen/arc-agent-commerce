// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title SpendingPolicy
/// @notice Human-set guardrails for AI agent spending on Arc
contract SpendingPolicy is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    struct Policy {
        uint256 maxPerTx;
        uint256 maxDaily;
        uint256 dailySpent;
        uint256 dayStart;
        bool exists;
    }

    IERC8004Identity public identityRegistry;

    mapping(address => Policy) public policies;
    mapping(address => mapping(address => bool)) public allowedCounterparties;
    mapping(address => bool) public counterpartyRestricted;
    mapping(address => address) public policyOwners;

    event PolicySet(address indexed agent, uint256 maxPerTx, uint256 maxDaily);
    event CounterpartyAllowed(address indexed agent, address indexed counterparty, bool allowed);
    event CounterpartyRestrictionSet(address indexed agent, bool restricted);

    error NotPolicyOwner();
    error PolicyCheckFailed(string reason);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _identityRegistry, address _owner) external initializer {
        __Ownable_init(_owner);
        __Ownable2Step_init();
        identityRegistry = IERC8004Identity(_identityRegistry);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setPolicy(address agent, uint256 maxPerTx, uint256 maxDaily) external {
        policyOwners[agent] = msg.sender;
        Policy storage p = policies[agent];
        p.maxPerTx = maxPerTx;
        p.maxDaily = maxDaily;
        p.exists = true;
        p.dailySpent = 0;
        p.dayStart = _dayStart();
        emit PolicySet(agent, maxPerTx, maxDaily);
    }

    function setCounterpartyRestriction(address agent, bool restricted) external {
        if (policyOwners[agent] != msg.sender) revert NotPolicyOwner();
        counterpartyRestricted[agent] = restricted;
        emit CounterpartyRestrictionSet(agent, restricted);
    }

    function setAllowedCounterparty(address agent, address counterparty, bool allowed) external {
        if (policyOwners[agent] != msg.sender) revert NotPolicyOwner();
        allowedCounterparties[agent][counterparty] = allowed;
        emit CounterpartyAllowed(agent, counterparty, allowed);
    }

    function checkPolicy(address agent, uint256 amount, address counterparty) external returns (bool) {
        Policy storage p = policies[agent];
        if (!p.exists) return true;
        if (p.maxPerTx > 0 && amount > p.maxPerTx) revert PolicyCheckFailed("exceeds per-tx limit");
        uint256 today = _dayStart();
        if (p.dayStart < today) {
            p.dailySpent = 0;
            p.dayStart = today;
        }
        if (p.maxDaily > 0 && p.dailySpent + amount > p.maxDaily) revert PolicyCheckFailed("exceeds daily limit");
        if (counterpartyRestricted[agent] && !allowedCounterparties[agent][counterparty]) {
            revert PolicyCheckFailed("counterparty not allowed");
        }
        p.dailySpent += amount;
        return true;
    }

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
