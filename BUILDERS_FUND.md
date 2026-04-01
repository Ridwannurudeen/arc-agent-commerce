# Agent Commerce Protocol -- Arc Builders Fund Application

## One-Liner

Multi-agent pipeline orchestration that composes Arc's ERC-8183 job escrow and ERC-8004 identity stack into conditional multi-stage workflows with atomic settlement -- something no other protocol does on any chain.

## Problem

AI agents need to collaborate, not just transact. Today, Agent A can hire Agent B for a single task, but real-world agent workflows are multi-step: audit code, then deploy it, then monitor it. If the audit fails, the deployment should never start. No protocol handles this.

Arc has the primitives -- ERC-8183 for job escrow, ERC-8004 for identity and reputation -- but they're standalone. There's no composition layer that chains them into coordinated multi-agent workflows.

## Solution

Three composable contracts that form a pipeline orchestration layer on top of Arc's native infrastructure:

1. **PipelineOrchestrator** -- Client defines ordered stages (audit -> deploy -> monitor), funds the total budget in one transaction (USDC or EURC), and the orchestrator creates ERC-8183 jobs per stage. Stages chain automatically -- completion of one activates the next. Failure halts the pipeline and refunds unstarted stages.

2. **CommerceHook** -- Acts as the evaluator on every ERC-8183 job in the pipeline. When work is submitted, the hook either auto-approves or waits for client approval. On completion, it records reputation on ERC-8004 ReputationRegistry and tells the orchestrator to advance. On rejection, it halts the pipeline and records negative reputation.

3. **AgentPolicy** -- Human-configurable spending guardrails. Per-transaction limits, daily caps, counterparty restrictions. Enforced on pipeline creation so agents can't overspend.

## Why This Can Only Exist on Arc

This protocol is impossible without Arc's native infrastructure:

- **ERC-8183 (AgenticCommerce)**: Each pipeline stage becomes a native ERC-8183 job with built-in escrow, provider submit, evaluator approve/reject. We don't reimplement escrow -- we compose Arc's.
- **ERC-8004 (Identity + Reputation + Validation)**: Every stage completion records reputation. Agent identities are verified on-chain. Capability validation through ValidationRegistry.
- **USDC-native settlement**: No bridging, no token swaps. Agents pay and earn in stablecoins.
- **EURC support**: Multi-currency pipelines using Arc's native EURC.

If you deploy this on Ethereum or Solana, it has no ERC-8183 to compose. It becomes just another escrow contract. The pipeline orchestration pattern only works because Arc provides the atomic building blocks.

## What's Built

- 3 v3 contracts (PipelineOrchestrator, CommerceHook, AgentPolicy) -- all UUPS upgradeable
- 98 passing tests across 5 test suites (unit + integration)
- Python SDK with pipeline creation, stage approval, status tracking
- LangChain adapter for agent framework integration
- Next.js frontend with pipeline builder and real-time stage tracker
- Autonomous 3-agent demo (BUILDER -> AUDITOR -> DEPLOYER)
- Full CI pipeline (Solidity, Python SDK, frontend build)

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

## Roadmap

**Now**: Core v3 contracts, SDK, frontend, demo, 98 tests -- all complete on testnet.

**Next**: Mainnet deployment. Capability marketplace (agents register what they can do, orchestrator auto-matches). Recurring pipeline templates.

**Later**: Pipeline analytics dashboard. Cross-pipeline dependencies. Agent reputation scoring.

## Team

Solo builder. Shipped multiple projects across DeFi, security tooling, and agent infrastructure. Prior work includes SentinelNet (agent reputation watchdog on Base), ShieldBot (BNB Chain security), and contributions to Fhenix, OpenGradient, and GenLayer.

## Links

- **GitHub**: https://github.com/Ridwannurudeen/arc-agent-commerce
- **Live Demo**: https://arc.gudman.xyz
- **Explorer**: https://testnet.arcscan.app
