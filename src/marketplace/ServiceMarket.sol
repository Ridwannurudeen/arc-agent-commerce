// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "../interfaces/IERC8004Identity.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title ServiceMarket
/// @notice Service listing and discovery for ERC-8004 registered AI agents on Arc
contract ServiceMarket is Initializable, UUPSUpgradeable, PausableUpgradeable, Ownable2StepUpgradeable {
    struct Service {
        uint256 agentId;
        address provider;
        bytes32 capabilityHash;
        uint256 pricePerTask;
        string metadataURI;
        bool active;
    }

    IERC8004Identity public identityRegistry;

    uint256 public nextServiceId;
    mapping(uint256 => Service) public services;
    mapping(bytes32 => uint256[]) internal _servicesByCapability;
    mapping(uint256 => uint256[]) internal _servicesByAgent;

    uint256[45] private __gap;

    event ServiceListed(
        uint256 indexed serviceId, uint256 indexed agentId, bytes32 indexed capabilityHash, uint256 pricePerTask
    );
    event ServiceDelisted(uint256 indexed serviceId);
    event ServiceUpdated(uint256 indexed serviceId, uint256 newPrice, string newMetadataURI);

    error NotAgentOwner();
    error AgentNotRegistered();
    error ServiceNotActive();
    error ZeroPrice();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _identityRegistry, address _owner) external initializer {
        if (_identityRegistry == address(0) || _owner == address(0)) revert ZeroAddress();
        __Pausable_init();
        __Ownable_init(_owner);
        __Ownable2Step_init();
        identityRegistry = IERC8004Identity(_identityRegistry);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function listService(uint256 agentId, bytes32 capabilityHash, uint256 pricePerTask, string calldata metadataURI)
        external
        whenNotPaused
        returns (uint256 serviceId)
    {
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        if (pricePerTask == 0) revert ZeroPrice();

        serviceId = nextServiceId++;
        services[serviceId] = Service({
            agentId: agentId,
            provider: msg.sender,
            capabilityHash: capabilityHash,
            pricePerTask: pricePerTask,
            metadataURI: metadataURI,
            active: true
        });

        _servicesByCapability[capabilityHash].push(serviceId);
        _servicesByAgent[agentId].push(serviceId);

        emit ServiceListed(serviceId, agentId, capabilityHash, pricePerTask);
    }

    function delistService(uint256 serviceId) external {
        Service storage svc = services[serviceId];
        if (!svc.active) revert ServiceNotActive();
        if (identityRegistry.ownerOf(svc.agentId) != msg.sender) revert NotAgentOwner();

        svc.active = false;
        emit ServiceDelisted(serviceId);
    }

    function updateService(uint256 serviceId, uint256 newPrice, string calldata newMetadataURI) external {
        Service storage svc = services[serviceId];
        if (!svc.active) revert ServiceNotActive();
        if (identityRegistry.ownerOf(svc.agentId) != msg.sender) revert NotAgentOwner();
        if (newPrice == 0) revert ZeroPrice();

        svc.pricePerTask = newPrice;
        svc.metadataURI = newMetadataURI;
        emit ServiceUpdated(serviceId, newPrice, newMetadataURI);
    }

    function getServicesByCapability(bytes32 capabilityHash) external view returns (uint256[] memory) {
        return _servicesByCapability[capabilityHash];
    }

    function getServicesByAgent(uint256 agentId) external view returns (uint256[] memory) {
        return _servicesByAgent[agentId];
    }

    function getService(uint256 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }
}
