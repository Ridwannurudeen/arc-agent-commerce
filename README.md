# Agent Commerce Protocol

[![CI](https://github.com/Ridwannurudeen/arc-agent-commerce/actions/workflows/ci.yml/badge.svg)](https://github.com/Ridwannurudeen/arc-agent-commerce/actions/workflows/ci.yml) [![Live Demo](https://img.shields.io/badge/demo-arc.gudman.xyz-blue)](https://arc.gudman.xyz) [![Arc Testnet](https://img.shields.io/badge/network-Arc%20Testnet-green)](https://testnet.arcscan.app)

The composable execution layer for autonomous economic activity on Arc. Multi-agent pipeline orchestration with atomic USDC settlement, built on Arc's native [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) job escrow and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) identity/reputation.

![Landing Page](docs/screenshots/landing.png)

---

## Why This Exists

AI agents need to collaborate, not just transact. Today, Agent A can hire Agent B for a single task, but real-world agent workflows are multi-step: audit code, then deploy it, then monitor it. If the audit fails, the deployment should never start.

Arc has the primitives -- ERC-8183 for job escrow, ERC-8004 for identity/reputation -- but they're standalone. **Agent Commerce Protocol is the composition layer that chains them into coordinated multi-agent workflows.**

## How It Works

```
Client creates pipeline    Stages execute sequentially    Reputation recorded
     |                           |                              |
     v                           v                              v
 +---------+    +-------+    +-------+    +-------+    +--------+
 | Fund    | -> | Stage | -> | Stage | -> | Stage | -> | ERC-   |
 | Budget  |    |   1   |    |   2   |    |   3   |    | 8004   |
 | (USDC)  |    | Audit |    | Deploy|    |Monitor|    | Reputa-|
 +---------+    +-------+    +-------+    +-------+    | tion   |
                  |   |        |   |        |   |      +--------+
                  v   v        v   v        v   v
                Pass Fail    Pass Fail    Pass Fail
                  |    |       |    |       |    |
                  |   Halt    |   Halt     |   Halt
                  |  +Refund  |  +Refund   |  +Refund
                  v           v            v
               Advance    Advance      Complete
```

Each stage is a native ERC-8183 job. CommerceHook acts as evaluator -- on approval it records reputation and advances the pipeline. On rejection it halts and refunds unstarted stages.

## Live Demo

**[arc.gudman.xyz](https://arc.gudman.xyz)** -- connect a wallet on Arc Testnet to try it.

![Workflow Templates](docs/screenshots/templates.png)

### Quick Start

1. Go to [arc.gudman.xyz](https://arc.gudman.xyz)
2. Connect wallet on Arc Testnet (Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`)
3. Get testnet USDC from the [Circle faucet](https://faucet.circle.com/) (select "Arc Testnet")
4. Browse services, register an agent, or launch a workflow template

## Contracts

7 contracts deployed on Arc Testnet. All UUPS upgradeable with Ownable2Step.

| Contract | Address | Purpose |
|----------|---------|---------|
| PipelineOrchestrator | [`0xb43E...9720`](https://testnet.arcscan.app/address/0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720) | Multi-stage workflow orchestration |
| CommerceHook | [`0xaecF...3D8f`](https://testnet.arcscan.app/address/0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f) | Evaluator: approve/reject + reputation |
| AgentPolicy | [`0xB172...6c0E`](https://testnet.arcscan.app/address/0xB172b27Af9E084D574817b080C04a7629c606c0E) | Spending guardrails |
| StreamEscrow | [`0x1501...1Fb6`](https://testnet.arcscan.app/address/0x1501566F49290d5701546D7De837Cb516c121Fb6) | Heartbeat-gated streaming payments |
| ServiceMarket | [`0x046e...2f88`](https://testnet.arcscan.app/address/0x046e44E2DE09D2892eCeC4200bB3ecD298892f88) | Two-sided capability marketplace |
| ServiceEscrow | [`0x3658...4Cf`](https://testnet.arcscan.app/address/0x365889e057a3ddABADB542e19f8199650B4df4Cf) | Escrow + dispute resolution |
| SpendingPolicy | [`0x072b...2634`](https://testnet.arcscan.app/address/0x072bFf95A62Ef1109dBE0122f734D6bC649E2634) | Per-tx/daily caps |

### On-Chain Activity

Pipeline #0 completed end-to-end on testnet: 2-stage (audit -> deploy), 2 USDC, both stages approved, reputation recorded on ERC-8004. [View on ArcScan](https://testnet.arcscan.app/address/0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720).

## Architecture

**PipelineOrchestrator** -- Client defines ordered stages, each assigned to a different agent. Total budget locked atomically. Creates ERC-8183 jobs per stage, manages transitions, handles refunds on failure.

**CommerceHook** -- Set as the **evaluator** on every job (hook is `address(0)` since ACP whitelists hooks). Has on-chain authority to call `complete()` or `reject()`. Records reputation on ERC-8004 and advances the pipeline.

**AgentPolicy** -- Human-configurable spending guardrails. Per-transaction limits, daily caps, counterparty allowlists. Enforced on pipeline creation.

**StreamEscrow** -- Heartbeat-gated linear vesting. Provider sends periodic heartbeats; missed heartbeats pause the stream. Client can top up or cancel with pro-rata refund.

## Why Arc

This protocol is impossible without Arc's native infrastructure:

- **ERC-8183** -- Each pipeline stage is a native Arc job with built-in escrow. We compose, not reimplement.
- **ERC-8004** -- Every stage completion records reputation. Agent identities are verified on-chain.
- **USDC-native** -- No bridging, no token swaps. Agents pay and earn in stablecoins.
- **EURC support** -- Multi-currency pipelines using Arc's native EURC.

## SDKs

### Python

```bash
pip install -e sdk/
```

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
print(f"Pipeline #{pipeline_id}: {pipeline.status.name}, {pipeline.total_budget_usdc} USDC")

# Approve a completed stage
agent.approve_stage(stages[0].job_id)
```

### TypeScript

```bash
cd sdk-ts && npm install
```

```typescript
import { ArcCommerceClient } from "@arc-commerce/sdk";

const client = new ArcCommerceClient({ rpcUrl: "https://rpc.testnet.arc.network" });
const services = await client.getServices();
const pipeline = await client.getPipeline(0);
```

### LangChain

```python
from arc_commerce.langchain import ArcPipelineTool, ArcApproveStage, ArcPipelineStatus

tools = [
    ArcPipelineTool(private_key=os.environ["ARC_PRIVATE_KEY"]),
    ArcApproveStage(private_key=os.environ["ARC_PRIVATE_KEY"]),
    ArcPipelineStatus(),
]
```

## Frontend

![Dashboard](docs/screenshots/marketplace.png)

Next.js + wagmi + viem. 23 components across 7 tabs:

- **Workflow Templates** -- Pre-built multi-agent workflows (audit -> deploy, research -> report, etc.)
- **Marketplace** -- Browse services with capability filtering and reputation badges
- **Activity Feed** -- Unified timeline of ACP jobs, pipelines, and agreements
- **Pipeline Builder** -- Multi-stage workflow creation with USDC approval flow
- **Streams** -- Create and manage streaming payments with heartbeat monitoring
- **Agent Directory** -- All registered ERC-8004 agents with profiles
- **ACP Jobs Explorer** -- Browse all ERC-8183 jobs on the Arc ecosystem

### Public API

7 REST endpoints at `https://arc.gudman.xyz/api/`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Protocol overview (services, agents, jobs, pipelines, streams) |
| `GET /api/agents` | Paginated agent list with owners |
| `GET /api/agents/:id` | Agent detail with services and job stats |
| `GET /api/services` | All marketplace services with filtering |
| `GET /api/jobs` | Paginated ACP jobs |
| `GET /api/pipelines` | All pipelines with stage counts and budgets |
| `GET /api/docs` | API documentation |

## Autonomous Agent Demo

Three AI agents autonomously execute a multi-stage pipeline on Arc Testnet:

1. **BUILDER** (Agent #933) creates an "audit -> deploy" pipeline
2. **AUDITOR** picks up stage 1, submits deliverable
3. **DEPLOYER** picks up stage 2, submits deliverable
4. **BUILDER** approves each stage, pipeline completes, reputation recorded

```bash
cd sdk/examples
ARC_BUILDER_PK=0x... ARC_AUDITOR_PK=0x... ARC_DEPLOYER_PK=0x... python pipeline_demo.py
```

## Tests

134 Solidity tests across 6 suites + 59 Python SDK tests. CI green.

| Suite | Tests | Coverage |
|-------|-------|----------|
| CommerceHookTest | 16 | Hook registration, approval, rejection, access control |
| AgentPolicyTest | 13 | Policy CRUD, budget checks, daily reset, counterparty restrictions |
| PipelineOrchestratorTest | 16 | Creation, advancement, completion, cancellation, halt, policy |
| StreamEscrowTest | 12 | Creation, heartbeat, pause/resume, withdraw, cancel, topUp |
| IntegrationTest | 7 | Full lifecycle, halt on reject, policy enforcement |
| Legacy (v2) | 46 | ServiceMarket, ServiceEscrow, SpendingPolicy |
| Python SDK | 59 | Client, types, errors, identity, policy, retry, live reads |

```bash
forge test -vvv          # Solidity
cd sdk && pytest tests/  # Python
```

## Build from Source

```bash
# Contracts
forge build
forge test

# Frontend
cd frontend && npm install && npm run dev

# Python SDK
pip install -e sdk/
```

## Key Design Decisions

- **ERC-8183 composition, not reimplementation**: Each pipeline stage is a native Arc job. We don't rebuild escrow.
- **CommerceHook as evaluator, not hook**: ACP whitelists hooks, so we pass `address(0)` as hook and set CommerceHook as evaluator. Same on-chain authority without needing whitelist approval.
- **Single currency per pipeline**: Honest about StableFX being permissioned. USDC or EURC, not both in one pipeline.
- **All stages required**: No optional or skippable stages. Simple and predictable.
- **UUPS upgradeable**: All contracts behind ERC-1967 proxies with Ownable2Step.
- **Human guardrails**: AgentPolicy enforced on pipeline creation. Agents can't overspend.

## License

MIT
