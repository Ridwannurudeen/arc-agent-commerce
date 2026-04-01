// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAgenticCommerce} from "../../src/interfaces/IAgenticCommerce.sol";

/// @title MockAgenticCommerce — minimal ERC-8183 ACP mock for testing CommerceHook
contract MockAgenticCommerce {
    uint256 public jobCounter;
    mapping(uint256 => IAgenticCommerce.Job) internal _jobs;
    mapping(uint256 => bool) private _completed;
    mapping(uint256 => bool) private _rejected;

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256) {
        uint256 jobId = ++jobCounter;
        _jobs[jobId] = IAgenticCommerce.Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: IAgenticCommerce.JobStatus.Open,
            hook: hook
        });
        return jobId;
    }

    function setBudget(uint256 jobId, uint256 amount, bytes calldata) external {
        _jobs[jobId].budget = amount;
    }

    function fund(uint256 jobId, bytes calldata) external {
        _jobs[jobId].status = IAgenticCommerce.JobStatus.Funded;
    }

    function submit(uint256 jobId, bytes32, bytes calldata) external {
        _jobs[jobId].status = IAgenticCommerce.JobStatus.Submitted;
    }

    function complete(uint256 jobId, bytes32, bytes calldata) external {
        _jobs[jobId].status = IAgenticCommerce.JobStatus.Completed;
        _completed[jobId] = true;
    }

    function reject(uint256 jobId, bytes32, bytes calldata) external {
        _jobs[jobId].status = IAgenticCommerce.JobStatus.Rejected;
        _rejected[jobId] = true;
    }

    function claimRefund(uint256) external {}

    function getJob(uint256 jobId) external view returns (IAgenticCommerce.Job memory) {
        return _jobs[jobId];
    }

    function paymentToken() external pure returns (address) {
        return address(0);
    }

    // ---- Test helpers ----

    function mockSetStatus(uint256 jobId, IAgenticCommerce.JobStatus status) external {
        _jobs[jobId].status = status;
    }

    function isCompleted(uint256 jobId) external view returns (bool) {
        return _completed[jobId];
    }

    function isRejected(uint256 jobId) external view returns (bool) {
        return _rejected[jobId];
    }
}
