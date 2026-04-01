// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title MockOrchestrator — captures pipeline stage callbacks for testing
contract MockOrchestrator {
    uint256 public lastCompletedPipeline;
    uint256 public lastCompletedStage;
    uint256 public lastRejectedPipeline;
    uint256 public lastRejectedStage;

    function onStageCompleted(uint256 pipelineId, uint256 stageIndex) external {
        lastCompletedPipeline = pipelineId;
        lastCompletedStage = stageIndex;
    }

    function onStageRejected(uint256 pipelineId, uint256 stageIndex) external {
        lastRejectedPipeline = pipelineId;
        lastRejectedStage = stageIndex;
    }
}
