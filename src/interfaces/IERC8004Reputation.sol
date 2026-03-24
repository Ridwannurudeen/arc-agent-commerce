// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IERC8004Reputation
/// @notice Interface for ERC-8004 ReputationRegistry on Arc Testnet
/// @dev Deployed at 0x8004B663056A597Dffe9eCcC1965A193B7388713
interface IERC8004Reputation {
    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 category,
        string calldata tag,
        string calldata comment,
        string calldata evidenceURI,
        string calldata metadata,
        bytes32 feedbackHash
    ) external;
}
