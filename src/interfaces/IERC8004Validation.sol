// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC8004Validation {
    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        );
}
