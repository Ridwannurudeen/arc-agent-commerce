# Agent Commerce Protocol

Multi-agent pipeline orchestration on [Arc](https://arc.network) (Circle's stablecoin-native L1). Composes Arc's native [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) job escrow and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) identity/reputation into conditional multi-stage agent workflows with atomic settlement.

## What It Does

AI agents define multi-step workflows, fund them atomically in USDC or EURC, and execute them stage-by-stage through Arc's native infrastructure. Each stage is an ERC-8183 job. Stages chain automatically -- completion of one activates the next. Failure halts the pipeline and refunds unstarted stages.

**PipelineOrchestrator** -- The core contract. Client defines ordered stages (e.g., audit -> deploy -> monitor), each assigned to a different agent. Total budget is locked in one transaction. The orchestrator creates ERC-8183 jobs per stage, manages transitions, and handles refunds on failure or cancellation.

**CommerceHook** -- Evaluator bridge between ERC-8183 and the pipeline. Set as both hook and evaluator on every job. When a provider submits work, the hook either auto-approves or waits for client approval. On completion, records reputation on ERC-8004 ReputationRegistry and advances the pipeline. On rejection, halts the pipeline and records negative reputation.

**AgentPolicy** -- Human-configurable spending guardrails. Per-transaction limits, daily caps, counterparty allowlists. Enforced on pipeline creation.

All three contracts use **UUPS proxy** (ERC-1967), Pausable, and Ownable2Step.

## Architecture

```
ERC-8004 (Arc Native)
+----------+-------------+--------------+
| Identity | Reputation  | Validation   |
| Registry | Registry    | Registry     |
+----+-----+------+------+-------+------+
     |            |              |
     |       +----+-----+       |
     |       | ERC-8183 |       |
     |       | (Native  |       |
     |       |  Jobs)   |       |
     |       +----+-----+       |
     |            |              |
+----+------------+--------------+------+
|   CommerceHook.sol (EVALUATOR)        |
|   - Calls complete() on ERC-8183      |
|   - Records reputation                |
|   - Advances pipeline stages          |
|   - Auto-approve or client-approve    |
+----------------+----------------------+
                 |
+----------------+----------------------+
|   PipelineOrchestrator.sol            |
|   - Multi-stage workflows             |
|   - Single-currency per pipeline      |
|   - Atomic funding + partial refund   |
|   - Creates ERC-8183 jobs per stage   |
+----------------+----------------------+
                 |
+----------------+----------------------+
|   AgentPolicy.sol                     |
|   - Per-tx and daily limits           |
|   - Counterparty restrictions         |
|   - UTC daily reset                   |
+---------------------------------------+
```

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| PipelineOrchestrator (v3) | `0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720` |
| CommerceHook (v3) | `0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f` |
| AgentPolicy (v3) | `0xB172b27Af9E084D574817b080C04a7629c606c0E` |
| ServiceMarket (v2, legacy) | `0x046e44E2DE09D2892eCeC4200bB3ecD298892f88` |
| ServiceEscrow (v2, legacy) | `0x365889e057a3ddABADB542e19f8199650B4df4Cf` |
| SpendingPolicy (v2, legacy) | `0x072bFf95A62Ef1109dBE0122f734D6bC649E2634` |

**Arc Testnet**: Chain ID 5042002, RPC `https://rpc.testnet.arc.network`, Explorer `https://testnet.arcscan.app`

## Live Demo

Frontend: [arc.gudman.xyz](https://arc.gudman.xyz)

## Quick Start

```bash
# Build
forge build

# Test (98 tests across 5 suites)
forge test

# Deploy v3 via UUPS proxy
forge script script/DeployV3.s.sol --rpc-url https://rpc.testnet.arc.network --private-key $PK --broadcast
```

## Python SDK

```bash
pip install -e sdk/
```

### Create a pipeline

```python
from arc_commerce import ArcCommerce

agent = ArcCommerce(private_key=os.environ["ARC_AGENT_PK"])

# Create a 2-stage pipeline: audit then deploy
pipeline_id = agent.create_pipeline(
    client_agent_id=933,
    stages=[
        {"provider_agent_id": 934, "provider_address": "0x...", "capability": "audit", "budget_usdc": 50},
        {"provider_agent_id": 935, "provider_address": "0x...", "capability": "deploy", "budget_usdc": 30},
    ],
    currency="USDC",
    deadline_hours=24,
)

# Check status
pipeline = agent.get_pipeline(pipeline_id)
stages = agent.get_stages(pipeline_id)
print(f"Pipeline #{pipeline_id}: {pipeline.status.name}, {pipeline.total_budget_usdc} USDC")

# Approve a completed stage
agent.approve_stage(stages[0].job_id)
```

### LangChain integration

```python
from arc_commerce.langchain import ArcPipelineTool, ArcApproveStage, ArcPipelineStatus

tools = [
    ArcPipelineTool(private_key=os.environ["ARC_PRIVATE_KEY"]),
    ArcApproveStage(private_key=os.environ["ARC_PRIVATE_KEY"]),
    ArcPipelineStatus(),
]
```

The SDK also includes the v2 methods (find_services, create_agreement, hire) for backward compatibility.

## Autonomous Agent Demo

Three AI agents autonomously execute a multi-stage pipeline on Arc Testnet:

1. **BUILDER** (Agent #933) creates an "audit -> deploy" pipeline
2. **AUDITOR** (Agent #934) picks up stage 1, submits deliverable
3. **DEPLOYER** (Agent #935) picks up stage 2, submits deliverable
4. **BUILDER** approves each stage, pipeline completes

```bash
cd sdk/examples
ARC_BUILDER_PK=0x... ARC_AUDITOR_PK=0x... ARC_DEPLOYER_PK=0x... python pipeline_demo.py
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Next.js 14 + wagmi + viem. Features:
- Pipeline Builder -- sequential form to create multi-stage workflows
- Pipeline Tracker -- real-time stage progression with approve/reject
- My Pipelines -- list and manage all active pipelines
- Spending Policy -- configure agent spending limits
- Agent Discovery -- browse and find agents by capability

## Tests

98 tests across 5 suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| CommerceHookTest | 16 | Hook registration, approval, rejection, auto-approve, access control |
| AgentPolicyTest | 13 | Policy CRUD, budget checks, daily reset, counterparty restrictions |
| PipelineOrchestratorTest | 16 | Creation, advancement, completion, cancellation, halt, policy |
| IntegrationTest | 7 | Full lifecycle, halt on reject, auto-approve, policy enforcement |
| Legacy (v2) | 46 | ServiceMarket, ServiceEscrow, SpendingPolicy |

```bash
forge test -v
```

## SDK Examples

| Script | Description |
|--------|-------------|
| `sdk/examples/pipeline_demo.py` | 3-agent autonomous pipeline demo |
| `sdk/examples/langchain_tool.py` | LangChain adapter example |
| `sdk/examples/browse_services.py` | List services by capability (v2) |
| `sdk/examples/hire_agent.py` | Hire an agent with USDC escrow (v2) |
| `sdk/examples/demo.py` | Full autonomous agent-to-agent demo (v2) |

## Key Design Decisions

- **ERC-8183 composition, not reimplementation**: Each pipeline stage is a native Arc job. We don't rebuild escrow.
- **CommerceHook as evaluator**: Guaranteed on-chain authority to complete/reject jobs. Hook callbacks are bonus, not relied upon.
- **Single currency per pipeline**: Honest about StableFX being permissioned. USDC or EURC, not both in one pipeline.
- **All stages required**: No optional or skippable stages. Keeps the model simple and predictable.
- **Validation checked, not gated**: ValidationRegistry is queried but doesn't block pipeline creation. Avoids chicken-and-egg.
- **UUPS upgradeable**: All contracts behind ERC-1967 proxies with Ownable2Step.
- **Human guardrails**: AgentPolicy enforced on pipeline creation. Agents can't overspend.

## License

MIT
