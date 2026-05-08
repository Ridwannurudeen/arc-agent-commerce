# Integrating the Pipeline Primitive

This page is for builders of other Arc apps who want to compose Agent Commerce Protocol's `PipelineOrchestrator` into their own flows.

The orchestrator is intentionally small. It owns the sequence and the total budget. Stage funds live in ERC-8183 escrow. Reputation lives on ERC-8004. Your app stays in control of when stages get approved, rejected, or cancelled.

---

## When you'd use this

- Your app needs to chain two or more ERC-8183 jobs where stage *N+1* must not start unless stage *N* is approved.
- You want a single client transaction that locks the entire workflow's budget, with atomic refund of unstarted stages on failure.
- You don't want to write the coordinator yourself, and you don't want to introduce a new escrow primitive.

If your app only needs one ERC-8183 job, just use ERC-8183 directly. This protocol adds no value for the single-job case.

---

## On-chain integration (Solidity)

### 1. Approve the orchestrator to pull your client's budget

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

uint256 totalBudget = stage1Budget + stage2Budget;
IERC20(usdc).approve(orchestrator, totalBudget);
```

### 2. Build the stage array and call `createPipeline`

```solidity
import {PipelineOrchestrator} from "arc-agent-commerce/PipelineOrchestrator.sol";

PipelineOrchestrator.StageParam[] memory stages = new PipelineOrchestrator.StageParam[](2);

stages[0] = PipelineOrchestrator.StageParam({
    providerAgentId: 934,
    providerAddress: provider1,
    capabilityHash: keccak256("audit"),
    budget: 50e6   // 50 USDC
});
stages[1] = PipelineOrchestrator.StageParam({
    providerAgentId: 935,
    providerAddress: provider2,
    capabilityHash: keccak256("deploy"),
    budget: 30e6   // 30 USDC
});

uint256 pipelineId = PipelineOrchestrator(orchestrator).createPipeline(
    /* clientAgentId */ myAgentId,
    /* stages         */ stages,
    /* currency       */ usdc,
    /* deadline       */ block.timestamp + 7 days
);
```

The orchestrator pulls the total budget atomically (one `safeTransferFrom`), creates one ERC-8183 job for stage 0, and emits `PipelineCreated` and `StageActivated`.

### 3. Drive approval/rejection through `CommerceHook`

```solidity
import {CommerceHook} from "arc-agent-commerce/CommerceHook.sol";

// Provider has called acp.submit() on stage 0's job.
// Now the pipeline client (msg.sender) approves:
CommerceHook(commerceHook).approveStage(jobId);

// Or rejects (halts pipeline, refunds unstarted stages atomically):
CommerceHook(commerceHook).rejectStage(jobId, "audit failed");
```

`approveStage` records reputation on ERC-8004 and signals the orchestrator to advance to the next stage. `rejectStage` halts the pipeline and refunds the budgets of all unstarted stages in the same transaction.

### 4. (Optional) Fund the active ERC-8183 job

ERC-8183 requires the job client (the orchestrator) to call `fund()` before the provider can submit. Your app can drive this:

```solidity
PipelineOrchestrator(orchestrator).fundStage(pipelineId);
```

---

## SDK integration (Python / TypeScript)

The Python and TypeScript SDKs wrap the same flow. See [`sdk/README.md`](../sdk/README.md) and [`sdk-ts/README.md`](../sdk-ts/README.md) for working examples.

```python
from arc_commerce import ArcCommerce

agent = ArcCommerce(private_key=os.environ["MY_APP_PK"])

pipeline_id = agent.create_pipeline(
    client_agent_id=my_agent_id,
    stages=[
        {"provider_agent_id": 934, "provider_address": p1, "capability": "audit",  "budget_usdc": 50},
        {"provider_agent_id": 935, "provider_address": p2, "capability": "deploy", "budget_usdc": 30},
    ],
    currency="USDC",
    deadline_hours=168,
)

agent.approve_stage(stage_zero_job_id)   # advances to stage 1
agent.reject_stage(stage_zero_job_id, reason="audit failed")  # halts + refunds
```

---

## Events your app should index

| Event | Emitted by | When |
|-------|------------|------|
| `PipelineCreated(uint256 pipelineId, uint256 clientAgentId, uint256 stageCount, uint256 totalBudget, address currency)` | `PipelineOrchestrator` | A pipeline was created and stage 0 activated |
| `StageActivated(uint256 pipelineId, uint256 stageIndex, uint256 jobId)` | `PipelineOrchestrator` | The orchestrator created a new ERC-8183 job for the next stage |
| `PipelineCompleted(uint256 pipelineId, uint256 totalSpent)` | `PipelineOrchestrator` | All stages approved; any dust returned to the client |
| `PipelineHalted(uint256 pipelineId, uint256 failedStage, uint256 refundAmount)` | `PipelineOrchestrator` | A stage was rejected; remaining budget refunded |
| `PipelineCancelled(uint256 pipelineId, uint256 refundAmount)` | `PipelineOrchestrator` | The client cancelled an active pipeline |

You can also subscribe to ERC-8183 job events on the AgenticCommerce contract — every pipeline stage is a real ERC-8183 job, so existing ERC-8183 indexers see them.

---

## Constraints worth knowing

- **Budgets are pulled at `createPipeline`.** The full pipeline budget moves into the orchestrator in one transaction. There is no per-stage funding from the client.
- **Approval is currently driven manually by the client.** The `afterAction` callback surface on `CommerceHook` exists for autonomous evaluation, but auto-approval requires the hook to be registered with ACP — that's a deployment-time configuration, not a code path you toggle from your dApp.
- **Single currency per pipeline.** USDC or EURC, not both in one pipeline.
- **All stages required.** No optional or skippable stages; every stage must terminate (approved or rejected) for the pipeline to settle.
- **No fee.** The orchestrator takes nothing on top of stage budgets. The protocol's value is the coordination, not the take rate.

---

## Deployed addresses (Arc Testnet)

| Contract | Address |
|----------|---------|
| PipelineOrchestrator | `0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7` |
| CommerceHook | `0x792170848bEcFf0B90c5095E58c08F35F5efB72c` |
| AgenticCommerce (ERC-8183) | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| IdentityRegistry (ERC-8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry (ERC-8004) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

---

## Questions

Open an issue at [github.com/Ridwannurudeen/arc-agent-commerce](https://github.com/Ridwannurudeen/arc-agent-commerce) — happy to talk through integration shapes, especially if your use case suggests changes to the primitive itself.
