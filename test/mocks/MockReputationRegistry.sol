// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title MockReputationRegistry — captures reputation calls for testing
contract MockReputationRegistry {
    struct Feedback {
        uint256 agentId;
        int128 score;
        uint8 category;
        string tag;
        bytes32 feedbackHash;
    }

    Feedback[] public feedbacks;

    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 category,
        string calldata tag,
        string calldata,
        string calldata,
        string calldata,
        bytes32 feedbackHash
    ) external {
        feedbacks.push(Feedback({
            agentId: agentId,
            score: score,
            category: category,
            tag: tag,
            feedbackHash: feedbackHash
        }));
    }

    function feedbackCount() external view returns (uint256) {
        return feedbacks.length;
    }
}
