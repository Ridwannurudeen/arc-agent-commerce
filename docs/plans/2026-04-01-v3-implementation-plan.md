# Agent Commerce Protocol v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite Agent Commerce Protocol as a multi-agent pipeline orchestration layer composing Arc's native ERC-8183 jobs, ERC-8004 identity/reputation/validation, with USDC+EURC support.

**Architecture:** 3 new contracts (PipelineOrchestrator, CommerceHook, AgentPolicy) that build ON TOP of Arc's native ERC-8183 (AgenticCommerce at `0x0747EEf0706327138c69792bF28Cd525089e4583`). CommerceHook implements `IACPHook` for before/after callbacks AND acts as the evaluator that calls `complete()`/`reject()` on ERC-8183 jobs. PipelineOrchestrator chains multiple ERC-8183 jobs into conditional multi-stage workflows with atomic funding and partial refunds.

**Tech Stack:** Solidity 0.8.30 (Foundry), Python 3.11+ (web3.py), Next.js 16 (wagmi/viem), Arc Testnet (chain 5042002)

**ERC-8183 Job Flow (critical to understand):**
```
createJob(provider, evaluator, expiredAt, description, hook) → jobId  [client]
setBudget(jobId, amount, optParams)                                    [provider]
fund(jobId, optParams)                                                 [client]
submit(jobId, deliverable, optParams)                                  [provider]
complete(jobId, reason, optParams)                                     [evaluator]
  OR reject(jobId, reason, optParams)                                  [evaluator]
  OR claimRefund(jobId)                                                [anyone, after expiry]
```

Hook callbacks: `beforeAction(jobId, selector, data)` and `afterAction(jobId, selector, data)` fire on every lifecycle function (except `claimRefund`).

**Key Addresses (Arc Testnet):**
- ERC-8183: `0x0747EEf0706327138c69792bF28Cd525089e4583`
- USDC: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- ValidationRegistry: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`

---

## Task 1: ERC-8183 Interface + Hook Interface

**Files:**
- Create: `src/interfaces/IAgenticCommerce.sol`
- Create: `src/interfaces/IACPHook.sol`

**Step 1: Create IAgenticCommerce interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAgenticCommerce {
    enum JobStatus { Open, Funded, Submitted, Completed, Rejected, Expired }

    struct Job {
        uint256   id;
        address   client;
        address   provider;
        address   evaluator;
        string    description;
        uint256   budget;
        uint256   expiredAt;
        JobStatus status;
        address   hook;
    }

    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description, address hook) external returns (uint256);
    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external;
    function fund(uint256 jobId, bytes calldata optParams) external;
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external;
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external;
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external;
    function claimRefund(uint256 jobId) external;
    function getJob(uint256 jobId) external view returns (Job memory);
    function jobCounter() external view returns (uint256);
    function paymentToken() external view returns (address);
}
```

**Step 2: Create IACPHook interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IACPHook is IERC165 {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}
```

**Step 3: Create ValidationRegistry interface**

Create: `src/interfaces/IERC8004Validation.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC8004Validation {
    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    );
}
```

**Step 4: Verify build**

Run: `cd "C:/Users/GUDMAN/Desktop/Github files/arc-agent-commerce" && forge build`
Expected: Build succeeds (interfaces only, no logic yet)

**Step 5: Commit**

```bash
git add src/interfaces/IAgenticCommerce.sol src/interfaces/IACPHook.sol src/interfaces/IERC8004Validation.sol
git commit -m "feat: add ERC-8183 and IACPHook interfaces for v3"
```

---

## Task 2: CommerceHook Contract

**Files:**
- Create: `src/CommerceHook.sol`
- Create: `test/CommerceHook.t.sol`
- Create: `test/mocks/MockAgenticCommerce.sol`

This is the glue between ERC-8183 and the pipeline. It implements `IACPHook` (before/after callbacks) and acts as the evaluator on jobs.

**Step 1: Create MockAgenticCommerce for testing**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAgenticCommerce} from "../../src/interfaces/IAgenticCommerce.sol";

contract MockAgenticCommerce {
    uint256 public jobCounter;
    mapping(uint256 => IAgenticCommerce.Job) public _jobs;
    mapping(uint256 => bool) private _completed;
    mapping(uint256 => bool) private _rejected;

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256) {
        jobCounter++;
        _jobs[jobCounter] = IAgenticCommerce.Job({
            id: jobCounter,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: IAgenticCommerce.JobStatus.Open,
            hook: hook
        });
        return jobCounter;
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

    function claimRefund(uint256 jobId) external {
        _jobs[jobId].status = IAgenticCommerce.JobStatus.Expired;
    }

    function getJob(uint256 jobId) external view returns (IAgenticCommerce.Job memory) {
        return _jobs[jobId];
    }

    function paymentToken() external pure returns (address) {
        return address(0); // overridden in tests
    }

    function isCompleted(uint256 jobId) external view returns (bool) {
        return _completed[jobId];
    }

    function isRejected(uint256 jobId) external view returns (bool) {
        return _rejected[jobId];
    }

    // Helper to simulate provider submitting (move to Submitted state)
    function mockSetStatus(uint256 jobId, IAgenticCommerce.JobStatus status) external {
        _jobs[jobId].status = status;
    }
}
```

**Step 2: Write CommerceHook tests (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {MockAgenticCommerce} from "./mocks/MockAgenticCommerce.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";

contract CommerceHookTest is Test {
    CommerceHook hook;
    MockAgenticCommerce acp;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;

    address deployer = makeAddr("deployer");
    address orchestrator = makeAddr("orchestrator");
    address alice = makeAddr("alice"); // client
    address bob = makeAddr("bob");     // provider

    uint256 aliceAgentId;
    uint256 bobAgentId;

    function setUp() public {
        vm.startPrank(deployer);

        acp = new MockAgenticCommerce();
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();

        CommerceHook hookImpl = new CommerceHook();
        ERC1967Proxy hookProxy = new ERC1967Proxy(
            address(hookImpl),
            abi.encodeCall(CommerceHook.initialize, (
                address(acp),
                address(identity),
                address(reputation),
                deployer
            ))
        );
        hook = CommerceHook(address(hookProxy));
        hook.setOrchestrator(orchestrator);

        vm.stopPrank();

        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice");
        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob");
    }

    function test_supportsInterface() public view {
        // IACPHook interfaceId = beforeAction ^ afterAction
        bytes4 hookId = bytes4(keccak256("beforeAction(uint256,bytes4,bytes)")) ^
                        bytes4(keccak256("afterAction(uint256,bytes4,bytes)"));
        assertTrue(hook.supportsInterface(hookId));
        assertTrue(hook.supportsInterface(0x01ffc9a7)); // ERC165
    }

    function test_registerPipelineJob() public {
        vm.prank(orchestrator);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);

        (uint256 pipelineId, uint256 stageIndex, uint256 providerAgentId, uint256 clientAgentId, bool exists) =
            hook.jobRegistry(42);
        assertEq(pipelineId, 1);
        assertEq(stageIndex, 0);
        assertEq(providerAgentId, bobAgentId);
        assertEq(clientAgentId, aliceAgentId);
        assertTrue(exists);
    }

    function test_registerPipelineJob_revertNotOrchestrator() public {
        vm.prank(alice);
        vm.expectRevert(CommerceHook.OnlyOrchestrator.selector);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);
    }

    function test_approveStage() public {
        // Register job
        vm.prank(orchestrator);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);

        // Mock job is Submitted
        acp.mockSetStatus(42, IAgenticCommerce.JobStatus.Submitted);

        // Client approves
        vm.prank(alice);
        hook.approveStage(42);

        // Job should be completed on ACP
        assertTrue(acp.isCompleted(42));
    }

    function test_approveStage_revertNotClient() public {
        vm.prank(orchestrator);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);
        acp.mockSetStatus(42, IAgenticCommerce.JobStatus.Submitted);

        vm.prank(bob);
        vm.expectRevert(CommerceHook.OnlyPipelineClient.selector);
        hook.approveStage(42);
    }

    function test_rejectStage() public {
        vm.prank(orchestrator);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);
        acp.mockSetStatus(42, IAgenticCommerce.JobStatus.Submitted);

        vm.prank(alice);
        hook.rejectStage(42, "bad quality");

        assertTrue(acp.isRejected(42));
    }

    function test_setAutoApprove() public {
        vm.prank(orchestrator);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);

        vm.prank(alice);
        hook.setAutoApprove(1, true);
        assertTrue(hook.autoApprove(1));
    }

    function test_afterAction_autoApprove_onSubmit() public {
        // Setup: register job, enable auto-approve
        vm.prank(orchestrator);
        hook.registerPipelineJob(1, 0, 42, bobAgentId, aliceAgentId);

        vm.prank(alice);
        hook.setAutoApprove(1, true);

        acp.mockSetStatus(42, IAgenticCommerce.JobStatus.Submitted);

        // Simulate ACP calling afterAction with submit selector
        bytes4 submitSelector = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
        bytes memory data = abi.encode(bob, bytes32(0), "");

        vm.prank(address(acp));
        hook.afterAction(42, submitSelector, data);

        // Job should be auto-completed
        assertTrue(acp.isCompleted(42));
    }

    function test_beforeAction_noop() public {
        // beforeAction should not revert for any selector
        vm.prank(address(acp));
        hook.beforeAction(1, bytes4(0), "");
    }
}
```

**Step 3: Run tests to verify they fail**

Run: `cd "C:/Users/GUDMAN/Desktop/Github files/arc-agent-commerce" && forge test --match-contract CommerceHookTest -v`
Expected: FAIL (CommerceHook.sol doesn't exist yet)

**Step 4: Implement CommerceHook**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IACPHook} from "./interfaces/IACPHook.sol";
import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004Reputation.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract CommerceHook is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable, ERC165 {
    // --- Errors ---
    error OnlyOrchestrator();
    error OnlyPipelineClient();
    error OnlyACP();
    error JobNotRegistered();
    error JobNotSubmitted();

    // --- Events ---
    event PipelineJobRegistered(uint256 indexed pipelineId, uint256 indexed stageIndex, uint256 indexed jobId);
    event StageApproved(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId);
    event StageRejected(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId, string reason);
    event StageAutoApproved(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId);
    event ReputationRecordFailed(uint256 indexed jobId, uint256 indexed agentId, string reason);
    event AutoApproveSet(uint256 indexed pipelineId, bool enabled);

    // --- Structs ---
    struct JobInfo {
        uint256 pipelineId;
        uint256 stageIndex;
        uint256 providerAgentId;
        uint256 clientAgentId;
        bool exists;
    }

    // --- State ---
    IAgenticCommerce public acp;
    IERC8004Identity public identityRegistry;
    IERC8004Reputation public reputationRegistry;
    address public orchestrator;

    mapping(uint256 => JobInfo) public jobRegistry;       // jobId => info
    mapping(uint256 => bool) public autoApprove;          // pipelineId => auto
    mapping(uint256 => address) public pipelineClients;   // pipelineId => client address

    // --- Modifiers ---
    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert OnlyOrchestrator();
        _;
    }

    modifier onlyACP() {
        if (msg.sender != address(acp)) revert OnlyACP();
        _;
    }

    // --- Initializer ---
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address acp_,
        address identityRegistry_,
        address reputationRegistry_,
        address owner_
    ) external initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        acp = IAgenticCommerce(acp_);
        identityRegistry = IERC8004Identity(identityRegistry_);
        reputationRegistry = IERC8004Reputation(reputationRegistry_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // --- Admin ---
    function setOrchestrator(address orchestrator_) external onlyOwner {
        orchestrator = orchestrator_;
    }

    // --- Registration (called by PipelineOrchestrator) ---
    function registerPipelineJob(
        uint256 pipelineId,
        uint256 stageIndex,
        uint256 jobId,
        uint256 providerAgentId,
        uint256 clientAgentId
    ) external onlyOrchestrator {
        jobRegistry[jobId] = JobInfo({
            pipelineId: pipelineId,
            stageIndex: stageIndex,
            providerAgentId: providerAgentId,
            clientAgentId: clientAgentId,
            exists: true
        });
        emit PipelineJobRegistered(pipelineId, stageIndex, jobId);
    }

    function setPipelineClient(uint256 pipelineId, address client) external onlyOrchestrator {
        pipelineClients[pipelineId] = client;
    }

    // --- Client Actions ---
    function setAutoApprove(uint256 pipelineId, bool enabled) external {
        if (msg.sender != pipelineClients[pipelineId]) revert OnlyPipelineClient();
        autoApprove[pipelineId] = enabled;
        emit AutoApproveSet(pipelineId, enabled);
    }

    function approveStage(uint256 jobId) external {
        JobInfo memory info = jobRegistry[jobId];
        if (!info.exists) revert JobNotRegistered();
        if (msg.sender != pipelineClients[info.pipelineId]) revert OnlyPipelineClient();

        IAgenticCommerce.Job memory job = acp.getJob(jobId);
        if (job.status != IAgenticCommerce.JobStatus.Submitted) revert JobNotSubmitted();

        _completeAndAdvance(jobId, info);
    }

    function rejectStage(uint256 jobId, string calldata reason) external {
        JobInfo memory info = jobRegistry[jobId];
        if (!info.exists) revert JobNotRegistered();
        if (msg.sender != pipelineClients[info.pipelineId]) revert OnlyPipelineClient();

        // Reject on ERC-8183 (refunds client automatically)
        acp.reject(jobId, keccak256(bytes(reason)), "");

        // Record negative reputation
        _tryRecordReputation(info.providerAgentId, -50, "delivery_rejected");

        emit StageRejected(info.pipelineId, info.stageIndex, jobId, reason);
    }

    // --- IACPHook Implementation ---
    function beforeAction(uint256, bytes4, bytes calldata) external view onlyACP {
        // No-op for now. Can add pre-validation later.
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external onlyACP {
        JobInfo memory info = jobRegistry[jobId];
        if (!info.exists) return; // Not a pipeline job, ignore

        // Auto-approve on submit if enabled
        bytes4 submitSelector = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
        if (selector == submitSelector && autoApprove[info.pipelineId]) {
            _completeAndAdvance(jobId, info);
            emit StageAutoApproved(info.pipelineId, info.stageIndex, jobId);
        }
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        bytes4 hookId = type(IACPHook).interfaceId;
        return interfaceId == hookId || super.supportsInterface(interfaceId);
    }

    // --- Internal ---
    function _completeAndAdvance(uint256 jobId, JobInfo memory info) internal {
        // Complete the ERC-8183 job (releases payment to provider)
        acp.complete(jobId, keccak256("approved"), "");

        // Record positive reputation
        _tryRecordReputation(info.providerAgentId, 100, "stage_completed");

        emit StageApproved(info.pipelineId, info.stageIndex, jobId);

        // Notify orchestrator to advance pipeline
        // (orchestrator listens for StageApproved event or we call it directly)
        // Using direct call for atomicity:
        IPipelineOrchestrator(orchestrator).onStageCompleted(info.pipelineId, info.stageIndex);
    }

    function _tryRecordReputation(uint256 agentId, int128 score, string memory tag) internal {
        try reputationRegistry.giveFeedback(
            agentId, score, 1, tag, "", "", "", keccak256(abi.encodePacked(agentId, score, tag))
        ) {} catch (bytes memory reason) {
            emit ReputationRecordFailed(agentId, agentId, string(reason));
        }
    }
}

// Minimal interface for the callback
interface IPipelineOrchestrator {
    function onStageCompleted(uint256 pipelineId, uint256 stageIndex) external;
    function onStageRejected(uint256 pipelineId, uint256 stageIndex) external;
}
```

**Step 5: Run tests**

Run: `cd "C:/Users/GUDMAN/Desktop/Github files/arc-agent-commerce" && forge test --match-contract CommerceHookTest -v`
Expected: Most tests PASS. Some may need import fixes (the `IAgenticCommerce` import in test).

**Step 6: Fix any compilation issues and re-run until green**

**Step 7: Commit**

```bash
git add src/CommerceHook.sol test/CommerceHook.t.sol test/mocks/MockAgenticCommerce.sol
git commit -m "feat: add CommerceHook as ERC-8183 evaluator + IACPHook

Implements both IACPHook (before/after callbacks) and acts as evaluator
for pipeline jobs. Auto-approve mode for autonomous agents, client-approve
for human oversight. Reputation recording via try/catch."
```

---

## Task 3: AgentPolicy Contract (v3)

**Files:**
- Create: `src/AgentPolicy.sol`
- Create: `test/AgentPolicy.t.sol`

**Step 1: Write AgentPolicy tests (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract AgentPolicyTest is Test {
    AgentPolicy policy;
    MockIdentityRegistry identity;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address orchestrator = makeAddr("orchestrator");

    function setUp() public {
        vm.startPrank(deployer);
        identity = new MockIdentityRegistry();

        AgentPolicy impl = new AgentPolicy();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(AgentPolicy.initialize, (address(identity), deployer))
        );
        policy = AgentPolicy(address(proxy));
        policy.setOrchestrator(orchestrator);
        vm.stopPrank();
    }

    function test_setPolicy() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 1000e6);

        (uint256 maxPerTx, uint256 maxDaily,,, bool exists) = policy.policies(alice);
        assertEq(maxPerTx, 100e6);
        assertEq(maxDaily, 1000e6);
        assertTrue(exists);
    }

    function test_checkStageBudget_withinLimits() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 1000e6);

        vm.prank(orchestrator);
        assertTrue(policy.checkStageBudget(alice, 50e6, bob));
    }

    function test_checkStageBudget_exceedsPerTx() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 1000e6);

        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.ExceedsPerTxLimit.selector);
        policy.checkStageBudget(alice, 200e6, bob);
    }

    function test_checkStageBudget_exceedsDaily() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 150e6);

        // First call: 100 OK
        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 100e6, bob);

        // Second call: 100 exceeds daily 150
        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.ExceedsDailyLimit.selector);
        policy.checkStageBudget(alice, 100e6, bob);
    }

    function test_checkStageBudget_dailyReset() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 150e6);

        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 100e6, bob);

        // Warp to next day
        vm.warp(block.timestamp + 1 days);

        vm.prank(orchestrator);
        assertTrue(policy.checkStageBudget(alice, 100e6, bob));
    }

    function test_checkStageBudget_noPolicy() public {
        // No policy = always passes
        vm.prank(orchestrator);
        assertTrue(policy.checkStageBudget(alice, 999999e6, bob));
    }

    function test_counterpartyRestriction() public {
        vm.startPrank(alice);
        policy.setPolicy(alice, 100e6, 1000e6);
        policy.setCounterpartyRestriction(alice, true);
        vm.stopPrank();

        // Bob not allowed
        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.CounterpartyNotAllowed.selector);
        policy.checkStageBudget(alice, 50e6, bob);

        // Allow bob
        vm.prank(alice);
        policy.setAllowedCounterparty(alice, bob, true);

        vm.prank(orchestrator);
        assertTrue(policy.checkStageBudget(alice, 50e6, bob));
    }

    function test_wouldPass() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 1000e6);

        assertTrue(policy.wouldPass(alice, 50e6, bob));
        assertFalse(policy.wouldPass(alice, 200e6, bob));
    }

    function test_dailyRemaining() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 200e6, bob); // This should fail since 200 > maxPerTx=100

        // Actually let's set maxPerTx higher
        vm.prank(alice);
        policy.setPolicy(alice, 500e6, 500e6);

        vm.prank(orchestrator);
        policy.checkStageBudget(alice, 200e6, bob);

        assertEq(policy.dailyRemaining(alice), 300e6);
    }

    function test_checkPipelineBudget() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 500e6);

        vm.prank(orchestrator);
        assertTrue(policy.checkPipelineBudget(alice, 400e6));

        vm.prank(orchestrator);
        vm.expectRevert(AgentPolicy.ExceedsDailyLimit.selector);
        policy.checkPipelineBudget(alice, 600e6);
    }

    function test_setPolicy_revertNotPolicyOwner() public {
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 1000e6);

        // Bob can't change alice's policy
        vm.prank(bob);
        vm.expectRevert(AgentPolicy.NotPolicyOwner.selector);
        policy.setCounterpartyRestriction(alice, true);
    }
}
```

**Step 2: Run tests to verify fail**

Run: `forge test --match-contract AgentPolicyTest -v`
Expected: FAIL

**Step 3: Implement AgentPolicy**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

contract AgentPolicy is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    // --- Errors ---
    error ExceedsPerTxLimit();
    error ExceedsDailyLimit();
    error CounterpartyNotAllowed();
    error NotPolicyOwner();
    error OnlyOrchestrator();

    // --- Events ---
    event PolicySet(address indexed agent, uint256 maxPerTx, uint256 maxDaily);
    event CounterpartyRestrictionSet(address indexed agent, bool restricted);
    event CounterpartyAllowed(address indexed agent, address indexed counterparty, bool allowed);

    // --- Structs ---
    struct Policy {
        uint256 maxPerTx;
        uint256 maxDaily;
        uint256 dailySpent;
        uint256 dayStart;
        bool exists;
    }

    // --- State ---
    IERC8004Identity public identityRegistry;
    address public orchestrator;
    mapping(address => Policy) public policies;
    mapping(address => address) public policyOwners;
    mapping(address => bool) public counterpartyRestricted;
    mapping(address => mapping(address => bool)) public allowedCounterparties;

    // --- Modifiers ---
    modifier onlyPolicyOwner(address agent) {
        if (policyOwners[agent] != address(0) && policyOwners[agent] != msg.sender)
            revert NotPolicyOwner();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address identityRegistry_, address owner_) external initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        identityRegistry = IERC8004Identity(identityRegistry_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setOrchestrator(address orchestrator_) external onlyOwner {
        orchestrator = orchestrator_;
    }

    // --- Policy Management ---
    function setPolicy(address agent, uint256 maxPerTx, uint256 maxDaily) external {
        if (policyOwners[agent] != address(0) && policyOwners[agent] != msg.sender)
            revert NotPolicyOwner();
        policyOwners[agent] = msg.sender;
        policies[agent] = Policy({
            maxPerTx: maxPerTx,
            maxDaily: maxDaily,
            dailySpent: 0,
            dayStart: _dayStart(),
            exists: true
        });
        emit PolicySet(agent, maxPerTx, maxDaily);
    }

    function setCounterpartyRestriction(address agent, bool restricted) external onlyPolicyOwner(agent) {
        counterpartyRestricted[agent] = restricted;
        emit CounterpartyRestrictionSet(agent, restricted);
    }

    function setAllowedCounterparty(address agent, address counterparty, bool allowed) external onlyPolicyOwner(agent) {
        allowedCounterparties[agent][counterparty] = allowed;
        emit CounterpartyAllowed(agent, counterparty, allowed);
    }

    // --- Checks (called by Orchestrator) ---
    function checkStageBudget(address agent, uint256 amount, address counterparty) external returns (bool) {
        Policy storage p = policies[agent];
        if (!p.exists) return true;

        if (amount > p.maxPerTx) revert ExceedsPerTxLimit();

        // Reset daily if new day
        if (_dayStart() > p.dayStart) {
            p.dailySpent = 0;
            p.dayStart = _dayStart();
        }

        if (p.dailySpent + amount > p.maxDaily) revert ExceedsDailyLimit();

        if (counterpartyRestricted[agent] && !allowedCounterparties[agent][counterparty])
            revert CounterpartyNotAllowed();

        p.dailySpent += amount;
        return true;
    }

    function checkPipelineBudget(address agent, uint256 totalBudget) external view returns (bool) {
        Policy storage p = policies[agent];
        if (!p.exists) return true;

        uint256 currentSpent = p.dailySpent;
        if (_dayStart() > p.dayStart) currentSpent = 0;

        if (currentSpent + totalBudget > p.maxDaily) revert ExceedsDailyLimit();
        return true;
    }

    // --- Read-only ---
    function wouldPass(address agent, uint256 amount, address counterparty) external view returns (bool) {
        Policy storage p = policies[agent];
        if (!p.exists) return true;
        if (amount > p.maxPerTx) return false;

        uint256 currentSpent = p.dailySpent;
        if (_dayStart() > p.dayStart) currentSpent = 0;
        if (currentSpent + amount > p.maxDaily) return false;

        if (counterpartyRestricted[agent] && !allowedCounterparties[agent][counterparty])
            return false;

        return true;
    }

    function dailyRemaining(address agent) external view returns (uint256) {
        Policy storage p = policies[agent];
        if (!p.exists) return type(uint256).max;

        uint256 currentSpent = p.dailySpent;
        if (_dayStart() > p.dayStart) currentSpent = 0;

        if (currentSpent >= p.maxDaily) return 0;
        return p.maxDaily - currentSpent;
    }

    function _dayStart() internal view returns (uint256) {
        return (block.timestamp / 1 days) * 1 days;
    }
}
```

**Step 4: Run tests**

Run: `forge test --match-contract AgentPolicyTest -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/AgentPolicy.sol test/AgentPolicy.t.sol
git commit -m "feat: add AgentPolicy v3 with per-stage and daily limits

Multi-currency aware spending guardrails. Orchestrator calls checkStageBudget
per stage and checkPipelineBudget on pipeline creation. Daily reset at UTC
boundary. Counterparty allowlists preserved from v2."
```

---

## Task 4: PipelineOrchestrator Contract

**Files:**
- Create: `src/PipelineOrchestrator.sol`
- Create: `test/PipelineOrchestrator.t.sol`

**Step 1: Write PipelineOrchestrator tests (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PipelineOrchestrator} from "../src/PipelineOrchestrator.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";
import {MockAgenticCommerce} from "./mocks/MockAgenticCommerce.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IAgenticCommerce} from "../src/interfaces/IAgenticCommerce.sol";

contract PipelineOrchestratorTest is Test {
    PipelineOrchestrator orchestrator;
    CommerceHook hook;
    AgentPolicy policy;
    MockAgenticCommerce acp;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    MockUSDC usdc;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    uint256 aliceAgentId;
    uint256 bobAgentId;
    uint256 charlieAgentId;

    function setUp() public {
        vm.startPrank(deployer);

        usdc = new MockUSDC();
        acp = new MockAgenticCommerce();
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();

        // Deploy AgentPolicy
        AgentPolicy policyImpl = new AgentPolicy();
        ERC1967Proxy policyProxy = new ERC1967Proxy(
            address(policyImpl),
            abi.encodeCall(AgentPolicy.initialize, (address(identity), deployer))
        );
        policy = AgentPolicy(address(policyProxy));

        // Deploy CommerceHook
        CommerceHook hookImpl = new CommerceHook();
        ERC1967Proxy hookProxy = new ERC1967Proxy(
            address(hookImpl),
            abi.encodeCall(CommerceHook.initialize, (
                address(acp), address(identity), address(reputation), deployer
            ))
        );
        hook = CommerceHook(address(hookProxy));

        // Deploy PipelineOrchestrator
        PipelineOrchestrator orchImpl = new PipelineOrchestrator();
        ERC1967Proxy orchProxy = new ERC1967Proxy(
            address(orchImpl),
            abi.encodeCall(PipelineOrchestrator.initialize, (
                address(acp), address(usdc), address(identity),
                address(hook), address(policy), deployer
            ))
        );
        orchestrator = PipelineOrchestrator(address(orchProxy));

        // Wire up: hook.setOrchestrator, policy.setOrchestrator
        hook.setOrchestrator(address(orchestrator));
        policy.setOrchestrator(address(orchestrator));

        vm.stopPrank();

        // Register agents
        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice");
        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob");
        vm.prank(charlie);
        charlieAgentId = identity.register("ipfs://charlie");

        // Fund alice
        usdc.mint(alice, 1_000_000e6);
    }

    function _createTwoStagePipeline() internal returns (uint256) {
        PipelineOrchestrator.StageParam[] memory stages = new PipelineOrchestrator.StageParam[](2);
        stages[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });
        stages[1] = PipelineOrchestrator.StageParam({
            providerAgentId: charlieAgentId,
            providerAddress: charlie,
            capabilityHash: keccak256("deploy"),
            budget: 30e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 80e6);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, stages, address(usdc), block.timestamp + 1 days
        );
        vm.stopPrank();
        return pipelineId;
    }

    // --- Creation Tests ---

    function test_createPipeline() public {
        uint256 pipelineId = _createTwoStagePipeline();
        assertEq(pipelineId, 1);

        (uint256 clientAgentId,, address currency, uint256 totalBudget,,
         uint256 stageCount, PipelineOrchestrator.PipelineStatus status,,) =
            orchestrator.pipelines(pipelineId);

        assertEq(clientAgentId, aliceAgentId);
        assertEq(currency, address(usdc));
        assertEq(totalBudget, 80e6);
        assertEq(stageCount, 2);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Active));

        // USDC transferred from alice
        assertEq(usdc.balanceOf(alice), 1_000_000e6 - 80e6);
    }

    function test_createPipeline_revertZeroStages() public {
        PipelineOrchestrator.StageParam[] memory stages = new PipelineOrchestrator.StageParam[](0);
        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 100e6);
        vm.expectRevert(PipelineOrchestrator.NoStages.selector);
        orchestrator.createPipeline(aliceAgentId, stages, address(usdc), block.timestamp + 1 days);
        vm.stopPrank();
    }

    function test_createPipeline_revertPastDeadline() public {
        PipelineOrchestrator.StageParam[] memory stages = new PipelineOrchestrator.StageParam[](1);
        stages[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 50e6);
        vm.expectRevert(PipelineOrchestrator.DeadlineInPast.selector);
        orchestrator.createPipeline(aliceAgentId, stages, address(usdc), block.timestamp - 1);
        vm.stopPrank();
    }

    function test_createPipeline_revertNotAgentOwner() public {
        PipelineOrchestrator.StageParam[] memory stages = new PipelineOrchestrator.StageParam[](1);
        stages[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });

        vm.startPrank(bob); // bob doesn't own aliceAgentId
        usdc.approve(address(orchestrator), 50e6);
        vm.expectRevert(PipelineOrchestrator.NotAgentOwner.selector);
        orchestrator.createPipeline(aliceAgentId, stages, address(usdc), block.timestamp + 1 days);
        vm.stopPrank();
    }

    // --- Stage Advancement Tests ---

    function test_onStageCompleted_advancesToNextStage() public {
        uint256 pipelineId = _createTwoStagePipeline();

        // CommerceHook calls onStageCompleted after evaluating stage 0
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        // Pipeline should be at stage 1 now
        (,,,, uint256 currentStage,,,,) = orchestrator.pipelines(pipelineId);
        assertEq(currentStage, 1);
    }

    function test_onStageCompleted_lastStage_completesPipeline() public {
        uint256 pipelineId = _createTwoStagePipeline();

        // Complete stage 0
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        // Complete stage 1 (last)
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 1);

        (,,,,, uint256 stageCount, PipelineOrchestrator.PipelineStatus status,,) =
            orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Completed));
    }

    // --- Cancellation Tests ---

    function test_cancelPipeline() public {
        uint256 pipelineId = _createTwoStagePipeline();

        uint256 balanceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        orchestrator.cancelPipeline(pipelineId);

        (,,,,,,PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Cancelled));

        // Should get refund of unspent budget (full 80 USDC since no stage completed)
        assertEq(usdc.balanceOf(alice), balanceBefore + 80e6);
    }

    function test_cancelPipeline_afterOneStage() public {
        uint256 pipelineId = _createTwoStagePipeline();

        // Complete stage 0 (50 USDC spent)
        vm.prank(address(hook));
        orchestrator.onStageCompleted(pipelineId, 0);

        uint256 balanceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        orchestrator.cancelPipeline(pipelineId);

        // Should refund 30 USDC (stage 1 budget)
        assertEq(usdc.balanceOf(alice), balanceBefore + 30e6);
    }

    function test_cancelPipeline_revertNotClient() public {
        uint256 pipelineId = _createTwoStagePipeline();

        vm.prank(bob);
        vm.expectRevert(PipelineOrchestrator.NotPipelineClient.selector);
        orchestrator.cancelPipeline(pipelineId);
    }

    // --- Halt Tests ---

    function test_onStageRejected_haltsPipeline() public {
        uint256 pipelineId = _createTwoStagePipeline();

        uint256 balanceBefore = usdc.balanceOf(alice);

        vm.prank(address(hook));
        orchestrator.onStageRejected(pipelineId, 0);

        (,,,,,,PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Halted));

        // Refund remaining: 30 USDC (stage 1). Stage 0's 50 USDC was in ERC-8183 escrow
        // and gets refunded by ERC-8183's reject(). Orchestrator refunds unstarted stages.
        assertEq(usdc.balanceOf(alice), balanceBefore + 30e6);
    }

    // --- Policy Integration ---

    function test_createPipeline_policyCheck() public {
        // Set policy: max 40 USDC daily
        vm.prank(alice);
        policy.setPolicy(alice, 100e6, 40e6);

        PipelineOrchestrator.StageParam[] memory stages = new PipelineOrchestrator.StageParam[](1);
        stages[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 50e6);
        vm.expectRevert(); // AgentPolicy.ExceedsDailyLimit
        orchestrator.createPipeline(aliceAgentId, stages, address(usdc), block.timestamp + 1 days);
        vm.stopPrank();
    }
}
```

**Step 2: Run tests to verify fail**

Run: `forge test --match-contract PipelineOrchestratorTest -v`
Expected: FAIL

**Step 3: Implement PipelineOrchestrator**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {CommerceHook} from "./CommerceHook.sol";
import {AgentPolicy} from "./AgentPolicy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

contract PipelineOrchestrator is Initializable, UUPSUpgradeable, PausableUpgradeable, Ownable2StepUpgradeable {
    using SafeERC20 for IERC20;

    // --- Errors ---
    error NoStages();
    error DeadlineInPast();
    error NotAgentOwner();
    error NotPipelineClient();
    error NotCommerceHook();
    error PipelineNotActive();
    error WrongStage();
    error UnsupportedCurrency();

    // --- Events ---
    event PipelineCreated(uint256 indexed pipelineId, uint256 indexed clientAgentId, uint256 stageCount, uint256 totalBudget, address currency);
    event StageActivated(uint256 indexed pipelineId, uint256 stageIndex, uint256 indexed jobId);
    event PipelineCompleted(uint256 indexed pipelineId, uint256 totalSpent);
    event PipelineHalted(uint256 indexed pipelineId, uint256 failedStage, uint256 refundAmount);
    event PipelineCancelled(uint256 indexed pipelineId, uint256 refundAmount);

    // --- Enums ---
    enum StageStatus { Pending, Active, Completed, Failed }
    enum PipelineStatus { Active, Completed, Halted, Cancelled }

    // --- Structs ---
    struct StageParam {
        uint256 providerAgentId;
        address providerAddress;
        bytes32 capabilityHash;
        uint256 budget;
    }

    struct Stage {
        uint256 providerAgentId;
        address providerAddress;
        bytes32 capabilityHash;
        uint256 budget;
        uint256 jobId;
        StageStatus status;
    }

    struct Pipeline {
        uint256 clientAgentId;
        address client;
        address currency;
        uint256 totalBudget;
        uint256 totalSpent;
        uint256 currentStage;
        uint256 stageCount;
        PipelineStatus status;
        uint256 createdAt;
        uint256 deadline;
    }

    // --- State ---
    IAgenticCommerce public acp;
    IERC20 public usdc;
    IERC8004Identity public identityRegistry;
    CommerceHook public commerceHook;
    AgentPolicy public agentPolicy;

    mapping(address => bool) public supportedCurrencies;
    mapping(uint256 => Pipeline) public pipelines;
    mapping(uint256 => mapping(uint256 => Stage)) public stages;
    mapping(address => uint256[]) internal _clientPipelines;
    uint256 public nextPipelineId;

    // --- Initializer ---
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address acp_,
        address usdc_,
        address identityRegistry_,
        address commerceHook_,
        address agentPolicy_,
        address owner_
    ) external initializer {
        __Ownable_init(owner_);
        __Pausable_init();
        __UUPSUpgradeable_init();
        acp = IAgenticCommerce(acp_);
        usdc = IERC20(usdc_);
        identityRegistry = IERC8004Identity(identityRegistry_);
        commerceHook = CommerceHook(commerceHook_);
        agentPolicy = AgentPolicy(agentPolicy_);
        supportedCurrencies[usdc_] = true;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // --- Admin ---
    function addSupportedCurrency(address currency) external onlyOwner {
        supportedCurrencies[currency] = true;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // --- Pipeline Creation ---
    function createPipeline(
        uint256 clientAgentId,
        StageParam[] calldata stageParams,
        address currency,
        uint256 deadline
    ) external whenNotPaused returns (uint256) {
        if (stageParams.length == 0) revert NoStages();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (!supportedCurrencies[currency]) revert UnsupportedCurrency();
        if (identityRegistry.ownerOf(clientAgentId) != msg.sender) revert NotAgentOwner();

        uint256 totalBudget;
        for (uint256 i; i < stageParams.length; i++) {
            totalBudget += stageParams[i].budget;
        }

        // Policy check on total budget
        agentPolicy.checkPipelineBudget(msg.sender, totalBudget);

        // Pull total budget from client
        IERC20(currency).safeTransferFrom(msg.sender, address(this), totalBudget);

        // Store pipeline
        uint256 pipelineId = ++nextPipelineId;
        pipelines[pipelineId] = Pipeline({
            clientAgentId: clientAgentId,
            client: msg.sender,
            currency: currency,
            totalBudget: totalBudget,
            totalSpent: 0,
            currentStage: 0,
            stageCount: stageParams.length,
            status: PipelineStatus.Active,
            createdAt: block.timestamp,
            deadline: deadline
        });

        for (uint256 i; i < stageParams.length; i++) {
            stages[pipelineId][i] = Stage({
                providerAgentId: stageParams[i].providerAgentId,
                providerAddress: stageParams[i].providerAddress,
                capabilityHash: stageParams[i].capabilityHash,
                budget: stageParams[i].budget,
                jobId: 0,
                status: StageStatus.Pending
            });
        }

        _clientPipelines[msg.sender].push(pipelineId);

        // Register client with hook
        commerceHook.setPipelineClient(pipelineId, msg.sender);

        // Activate first stage
        _activateStage(pipelineId, 0);

        emit PipelineCreated(pipelineId, clientAgentId, stageParams.length, totalBudget, currency);
        return pipelineId;
    }

    // --- Stage Management (called by CommerceHook) ---
    function onStageCompleted(uint256 pipelineId, uint256 stageIndex) external {
        if (msg.sender != address(commerceHook)) revert NotCommerceHook();
        Pipeline storage p = pipelines[pipelineId];
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();
        if (stageIndex != p.currentStage) revert WrongStage();

        Stage storage s = stages[pipelineId][stageIndex];
        s.status = StageStatus.Completed;
        p.totalSpent += s.budget;

        uint256 nextStage = stageIndex + 1;
        if (nextStage < p.stageCount) {
            p.currentStage = nextStage;
            _activateStage(pipelineId, nextStage);
        } else {
            // All stages complete
            p.status = PipelineStatus.Completed;
            // Refund any dust (shouldn't happen but safety)
            uint256 remaining = p.totalBudget - p.totalSpent;
            if (remaining > 0) {
                IERC20(p.currency).safeTransfer(p.client, remaining);
            }
            emit PipelineCompleted(pipelineId, p.totalSpent);
        }
    }

    function onStageRejected(uint256 pipelineId, uint256 stageIndex) external {
        if (msg.sender != address(commerceHook)) revert NotCommerceHook();
        Pipeline storage p = pipelines[pipelineId];
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();

        stages[pipelineId][stageIndex].status = StageStatus.Failed;
        p.status = PipelineStatus.Halted;

        // Refund unstarted stage budgets
        uint256 refund;
        for (uint256 i = stageIndex + 1; i < p.stageCount; i++) {
            stages[pipelineId][i].status = StageStatus.Failed;
            refund += stages[pipelineId][i].budget;
        }

        if (refund > 0) {
            IERC20(p.currency).safeTransfer(p.client, refund);
        }

        emit PipelineHalted(pipelineId, stageIndex, refund);
    }

    // --- Client Actions ---
    function cancelPipeline(uint256 pipelineId) external {
        Pipeline storage p = pipelines[pipelineId];
        if (p.client != msg.sender) revert NotPipelineClient();
        if (p.status != PipelineStatus.Active) revert PipelineNotActive();

        p.status = PipelineStatus.Cancelled;

        // Refund all unspent budget
        uint256 refund = p.totalBudget - p.totalSpent;

        // Mark remaining stages as failed
        for (uint256 i = p.currentStage; i < p.stageCount; i++) {
            if (stages[pipelineId][i].status == StageStatus.Pending) {
                stages[pipelineId][i].status = StageStatus.Failed;
            }
        }

        if (refund > 0) {
            IERC20(p.currency).safeTransfer(p.client, refund);
        }

        emit PipelineCancelled(pipelineId, refund);
    }

    // --- View ---
    function getStages(uint256 pipelineId) external view returns (Stage[] memory) {
        uint256 count = pipelines[pipelineId].stageCount;
        Stage[] memory result = new Stage[](count);
        for (uint256 i; i < count; i++) {
            result[i] = stages[pipelineId][i];
        }
        return result;
    }

    function getClientPipelines(address client) external view returns (uint256[] memory) {
        return _clientPipelines[client];
    }

    // --- Internal ---
    function _activateStage(uint256 pipelineId, uint256 stageIndex) internal {
        Stage storage s = stages[pipelineId][stageIndex];
        Pipeline storage p = pipelines[pipelineId];

        // Create ERC-8183 job: provider, evaluator=hook, expiry, description, hook=hook
        // The orchestrator is the "client" on ERC-8183 (holds the funds)
        // We need to approve USDC to ACP for this stage's budget
        IERC20(p.currency).approve(address(acp), s.budget);

        uint256 jobId = acp.createJob(
            s.providerAddress,
            address(commerceHook), // evaluator
            p.deadline,
            "", // description (stored off-chain)
            address(commerceHook)  // hook
        );

        s.jobId = jobId;
        s.status = StageStatus.Active;

        // Register with hook so it knows this job belongs to this pipeline
        commerceHook.registerPipelineJob(pipelineId, stageIndex, jobId, s.providerAgentId, p.clientAgentId);

        emit StageActivated(pipelineId, stageIndex, jobId);
    }
}
```

**Step 4: Run tests**

Run: `forge test --match-contract PipelineOrchestratorTest -v`
Expected: Tests pass (some may need adjustments for the ERC-8183 mock flow — setBudget is provider-called, so the mock needs to handle the orchestrator calling createJob as client)

**Step 5: Debug and fix any issues**

The key complexity: PipelineOrchestrator calls `acp.createJob()` which makes the orchestrator the `client` on ERC-8183. The actual pipeline client's funds are held by the orchestrator. This is correct — the orchestrator is an escrow for the pipeline, and each stage's budget gets escrowed again in ERC-8183.

Note: In the real ERC-8183, after `createJob`, the provider must call `setBudget` and then the client (orchestrator) calls `fund`. The mock simplifies this. For the real deployment, we'll need the provider to call `setBudget` before the orchestrator can `fund`.

**Step 6: Commit**

```bash
git add src/PipelineOrchestrator.sol test/PipelineOrchestrator.t.sol
git commit -m "feat: add PipelineOrchestrator for multi-stage agent workflows

Creates ERC-8183 jobs per stage, chains them with conditional advancement.
Atomic funding, partial refunds on halt/cancel. Policy enforcement on
pipeline creation. CommerceHook as evaluator + hook on all jobs."
```

---

## Task 5: Integration Tests

**Files:**
- Create: `test/Integration.t.sol`

**Step 1: Write full lifecycle integration test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PipelineOrchestrator} from "../src/PipelineOrchestrator.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";
import {MockAgenticCommerce} from "./mocks/MockAgenticCommerce.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockReputationRegistry} from "./mocks/MockReputationRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IAgenticCommerce} from "../src/interfaces/IAgenticCommerce.sol";

contract IntegrationTest is Test {
    PipelineOrchestrator orchestrator;
    CommerceHook hook;
    AgentPolicy policy;
    MockAgenticCommerce acp;
    MockIdentityRegistry identity;
    MockReputationRegistry reputation;
    MockUSDC usdc;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    uint256 aliceAgentId;
    uint256 bobAgentId;
    uint256 charlieAgentId;

    function setUp() public {
        vm.startPrank(deployer);

        usdc = new MockUSDC();
        acp = new MockAgenticCommerce();
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();

        AgentPolicy policyImpl = new AgentPolicy();
        ERC1967Proxy policyProxy = new ERC1967Proxy(
            address(policyImpl),
            abi.encodeCall(AgentPolicy.initialize, (address(identity), deployer))
        );
        policy = AgentPolicy(address(policyProxy));

        CommerceHook hookImpl = new CommerceHook();
        ERC1967Proxy hookProxy = new ERC1967Proxy(
            address(hookImpl),
            abi.encodeCall(CommerceHook.initialize, (
                address(acp), address(identity), address(reputation), deployer
            ))
        );
        hook = CommerceHook(address(hookProxy));

        PipelineOrchestrator orchImpl = new PipelineOrchestrator();
        ERC1967Proxy orchProxy = new ERC1967Proxy(
            address(orchImpl),
            abi.encodeCall(PipelineOrchestrator.initialize, (
                address(acp), address(usdc), address(identity),
                address(hook), address(policy), deployer
            ))
        );
        orchestrator = PipelineOrchestrator(address(orchProxy));

        hook.setOrchestrator(address(orchestrator));
        policy.setOrchestrator(address(orchestrator));

        vm.stopPrank();

        vm.prank(alice);
        aliceAgentId = identity.register("ipfs://alice");
        vm.prank(bob);
        bobAgentId = identity.register("ipfs://bob");
        vm.prank(charlie);
        charlieAgentId = identity.register("ipfs://charlie");

        usdc.mint(alice, 1_000_000e6);
    }

    function test_fullPipelineLifecycle() public {
        // 1. Alice creates 2-stage pipeline: audit (bob, 50) → deploy (charlie, 30)
        PipelineOrchestrator.StageParam[] memory stageParams = new PipelineOrchestrator.StageParam[](2);
        stageParams[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });
        stageParams[1] = PipelineOrchestrator.StageParam({
            providerAgentId: charlieAgentId,
            providerAddress: charlie,
            capabilityHash: keccak256("deploy"),
            budget: 30e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 80e6);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, stageParams, address(usdc), block.timestamp + 1 days
        );
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 1_000_000e6 - 80e6);

        // 2. Stage 0 is active, ERC-8183 job created
        PipelineOrchestrator.Stage[] memory allStages = orchestrator.getStages(pipelineId);
        assertEq(uint8(allStages[0].status), uint8(PipelineOrchestrator.StageStatus.Active));
        assertTrue(allStages[0].jobId > 0);
        assertEq(uint8(allStages[1].status), uint8(PipelineOrchestrator.StageStatus.Pending));

        // 3. Bob submits work on ERC-8183 (simulated)
        uint256 job1Id = allStages[0].jobId;
        acp.mockSetStatus(job1Id, IAgenticCommerce.JobStatus.Submitted);

        // 4. Alice approves stage 0
        vm.prank(alice);
        hook.approveStage(job1Id);

        // 5. Stage 1 should now be active
        allStages = orchestrator.getStages(pipelineId);
        assertEq(uint8(allStages[0].status), uint8(PipelineOrchestrator.StageStatus.Completed));
        assertEq(uint8(allStages[1].status), uint8(PipelineOrchestrator.StageStatus.Active));

        // 6. Charlie submits work
        uint256 job2Id = allStages[1].jobId;
        acp.mockSetStatus(job2Id, IAgenticCommerce.JobStatus.Submitted);

        // 7. Alice approves stage 1
        vm.prank(alice);
        hook.approveStage(job2Id);

        // 8. Pipeline should be completed
        (,,,,,,PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Completed));
    }

    function test_pipelineHaltOnReject() public {
        PipelineOrchestrator.StageParam[] memory stageParams = new PipelineOrchestrator.StageParam[](2);
        stageParams[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });
        stageParams[1] = PipelineOrchestrator.StageParam({
            providerAgentId: charlieAgentId,
            providerAddress: charlie,
            capabilityHash: keccak256("deploy"),
            budget: 30e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 80e6);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, stageParams, address(usdc), block.timestamp + 1 days
        );
        vm.stopPrank();

        // Bob submits
        PipelineOrchestrator.Stage[] memory allStages = orchestrator.getStages(pipelineId);
        acp.mockSetStatus(allStages[0].jobId, IAgenticCommerce.JobStatus.Submitted);

        uint256 balanceBefore = usdc.balanceOf(alice);

        // Alice rejects stage 0
        vm.prank(alice);
        hook.rejectStage(allStages[0].jobId, "bad audit");

        // Pipeline halted, stage 1 budget (30 USDC) refunded
        (,,,,,,PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Halted));
        assertEq(usdc.balanceOf(alice), balanceBefore + 30e6);
    }

    function test_pipelineWithAutoApprove() public {
        PipelineOrchestrator.StageParam[] memory stageParams = new PipelineOrchestrator.StageParam[](1);
        stageParams[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 50e6);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, stageParams, address(usdc), block.timestamp + 1 days
        );

        // Enable auto-approve
        hook.setAutoApprove(pipelineId, true);
        vm.stopPrank();

        // Bob submits — ACP calls afterAction on hook
        PipelineOrchestrator.Stage[] memory allStages = orchestrator.getStages(pipelineId);
        acp.mockSetStatus(allStages[0].jobId, IAgenticCommerce.JobStatus.Submitted);

        bytes4 submitSelector = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
        vm.prank(address(acp));
        hook.afterAction(allStages[0].jobId, submitSelector, abi.encode(bob, bytes32(0), ""));

        // Pipeline should be auto-completed
        (,,,,,,PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Completed));
    }

    function test_pipelineWithPolicy() public {
        // Set policy: max 50 per tx, max 200 daily
        vm.prank(alice);
        policy.setPolicy(alice, 50e6, 200e6);

        PipelineOrchestrator.StageParam[] memory stageParams = new PipelineOrchestrator.StageParam[](2);
        stageParams[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });
        stageParams[1] = PipelineOrchestrator.StageParam({
            providerAgentId: charlieAgentId,
            providerAddress: charlie,
            capabilityHash: keccak256("deploy"),
            budget: 30e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 80e6);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, stageParams, address(usdc), block.timestamp + 1 days
        );
        vm.stopPrank();

        // Should succeed (total 80 < daily 200, each stage < perTx 50... wait, stage 0 is 50 = maxPerTx)
        // This should work since 50 == maxPerTx (not exceeds)
        assertTrue(pipelineId > 0);
    }

    function test_singleStagePipeline() public {
        // A 1-stage pipeline is equivalent to a single job hire
        PipelineOrchestrator.StageParam[] memory stageParams = new PipelineOrchestrator.StageParam[](1);
        stageParams[0] = PipelineOrchestrator.StageParam({
            providerAgentId: bobAgentId,
            providerAddress: bob,
            capabilityHash: keccak256("audit"),
            budget: 50e6
        });

        vm.startPrank(alice);
        usdc.approve(address(orchestrator), 50e6);
        uint256 pipelineId = orchestrator.createPipeline(
            aliceAgentId, stageParams, address(usdc), block.timestamp + 1 days
        );
        vm.stopPrank();

        PipelineOrchestrator.Stage[] memory allStages = orchestrator.getStages(pipelineId);
        acp.mockSetStatus(allStages[0].jobId, IAgenticCommerce.JobStatus.Submitted);

        vm.prank(alice);
        hook.approveStage(allStages[0].jobId);

        (,,,,,,PipelineOrchestrator.PipelineStatus status,,) = orchestrator.pipelines(pipelineId);
        assertEq(uint8(status), uint8(PipelineOrchestrator.PipelineStatus.Completed));
    }
}
```

**Step 2: Run tests**

Run: `forge test --match-contract IntegrationTest -v`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add test/Integration.t.sol
git commit -m "test: add integration tests for full pipeline lifecycle

Tests: creation, stage advancement, completion, halt on reject,
auto-approve, policy enforcement, single-stage pipelines."
```

---

## Task 6: Deploy Script

**Files:**
- Create: `script/DeployV3.s.sol`

**Step 1: Write deploy script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PipelineOrchestrator} from "../src/PipelineOrchestrator.sol";
import {CommerceHook} from "../src/CommerceHook.sol";
import {AgentPolicy} from "../src/AgentPolicy.sol";

contract DeployV3Script is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Arc Testnet addresses
        address ACP = 0x0747EEf0706327138c69792bF28Cd525089e4583;
        address USDC = 0x3600000000000000000000000000000000000000;
        address EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
        address IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
        address REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

        vm.startBroadcast(deployerKey);

        // 1. Deploy AgentPolicy
        AgentPolicy policyImpl = new AgentPolicy();
        ERC1967Proxy policyProxy = new ERC1967Proxy(
            address(policyImpl),
            abi.encodeCall(AgentPolicy.initialize, (IDENTITY, deployer))
        );
        AgentPolicy policy = AgentPolicy(address(policyProxy));

        // 2. Deploy CommerceHook
        CommerceHook hookImpl = new CommerceHook();
        ERC1967Proxy hookProxy = new ERC1967Proxy(
            address(hookImpl),
            abi.encodeCall(CommerceHook.initialize, (ACP, IDENTITY, REPUTATION, deployer))
        );
        CommerceHook hook = CommerceHook(address(hookProxy));

        // 3. Deploy PipelineOrchestrator
        PipelineOrchestrator orchImpl = new PipelineOrchestrator();
        ERC1967Proxy orchProxy = new ERC1967Proxy(
            address(orchImpl),
            abi.encodeCall(PipelineOrchestrator.initialize, (
                ACP, USDC, IDENTITY, address(hookProxy), address(policyProxy), deployer
            ))
        );
        PipelineOrchestrator orchestrator = PipelineOrchestrator(address(orchProxy));

        // 4. Wire up
        hook.setOrchestrator(address(orchProxy));
        policy.setOrchestrator(address(orchProxy));

        // 5. Add EURC as supported currency
        orchestrator.addSupportedCurrency(EURC);

        vm.stopBroadcast();

        // Log addresses
        console.log("=== V3 Deployed ===");
        console.log("AgentPolicy:", address(policyProxy));
        console.log("CommerceHook:", address(hookProxy));
        console.log("PipelineOrchestrator:", address(orchProxy));
    }
}
```

**Step 2: Dry-run**

Run: `forge script script/DeployV3.s.sol --rpc-url https://rpc.testnet.arc.network -v`
Expected: Simulation succeeds

**Step 3: Deploy to Arc Testnet**

Run: `forge script script/DeployV3.s.sol --rpc-url https://rpc.testnet.arc.network --private-key $PK --broadcast`
Expected: 6 contracts deployed (3 impls + 3 proxies), wiring transactions succeed

**Step 4: Commit**

```bash
git add script/DeployV3.s.sol
git commit -m "feat: add v3 deploy script for Arc Testnet

Deploys AgentPolicy, CommerceHook, PipelineOrchestrator via UUPS proxy.
Wires orchestrator as hook's orchestrator and policy's orchestrator.
Adds EURC as supported currency."
```

---

## Task 7: Python SDK v2

**Files:**
- Modify: `sdk/src/arc_commerce/client.py`
- Modify: `sdk/src/arc_commerce/constants.py`
- Modify: `sdk/src/arc_commerce/types.py`
- Create: `sdk/src/arc_commerce/abi/PipelineOrchestrator.json`
- Create: `sdk/src/arc_commerce/abi/CommerceHook.json`
- Create: `sdk/src/arc_commerce/abi/AgentPolicy.json`
- Modify: `sdk/src/arc_commerce/__init__.py`
- Update: `sdk/tests/` with pipeline tests

**Step 1: Export v3 ABIs from Foundry**

Run:
```bash
cd "C:/Users/GUDMAN/Desktop/Github files/arc-agent-commerce"
# Extract ABI from build artifacts
python -c "import json; d=json.load(open('out/PipelineOrchestrator.sol/PipelineOrchestrator.json')); json.dump(d['abi'], open('sdk/src/arc_commerce/abi/PipelineOrchestrator.json','w'), indent=2)"
python -c "import json; d=json.load(open('out/CommerceHook.sol/CommerceHook.json')); json.dump(d['abi'], open('sdk/src/arc_commerce/abi/CommerceHook.json','w'), indent=2)"
python -c "import json; d=json.load(open('out/AgentPolicy.sol/AgentPolicy.json')); json.dump(d['abi'], open('sdk/src/arc_commerce/abi/AgentPolicy.json','w'), indent=2)"
```

**Step 2: Update constants.py with v3 addresses**

Add v3 contract addresses (filled in after deployment):
```python
# V3 contracts (deployed after Task 6)
PIPELINE_ORCHESTRATOR_ADDRESS = ""  # Fill after deploy
COMMERCE_HOOK_ADDRESS = ""          # Fill after deploy
AGENT_POLICY_ADDRESS = ""           # Fill after deploy

# ERC-8183 (Arc native)
AGENTIC_COMMERCE_ADDRESS = "0x0747EEf0706327138c69792bF28Cd525089e4583"

# Additional tokens
EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"
```

**Step 3: Add Pipeline types to types.py**

```python
from enum import IntEnum
from dataclasses import dataclass

class StageStatus(IntEnum):
    PENDING = 0
    ACTIVE = 1
    COMPLETED = 2
    FAILED = 3

class PipelineStatus(IntEnum):
    ACTIVE = 0
    COMPLETED = 1
    HALTED = 2
    CANCELLED = 3

@dataclass
class Stage:
    provider_agent_id: int
    provider_address: str
    capability_hash: bytes
    budget: int
    job_id: int
    status: StageStatus

    @property
    def budget_usdc(self) -> float:
        return self.budget / 1e6

@dataclass
class Pipeline:
    pipeline_id: int
    client_agent_id: int
    client: str
    currency: str
    total_budget: int
    total_spent: int
    current_stage: int
    stage_count: int
    status: PipelineStatus
    created_at: int
    deadline: int

    @property
    def total_budget_usdc(self) -> float:
        return self.total_budget / 1e6
```

**Step 4: Add pipeline methods to client.py**

Add to `ArcCommerce` class:
```python
def create_pipeline(self, client_agent_id, stages, currency="USDC", deadline_hours=24, auto_approve=True):
    """Create a multi-stage pipeline.
    stages: list of {"provider_agent_id": int, "provider_address": str, "capability": str, "budget_usdc": float}
    """
    ...

def cancel_pipeline(self, pipeline_id):
    ...

def approve_stage(self, job_id):
    ...

def reject_stage(self, job_id, reason):
    ...

def get_pipeline(self, pipeline_id):
    ...

def get_stages(self, pipeline_id):
    ...

def get_client_pipelines(self, address=None):
    ...

def hire_pipeline(self, capabilities, deadline_hours=24, auto_approve=True):
    """Convenience: find best agent for each capability, create pipeline."""
    ...
```

**Step 5: Write SDK tests**

**Step 6: Commit**

```bash
git add sdk/
git commit -m "feat: add pipeline support to Python SDK

New methods: create_pipeline, cancel_pipeline, approve_stage, reject_stage,
get_pipeline, get_stages, hire_pipeline. New types: Pipeline, Stage,
PipelineStatus, StageStatus. V3 contract ABIs included."
```

---

## Task 8: LangChain Adapter

**Files:**
- Create: `sdk/src/arc_commerce/langchain.py`
- Update: `sdk/examples/langchain_tool.py`

**Step 1: Implement LangChain tools**

```python
"""LangChain tool wrappers for Arc Agent Commerce Protocol."""
from langchain.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional
from arc_commerce import ArcCommerce

class PipelineInput(BaseModel):
    capabilities: list[str] = Field(description="Ordered list of capabilities needed, e.g. ['smart_contract_audit', 'contract_deployment']")
    deadline_hours: int = Field(default=24, description="Hours until pipeline expires")

class ArcPipelineTool(BaseTool):
    name: str = "arc_create_pipeline"
    description: str = "Create a multi-stage agent workflow on Arc. Finds the best agent for each capability and creates an escrowed pipeline. Returns pipeline ID and stage details."
    args_schema: type = PipelineInput
    client: ArcCommerce

    def __init__(self, private_key: str, **kwargs):
        super().__init__(client=ArcCommerce(private_key=private_key), **kwargs)

    def _run(self, capabilities: list[str], deadline_hours: int = 24) -> str:
        pipeline_id = self.client.hire_pipeline(capabilities, deadline_hours=deadline_hours)
        pipeline = self.client.get_pipeline(pipeline_id)
        stages = self.client.get_stages(pipeline_id)
        return f"Pipeline #{pipeline_id} created: {len(stages)} stages, {pipeline.total_budget_usdc} USDC total"

class DiscoverInput(BaseModel):
    capability: str = Field(description="The capability to search for, e.g. 'smart_contract_audit'")

class ArcDiscoverTool(BaseTool):
    name: str = "arc_find_agents"
    description: str = "Find agents on Arc that can perform a specific capability. Returns agent IDs, names, prices, and verification status."
    args_schema: type = DiscoverInput
    client: ArcCommerce

    def __init__(self, rpc_url: str = None, **kwargs):
        super().__init__(client=ArcCommerce(rpc_url=rpc_url), **kwargs)

    def _run(self, capability: str) -> str:
        agents = self.client.find_agents(capability)
        if not agents:
            return f"No agents found for capability '{capability}'"
        lines = [f"Found {len(agents)} agents for '{capability}':"]
        for a in agents:
            lines.append(f"  Agent #{a.agent_id}: {a.name} — {a.price_usdc} USDC {'[VERIFIED]' if a.verified else ''}")
        return "\n".join(lines)
```

**Step 2: Update example**

**Step 3: Commit**

```bash
git add sdk/src/arc_commerce/langchain.py sdk/examples/langchain_tool.py
git commit -m "feat: add LangChain adapter for pipeline creation and agent discovery"
```

---

## Task 9: Live Demo (3 Autonomous Agents)

**Files:**
- Create: `sdk/examples/pipeline_demo.py`
- Create: `sdk/examples/demo_service.py` (systemd wrapper)

**Step 1: Write the autonomous demo script**

The demo runs 3 agents in a loop:
1. BUILDER creates "audit → deploy" pipeline
2. AUDITOR watches for jobs, submits deliverable
3. DEPLOYER watches for jobs, submits deliverable
4. BUILDER auto-approves (or manually approves)
5. Repeat every 10 minutes

**Step 2: Create systemd service file for VPS**

**Step 3: Test locally**

**Step 4: Deploy to VPS**

**Step 5: Commit**

```bash
git add sdk/examples/pipeline_demo.py sdk/examples/demo_service.py
git commit -m "feat: add 3-agent autonomous pipeline demo

BUILDER creates audit→deploy pipelines, AUDITOR and DEPLOYER pick up
jobs and submit deliverables. Runs continuously on VPS."
```

---

## Task 10: Frontend v3

**Files:**
- Modify: `frontend/src/app/page.tsx` — Replace tabs
- Create: `frontend/src/components/PipelineBuilder.tsx`
- Create: `frontend/src/components/PipelineTracker.tsx`
- Create: `frontend/src/components/AgentDiscovery.tsx`
- Create: `frontend/src/components/MyPipelines.tsx`
- Modify: `frontend/src/config.ts` — Add v3 contract addresses
- Create: `frontend/src/abi/PipelineOrchestrator.json`
- Create: `frontend/src/abi/CommerceHook.json`
- Create: `frontend/src/abi/AgentPolicy.json`

**Step 1: Update config.ts with v3 addresses and ABI imports**

**Step 2: Build PipelineBuilder component**
- Sequential form: add stages one by one
- Select currency (USDC/EURC)
- Set global deadline
- USDC approve → createPipeline in one flow
- Validation: agent exists, budget > 0, deadline > now

**Step 3: Build PipelineTracker component**
- Visual stage progression bar
- Status badges per stage
- Approve/Reject buttons for submitted stages
- Cancel button for active pipelines

**Step 4: Build AgentDiscovery component**
- Search by capability
- Show agent metadata (from ERC-8004 tokenURI)
- Show validation status badge
- Show reputation score

**Step 5: Build MyPipelines component**
- List client's pipelines with status
- Click to expand → shows PipelineTracker

**Step 6: Update page.tsx**
- Tabs: Dashboard, Discover Agents, Create Pipeline, My Pipelines, Spending Policy, Admin

**Step 7: Build and test locally**

Run: `cd frontend && npm run build`

**Step 8: Deploy to VPS**

**Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: frontend v3 with pipeline builder and stage tracker

New components: PipelineBuilder, PipelineTracker, AgentDiscovery, MyPipelines.
Replaces v2 service/agreement tabs with pipeline-centric UI."
```

---

## Task 11: Update BUILDERS_FUND.md and README

**Files:**
- Modify: `BUILDERS_FUND.md`
- Modify: `README.md`

**Step 1: Rewrite BUILDERS_FUND.md with the new pitch**

Focus on: pipeline orchestration, ERC-8183 native, full ERC-8004 stack, why Arc is necessary.

**Step 2: Rewrite README.md**

Update architecture diagram, contract addresses, SDK examples, demo instructions.

**Step 3: Commit**

```bash
git add BUILDERS_FUND.md README.md
git commit -m "docs: update pitch and README for v3 pipeline architecture"
```

---

## Task 12: CI Update

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Update CI to test v3 contracts**

Add separate test jobs for each contract:
```yaml
- name: Test CommerceHook
  run: forge test --match-contract CommerceHookTest -v
- name: Test AgentPolicy
  run: forge test --match-contract AgentPolicyTest -v
- name: Test PipelineOrchestrator
  run: forge test --match-contract PipelineOrchestratorTest -v
- name: Test Integration
  run: forge test --match-contract IntegrationTest -v
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: update test workflow for v3 contracts"
```

---

## Execution Order

```
Task 1: Interfaces (no dependencies)
Task 2: CommerceHook (depends on Task 1)
Task 3: AgentPolicy (depends on Task 1)
Task 4: PipelineOrchestrator (depends on Tasks 2, 3)
Task 5: Integration Tests (depends on Task 4)
Task 6: Deploy Script (depends on Task 4)
Task 7: Python SDK (depends on Task 6 for addresses)
Task 8: LangChain Adapter (depends on Task 7)
Task 9: Live Demo (depends on Task 7)
Task 10: Frontend (depends on Task 6 for addresses)
Task 11: Docs (depends on all above)
Task 12: CI (depends on Tasks 2-5)
```

Tasks 2+3 can run in parallel. Tasks 7+10+12 can run in parallel after Task 6. Tasks 8+9 can run in parallel after Task 7.
