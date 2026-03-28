// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IUSDC} from "./interfaces/IUSDC.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004Reputation.sol";
import {SpendingPolicy} from "./SpendingPolicy.sol";
import {ServiceMarket} from "./ServiceMarket.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title ServiceEscrow
/// @notice Core economic primitive for AI agent commerce on Arc
contract ServiceEscrow is Initializable, UUPSUpgradeable, PausableUpgradeable, Ownable2StepUpgradeable {
    enum Status {
        Active,
        Completed,
        Disputed,
        Expired,
        Resolved
    }

    struct Agreement {
        address client;
        address provider;
        uint256 providerAgentId;
        uint256 clientAgentId;
        uint256 amount;
        uint256 deadline;
        bytes32 taskHash;
        uint256 serviceId;
        Status status;
        uint256 disputeDeadline;
    }

    uint256 public constant DISPUTE_TIMEOUT = 30 days;

    IUSDC public usdc;
    IERC8004Identity public identityRegistry;
    IERC8004Reputation public reputationRegistry;
    SpendingPolicy public spendingPolicy;
    ServiceMarket public serviceMarket;

    address public feeRecipient;
    uint256 public feeBps;
    uint256 public constant MAX_FEE_BPS = 100;
    uint256 public totalFeesCollected;

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;
    mapping(address => uint256[]) internal _clientAgreements;
    mapping(address => uint256[]) internal _providerAgreements;

    uint256[38] private __gap;

    event AgreementCreated(
        uint256 indexed agreementId, address indexed client, address indexed provider, uint256 amount, uint256 deadline
    );
    event AgreementCompleted(uint256 indexed agreementId, uint256 payout, uint256 fee);
    event AgreementDisputed(uint256 indexed agreementId, address disputedBy);
    event AgreementExpired(uint256 indexed agreementId);
    event AgreementResolved(uint256 indexed agreementId, uint256 clientRefund, uint256 providerPayout);
    event DisputeAutoResolved(uint256 indexed agreementId);
    event FeeUpdated(uint256 newFeeBps);
    event FeeRecipientUpdated(address newRecipient);
    event ReputationRecordFailed(uint256 indexed agreementId, uint256 agentId, string reason);

    error InvalidAmount();
    error InvalidDeadline();
    error NotClient();
    error NotProvider();
    error WrongStatus(Status expected, Status actual);
    error DeadlineNotReached();
    error ProviderNotRegistered();
    error FeeTooHigh();
    error TransferFailed();
    error NotAgentOwner();
    error DisputeNotExpired();
    error ServiceNotActive();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _identityRegistry,
        address _reputationRegistry,
        address _spendingPolicy,
        address _serviceMarket,
        address _owner
    ) external initializer {
        if (_usdc == address(0) || _identityRegistry == address(0) || _reputationRegistry == address(0)
            || _spendingPolicy == address(0) || _serviceMarket == address(0) || _owner == address(0))
            revert ZeroAddress();
        __Pausable_init();
        __Ownable_init(_owner);
        __Ownable2Step_init();

        usdc = IUSDC(_usdc);
        identityRegistry = IERC8004Identity(_identityRegistry);
        reputationRegistry = IERC8004Reputation(_reputationRegistry);
        spendingPolicy = SpendingPolicy(_spendingPolicy);
        serviceMarket = ServiceMarket(_serviceMarket);
        feeRecipient = _owner;
        feeBps = 10;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function createAgreement(
        address provider,
        uint256 providerAgentId,
        uint256 clientAgentId,
        uint256 amount,
        uint256 deadline,
        bytes32 taskHash,
        uint256 serviceId
    ) external whenNotPaused returns (uint256 agreementId) {
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (identityRegistry.ownerOf(providerAgentId) == address(0)) revert ProviderNotRegistered();

        // Validate service exists and is active (serviceId 0 = off-market, skip check)
        if (serviceId > 0) {
            (,,,,, bool active) = serviceMarket.services(serviceId);
            if (!active) revert ServiceNotActive();
        }

        if (clientAgentId > 0) {
            if (identityRegistry.ownerOf(clientAgentId) != msg.sender) revert NotAgentOwner();
            spendingPolicy.checkPolicy(msg.sender, amount, provider);
        }

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        agreementId = nextAgreementId++;
        agreements[agreementId] = Agreement({
            client: msg.sender,
            provider: provider,
            providerAgentId: providerAgentId,
            clientAgentId: clientAgentId,
            amount: amount,
            deadline: deadline,
            taskHash: taskHash,
            serviceId: serviceId,
            status: Status.Active,
            disputeDeadline: 0
        });

        _clientAgreements[msg.sender].push(agreementId);
        _providerAgreements[provider].push(agreementId);

        emit AgreementCreated(agreementId, msg.sender, provider, amount, deadline);
    }

    function confirmCompletion(uint256 agreementId) external whenNotPaused {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Active) revert WrongStatus(Status.Active, agr.status);
        if (msg.sender != agr.client) revert NotClient();

        agr.status = Status.Completed;

        uint256 fee = (agr.amount * feeBps) / 10000;
        uint256 payout = agr.amount - fee;

        if (!usdc.transfer(agr.provider, payout)) revert TransferFailed();
        if (fee > 0) {
            if (!usdc.transfer(feeRecipient, fee)) revert TransferFailed();
            totalFeesCollected += fee;
        }

        _tryRecordReputation(agreementId, agr.providerAgentId, 100, "task_completed");

        emit AgreementCompleted(agreementId, payout, fee);
    }

    function dispute(uint256 agreementId) external {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Active) revert WrongStatus(Status.Active, agr.status);
        if (msg.sender != agr.client && msg.sender != agr.provider) revert NotClient();

        agr.status = Status.Disputed;
        agr.disputeDeadline = block.timestamp + DISPUTE_TIMEOUT;
        emit AgreementDisputed(agreementId, msg.sender);
    }

    function resolveDispute(uint256 agreementId, uint256 clientPct) external onlyOwner {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Disputed) revert WrongStatus(Status.Disputed, agr.status);
        require(clientPct <= 100, "invalid pct");

        agr.status = Status.Resolved;

        uint256 clientRefund = (agr.amount * clientPct) / 100;
        uint256 providerPayout = agr.amount - clientRefund;

        if (clientRefund > 0) {
            if (!usdc.transfer(agr.client, clientRefund)) revert TransferFailed();
        }
        if (providerPayout > 0) {
            if (!usdc.transfer(agr.provider, providerPayout)) revert TransferFailed();
        }

        if (clientPct > 50) {
            _tryRecordReputation(agreementId, agr.providerAgentId, -50, "dispute_lost");
        }

        emit AgreementResolved(agreementId, clientRefund, providerPayout);
    }

    /// @notice Auto-refund client if dispute is not resolved within DISPUTE_TIMEOUT
    function resolveExpiredDispute(uint256 agreementId) external {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Disputed) revert WrongStatus(Status.Disputed, agr.status);
        if (block.timestamp < agr.disputeDeadline) revert DisputeNotExpired();

        agr.status = Status.Resolved;
        if (!usdc.transfer(agr.client, agr.amount)) revert TransferFailed();

        emit DisputeAutoResolved(agreementId);
        emit AgreementResolved(agreementId, agr.amount, 0);
    }

    function claimExpired(uint256 agreementId) external {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Active) revert WrongStatus(Status.Active, agr.status);
        if (block.timestamp < agr.deadline) revert DeadlineNotReached();

        agr.status = Status.Expired;
        if (!usdc.transfer(agr.client, agr.amount)) revert TransferFailed();

        _tryRecordReputation(agreementId, agr.providerAgentId, -30, "deadline_missed");

        emit AgreementExpired(agreementId);
    }

    function _tryRecordReputation(uint256 agreementId, uint256 agentId, int128 score, string memory tag) internal {
        bytes32 feedbackHash = keccak256(abi.encodePacked(tag, agreementId));
        try reputationRegistry.giveFeedback(agentId, score, 0, tag, "", "", "", feedbackHash) {}
        catch (bytes memory reason) {
            emit ReputationRecordFailed(agreementId, agentId, string(reason));
        }
    }

    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        return agreements[agreementId];
    }

    function getClientAgreements(address client) external view returns (uint256[] memory) {
        return _clientAgreements[client];
    }

    function getProviderAgreements(address provider) external view returns (uint256[] memory) {
        return _providerAgreements[provider];
    }

    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }
}
