// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";

/// @title ServiceMarket
/// @notice Service listing and discovery for ERC-8004 registered AI agents on Arc
/// @dev Agents list services with capabilities and pricing. Requires ERC-8004 registration.
contract ServiceMarket {
    struct Service {
        uint256 agentId;
        address provider;
        bytes32 capabilityHash;
        uint256 pricePerTask; // USDC amount (6 decimals)
        string metadataURI; // IPFS link to full service description
        bool active;
    }

    IERC8004Identity public immutable identityRegistry;

    uint256 public nextServiceId;
    mapping(uint256 => Service) public services;
    mapping(bytes32 => uint256[]) internal _servicesByCapability;
    mapping(uint256 => uint256[]) internal _servicesByAgent;

    event ServiceListed(
        uint256 indexed serviceId, uint256 indexed agentId, bytes32 indexed capabilityHash, uint256 pricePerTask
    );
    event ServiceDelisted(uint256 indexed serviceId);
    event ServiceUpdated(uint256 indexed serviceId, uint256 newPrice, string newMetadataURI);

    error NotAgentOwner();
    error AgentNotRegistered();
    error ServiceNotActive();
    error ZeroPrice();

    constructor(address _identityRegistry) {
        identityRegistry = IERC8004Identity(_identityRegistry);
    }

    /// @notice List a new service for a registered agent
    /// @param agentId The ERC-8004 token ID of the agent
    /// @param capabilityHash keccak256 of the capability string (e.g., keccak256("smart_contract_audit"))
    /// @param pricePerTask USDC price per task (6 decimals)
    /// @param metadataURI IPFS URI with full service details
    function listService(uint256 agentId, bytes32 capabilityHash, uint256 pricePerTask, string calldata metadataURI)
        external
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

    /// @notice Delist a service
    function delistService(uint256 serviceId) external {
        Service storage svc = services[serviceId];
        if (!svc.active) revert ServiceNotActive();
        if (identityRegistry.ownerOf(svc.agentId) != msg.sender) revert NotAgentOwner();

        svc.active = false;
        emit ServiceDelisted(serviceId);
    }

    /// @notice Update service pricing and metadata
    function updateService(uint256 serviceId, uint256 newPrice, string calldata newMetadataURI) external {
        Service storage svc = services[serviceId];
        if (!svc.active) revert ServiceNotActive();
        if (identityRegistry.ownerOf(svc.agentId) != msg.sender) revert NotAgentOwner();
        if (newPrice == 0) revert ZeroPrice();

        svc.pricePerTask = newPrice;
        svc.metadataURI = newMetadataURI;
        emit ServiceUpdated(serviceId, newPrice, newMetadataURI);
    }

    /// @notice Get all service IDs for a capability
    function getServicesByCapability(bytes32 capabilityHash) external view returns (uint256[] memory) {
        return _servicesByCapability[capabilityHash];
    }

    /// @notice Get all service IDs for an agent
    function getServicesByAgent(uint256 agentId) external view returns (uint256[] memory) {
        return _servicesByAgent[agentId];
    }

    /// @notice Get full service details
    function getService(uint256 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }
}
