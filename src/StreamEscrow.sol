// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004Reputation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title StreamEscrow
/// @notice Time-locked streaming escrow for agent-to-agent service payments.
///         Deposits unlock linearly over the stream duration with heartbeat liveness checks.
contract StreamEscrow is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    using SafeERC20 for IERC20;

    // ---- Errors ----
    error NotAgentOwner();
    error InvalidDuration();
    error UnsupportedCurrency();
    error NotProvider();
    error NotClient();
    error StreamNotActive();
    error StreamNotPaused();
    error HeartbeatNotMissed();
    error NothingToWithdraw();
    error StreamEnded();

    // ---- Events ----
    event StreamCreated(uint256 indexed streamId, address client, address provider, uint256 deposit, uint256 duration);
    event Heartbeat(uint256 indexed streamId, uint256 timestamp);
    event StreamPaused(uint256 indexed streamId, uint256 timestamp);
    event StreamResumed(uint256 indexed streamId, uint256 pausedDuration);
    event Withdrawn(uint256 indexed streamId, address provider, uint256 amount);
    event StreamCancelled(uint256 indexed streamId, uint256 providerEarned, uint256 clientRefund);
    event StreamCompleted(uint256 indexed streamId, uint256 totalEarned);
    event TopUp(uint256 indexed streamId, uint256 amount, uint256 newEndTime);

    // ---- Types ----
    enum StreamStatus {
        Active,
        Paused,
        Completed,
        Cancelled
    }

    struct Stream {
        address client;
        address provider;
        uint256 clientAgentId;
        uint256 providerAgentId;
        address currency;
        uint256 deposit;
        uint256 withdrawn;
        uint256 startTime;
        uint256 endTime;
        uint256 heartbeatInterval;
        uint256 lastHeartbeat;
        uint256 missedBeats;
        uint256 pausedAt;
        uint256 totalPausedTime;
        StreamStatus status;
    }

    // ---- State ----
    IERC8004Identity public identityRegistry;
    IERC8004Reputation public reputationRegistry;

    mapping(address => bool) public supportedCurrencies;
    mapping(uint256 => Stream) internal _streams;
    mapping(address => uint256[]) internal _clientStreams;
    mapping(address => uint256[]) internal _providerStreams;
    uint256 public streamCount;

    uint256[40] private __gap;

    // ---- Constructor ----

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ---- Initializer ----

    function initialize(
        address currency_,
        address identityRegistry_,
        address reputationRegistry_,
        address owner_
    ) external initializer {
        __Ownable_init(owner_);
        __Ownable2Step_init();

        identityRegistry = IERC8004Identity(identityRegistry_);
        reputationRegistry = IERC8004Reputation(reputationRegistry_);
        supportedCurrencies[currency_] = true;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ---- Admin ----

    /// @notice Add a supported currency (e.g. EURC)
    function addSupportedCurrency(address currency) external onlyOwner {
        supportedCurrencies[currency] = true;
    }

    // ---- Core ----

    /// @notice Create a new streaming escrow between a client agent and a provider agent
    /// @param clientAgentId ERC-8004 agent ID of the client (msg.sender must own it)
    /// @param providerAgentId ERC-8004 agent ID of the provider
    /// @param provider Address of the provider (must own providerAgentId)
    /// @param currency Payment token address (must be supported)
    /// @param deposit Total payment amount locked in the stream
    /// @param duration Stream duration in seconds
    /// @param heartbeatInterval Max seconds between provider heartbeats
    /// @return streamId The ID of the newly created stream
    function createStream(
        uint256 clientAgentId,
        uint256 providerAgentId,
        address provider,
        address currency,
        uint256 deposit,
        uint256 duration,
        uint256 heartbeatInterval
    ) external returns (uint256 streamId) {
        if (identityRegistry.ownerOf(clientAgentId) != msg.sender) revert NotAgentOwner();
        if (duration == 0) revert InvalidDuration();
        if (!supportedCurrencies[currency]) revert UnsupportedCurrency();

        // Pull deposit from client
        IERC20(currency).safeTransferFrom(msg.sender, address(this), deposit);

        // Store stream
        streamId = streamCount++;
        Stream storage s = _streams[streamId];
        s.client = msg.sender;
        s.provider = provider;
        s.clientAgentId = clientAgentId;
        s.providerAgentId = providerAgentId;
        s.currency = currency;
        s.deposit = deposit;
        s.startTime = block.timestamp;
        s.endTime = block.timestamp + duration;
        s.heartbeatInterval = heartbeatInterval;
        s.lastHeartbeat = block.timestamp;
        s.status = StreamStatus.Active;

        // Track in arrays
        _clientStreams[msg.sender].push(streamId);
        _providerStreams[provider].push(streamId);

        emit StreamCreated(streamId, msg.sender, provider, deposit, duration);
    }

    // ---- View ----

    /// @notice Get a stream by ID
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return _streams[streamId];
    }

    /// @notice Get all stream IDs for a client address
    function getClientStreams(address client) external view returns (uint256[] memory) {
        return _clientStreams[client];
    }

    /// @notice Get all stream IDs for a provider address
    function getProviderStreams(address provider) external view returns (uint256[] memory) {
        return _providerStreams[provider];
    }
}
