# Agent Commerce Protocol -- Arc Builders Fund Application

## One-Liner

The composable execution layer for autonomous economic activity on Arc: ERC-8183 handles per-job escrow, ERC-8004 handles identity/reputation/validation, and Agent Commerce Protocol turns those primitives into multi-agent workflows that any app, wallet, or AI agent can use.

## Problem

AI agents need to collaborate, not just transact. Today, Agent A can hire Agent B for a single task, but real-world agent workflows are multi-step: audit code, then deploy it, then monitor it. If the audit fails, the deployment should never start. No protocol handles this.

Arc has the primitives -- ERC-8183 for job escrow, ERC-8004 for identity and reputation -- but they're standalone. There's no composition layer that chains them into coordinated multi-agent workflows.

## Solution

Three composable contracts that form a pipeline orchestration layer on top of Arc's native infrastructure:

1. **PipelineOrchestrator** -- Client defines ordered stages (audit -> deploy -> monitor), funds the total budget in one transaction (USDC or EURC), and the orchestrator creates ERC-8183 jobs per stage. Stages chain automatically -- completion of one activates the next. Failure halts the pipeline and refunds unstarted stages.

2. **CommerceHook** -- Acts as the **evaluator** on every ERC-8183 job in the pipeline (hook is `address(0)` since ACP whitelists hooks). The evaluator has on-chain authority to call `complete()` or `reject()`. When a provider submits work, the pipeline client approves or rejects through the hook. On completion, it records reputation on ERC-8004 ReputationRegistry and tells the orchestrator to advance. On rejection, it halts the pipeline and records negative reputation.

3. **AgentPolicy** -- Human-configurable spending guardrails. Per-transaction limits, daily caps, counterparty restrictions. Enforced on pipeline creation so agents can't overspend.

## Why This Can Only Exist on Arc

This protocol is impossible without Arc's native infrastructure:

- **ERC-8183 (AgenticCommerce)**: Each pipeline stage becomes a native ERC-8183 job with built-in escrow, provider submit, evaluator approve/reject. We don't reimplement escrow -- we compose Arc's.
- **ERC-8004 (Identity + Reputation + Validation)**: Every stage completion records reputation. Agent identities are verified on-chain. Capability validation through ValidationRegistry.
- **USDC-native settlement**: No bridging, no token swaps. Agents pay and earn in stablecoins.
- **EURC support**: Multi-currency pipelines using Arc's native EURC.

If you deploy this on Ethereum or Solana, it has no ERC-8183 to compose. It becomes just another escrow contract. The pipeline orchestration pattern only works because Arc provides the atomic building blocks.

## What's Built

- 4 protocol contracts (PipelineOrchestrator, CommerceHook, AgentPolicy, StreamEscrow) -- all UUPS upgradeable
- 2 marketplace contracts (ServiceMarket, ServiceEscrow) with dispute resolution
- 134 Solidity tests across 6 test suites + 49 Python SDK unit tests
- Python SDK with pipeline, streaming, service, and agreement operations
- TypeScript SDK (`@arc-commerce/sdk`) with full pipeline and service client
- LangChain adapter for agent framework integration (4 tools)
- Next.js frontend: marketplace, agent directory, pipeline builder, stream manager, ACP explorer, activity feed
- Autonomous 3-agent demo (BUILDER -> AUDITOR -> DEPLOYER)
- StreamEscrow with heartbeat-gated linear vesting, pause/resume, and pro-rata cancellation
- Full CI pipeline (Solidity, Python SDK, frontend build)
- Public REST API with 7 endpoints (agents, jobs, services, pipelines, stats, docs)

```python
# Create a multi-stage pipeline in 5 lines
from arc_commerce import ArcCommerce
agent = ArcCommerce(private_key=os.environ["ARC_AGENT_PK"])
pipeline_id = agent.create_pipeline(
    client_agent_id=933,
    stages=[
        {"provider_agent_id": 934, "provider_address": "0x...", "capability": "audit", "budget_usdc": 50},
        {"provider_agent_id": 935, "provider_address": "0x...", "capability": "deploy", "budget_usdc": 30},
    ],
)
```

## Revenue Model

Protocol integrates with ERC-8183 which handles escrow natively. Value accrues from orchestration -- the pipeline layer provides coordination that individual jobs can't. Future: orchestration fees on pipeline creation.

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| PipelineOrchestrator | `0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720` |
| CommerceHook | `0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f` |
| AgentPolicy | `0xB172b27Af9E084D574817b080C04a7629c606c0E` |
| StreamEscrow | `0x1501566F49290d5701546D7De837Cb516c121Fb6` |
| ServiceMarket | `0x046e44E2DE09D2892eCeC4200bB3ecD298892f88` |
| ServiceEscrow | `0x365889e057a3ddABADB542e19f8199650B4df4Cf` |

## Roadmap

**Now**: Core v3 contracts, SDKs (Python + TypeScript), frontend, demo, 183 tests -- all complete on testnet. Pipeline #0 completed end-to-end on-chain with reputation recorded.

**Next**: Mainnet deployment. Hook whitelisting with Arc team (enables auto-approve via `afterAction` callbacks). SDK publishing to PyPI and npm. Indexed API for historical queries.

**Later**: Capability marketplace (agents register what they can do, orchestrator auto-matches). Recurring pipeline templates. Cross-pipeline dependencies. EURC/StableFX-aware pipeline templates.

## Grant Ask

Funding will be used to productionize ACP as an open Arc primitive:
- **Security audit** -- Professional review of all 7 contracts before mainnet
- **Mainnet deployment** -- Deploy, verify, and monitor on Arc mainnet
- **SDK publishing** -- Publish `arc-commerce` (PyPI) and `@arc-commerce/sdk` (npm) with pinned versions and quickstart guides
- **Indexed API** -- Subgraph or indexer for jobs, agents, pipelines, and reputation so other Arc builders can integrate without reading contracts directly
- **Hook whitelisting** -- Work with Arc team to whitelist CommerceHook, enabling auto-approve and richer agent autonomy
- **Documentation** -- Integration guides, architecture docs, and sample apps for the Arc ecosystem

## Team

Solo builder. Shipped multiple projects across DeFi, security tooling, and agent infrastructure. Prior work includes SentinelNet (agent reputation watchdog on Base), ShieldBot (BNB Chain security), and contributions to Fhenix, OpenGradient, and GenLayer.

## Links

- **GitHub**: https://github.com/Ridwannurudeen/arc-agent-commerce
- **Live Demo**: https://arc.gudman.xyz
- **Explorer**: https://testnet.arcscan.app
