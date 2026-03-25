// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IUSDC} from "./interfaces/IUSDC.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004Reputation.sol";
import {SpendingPolicy} from "./SpendingPolicy.sol";
import {ServiceMarket} from "./ServiceMarket.sol";

/// @title ServiceEscrow
/// @notice Core economic primitive for AI agent commerce on Arc
/// @dev Handles USDC escrow for service agreements between agents/humans.
///      Integrates with ERC-8004 for identity verification and reputation recording.
contract ServiceEscrow {
    enum Status {
        Active,
        Completed,
        Disputed,
        Expired,
        Resolved
    }

    struct Agreement {
        address client; // who pays
        address provider; // who delivers
        uint256 providerAgentId; // ERC-8004 agent ID of provider
        uint256 clientAgentId; // ERC-8004 agent ID of client (0 if human)
        uint256 amount; // USDC escrowed (6 decimals)
        uint256 deadline; // must complete by
        bytes32 taskHash; // hash of task specification
        uint256 serviceId; // ServiceMarket service ID (0 if direct)
        Status status;
    }

    IUSDC public immutable usdc;
    IERC8004Identity public immutable identityRegistry;
    IERC8004Reputation public immutable reputationRegistry;
    SpendingPolicy public immutable spendingPolicy;
    ServiceMarket public immutable serviceMarket;

    address public owner;
    address public feeRecipient;
    uint256 public feeBps = 10; // 0.1% = 10 basis points
    uint256 public constant MAX_FEE_BPS = 100; // 1% max
    uint256 public totalFeesCollected;

    uint256 public nextAgreementId;
    mapping(uint256 => Agreement) public agreements;

    // Track active agreements per address for enumeration
    mapping(address => uint256[]) internal _clientAgreements;
    mapping(address => uint256[]) internal _providerAgreements;

    event AgreementCreated(
        uint256 indexed agreementId, address indexed client, address indexed provider, uint256 amount, uint256 deadline
    );
    event AgreementCompleted(uint256 indexed agreementId, uint256 payout, uint256 fee);
    event AgreementDisputed(uint256 indexed agreementId, address disputedBy);
    event AgreementExpired(uint256 indexed agreementId);
    event AgreementResolved(uint256 indexed agreementId, uint256 clientRefund, uint256 providerPayout);
    event FeeUpdated(uint256 newFeeBps);
    event FeeRecipientUpdated(address newRecipient);

    error InvalidAmount();
    error InvalidDeadline();
    error NotClient();
    error NotProvider();
    error NotOwner();
    error WrongStatus(Status expected, Status actual);
    error DeadlineNotReached();
    error ProviderNotRegistered();
    error FeeTooHigh();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address _usdc,
        address _identityRegistry,
        address _reputationRegistry,
        address _spendingPolicy,
        address _serviceMarket
    ) {
        usdc = IUSDC(_usdc);
        identityRegistry = IERC8004Identity(_identityRegistry);
        reputationRegistry = IERC8004Reputation(_reputationRegistry);
        spendingPolicy = SpendingPolicy(_spendingPolicy);
        serviceMarket = ServiceMarket(_serviceMarket);
        owner = msg.sender;
        feeRecipient = msg.sender;
    }

    /// @notice Create a service agreement with USDC escrow
    /// @param provider Address of the service provider
    /// @param providerAgentId ERC-8004 agent ID of the provider
    /// @param clientAgentId ERC-8004 agent ID of the client (0 if human)
    /// @param amount USDC amount to escrow (6 decimals)
    /// @param deadline Timestamp by which service must be completed
    /// @param taskHash Hash of the task specification (for verification)
    /// @param serviceId ServiceMarket listing ID (0 if direct agreement)
    function createAgreement(
        address provider,
        uint256 providerAgentId,
        uint256 clientAgentId,
        uint256 amount,
        uint256 deadline,
        bytes32 taskHash,
        uint256 serviceId
    ) external returns (uint256 agreementId) {
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        // Verify provider agent is registered
        if (identityRegistry.ownerOf(providerAgentId) == address(0)) revert ProviderNotRegistered();

        // Check spending policy if client is an agent
        if (clientAgentId > 0) {
            spendingPolicy.checkPolicy(msg.sender, amount, provider);
        }

        // Transfer USDC from client to this contract
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
            status: Status.Active
        });

        _clientAgreements[msg.sender].push(agreementId);
        _providerAgreements[provider].push(agreementId);

        emit AgreementCreated(agreementId, msg.sender, provider, amount, deadline);
    }

    /// @notice Client confirms task completion, releasing escrowed USDC to provider
    function confirmCompletion(uint256 agreementId) external {
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

        // Record positive reputation for the provider
        bytes32 feedbackHash = keccak256(abi.encodePacked("task_completed", agreementId));
        reputationRegistry.giveFeedback(
            agr.providerAgentId,
            100, // positive score
            0, // category: general
            "task_completed",
            "",
            "",
            "",
            feedbackHash
        );

        emit AgreementCompleted(agreementId, payout, fee);
    }

    /// @notice Either party raises a dispute
    function dispute(uint256 agreementId) external {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Active) revert WrongStatus(Status.Active, agr.status);
        if (msg.sender != agr.client && msg.sender != agr.provider) {
            revert NotClient();
        }

        agr.status = Status.Disputed;
        emit AgreementDisputed(agreementId, msg.sender);
    }

    /// @notice Protocol owner resolves a dispute with a split
    /// @param clientPct Percentage (0-100) of escrowed amount returned to client
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

        // Record dispute on provider reputation
        if (clientPct > 50) {
            bytes32 feedbackHash = keccak256(abi.encodePacked("dispute_lost", agreementId));
            reputationRegistry.giveFeedback(
                agr.providerAgentId,
                -50, // negative score
                0,
                "dispute_lost",
                "",
                "",
                "",
                feedbackHash
            );
        }

        emit AgreementResolved(agreementId, clientRefund, providerPayout);
    }

    /// @notice Claim refund after provider misses deadline
    function claimExpired(uint256 agreementId) external {
        Agreement storage agr = agreements[agreementId];
        if (agr.status != Status.Active) revert WrongStatus(Status.Active, agr.status);
        if (block.timestamp < agr.deadline) revert DeadlineNotReached();

        agr.status = Status.Expired;
        if (!usdc.transfer(agr.client, agr.amount)) revert TransferFailed();

        // Record negative reputation for missing deadline
        bytes32 feedbackHash = keccak256(abi.encodePacked("deadline_missed", agreementId));
        reputationRegistry.giveFeedback(agr.providerAgentId, -30, 0, "deadline_missed", "", "", "", feedbackHash);

        emit AgreementExpired(agreementId);
    }

    // --- View functions ---

    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        return agreements[agreementId];
    }

    function getClientAgreements(address client) external view returns (uint256[] memory) {
        return _clientAgreements[client];
    }

    function getProviderAgreements(address provider) external view returns (uint256[] memory) {
        return _providerAgreements[provider];
    }

    // --- Admin ---

    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
