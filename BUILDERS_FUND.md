# Agent Commerce Protocol -- Arc Builders Fund Application

## One-Liner

**An ERC-8183 conditional sequencer.** A small, composable primitive that lets any Arc agent app chain native ERC-8183 jobs into atomically-funded, conditionally-halting workflows -- without reimplementing escrow, identity, or reputation.

## Problem

ERC-8183 is a single-job primitive: one client, one provider, one evaluator, one escrow. Any Arc app that wants to express *dependencies* between jobs ("only deploy if the audit passes," "refund the rest if step 2 fails") has to write that coordination layer itself. Today that means each app builds its own state machine over ERC-8183, with no shared semantics, no shared tooling, and no shared on-chain footprint.

Arc has the atomic primitives. What's missing is the *next composition layer up* -- the one that turns a sequence of ERC-8183 jobs into an atomic, conditional, refundable unit.

## Solution

Two contracts that form an ERC-8183 sequencer. Both are deliberately thin: they add coordination, not new escrow.

1. **PipelineOrchestrator** -- Client defines an ordered sequence of stages, each pointing at a different provider, and funds the total budget in one transaction (USDC or EURC). The orchestrator creates one ERC-8183 job per stage on demand. Stages advance only when the previous one is approved; if any stage is rejected or the client cancels, the orchestrator marks the remaining stages failed and refunds their budget atomically. The contract's only state is the sequence, the budgets, and per-stage status -- escrow itself stays in ERC-8183.

2. **CommerceHook** -- Set as the **evaluator** on every ERC-8183 job created by the orchestrator. The pipeline client drives approval/rejection through `approveStage()` / `rejectStage()` (manual evaluator-driven orchestration). The contract also implements ERC-8183's `afterAction` callback surface, so an autonomous evaluator can be wired in without changing the orchestrator -- the surface is in place, the autonomous behavior would be additive. On approval, CommerceHook records reputation on ERC-8004 and signals the orchestrator to advance.

That's the whole protocol. Two contracts, ~600 LOC of Solidity, no new escrow, no new identity layer, no new token. Everything else in the repo (`src/marketplace/`) is independent of this pitch.

## Why It Looks Like a Primitive

The Builders Fund explicitly looks for projects that "build primitives other Arc projects will want to compose with." This protocol is shaped that way:

- **No fee on the primitive itself.** Pipeline creation is free; the contract takes no share of stage budgets. Other apps can build on top without giving up margin.
- **Composes Arc, doesn't fork it.** Stage funds live in ERC-8183 escrow. Reputation lives on ERC-8004. The orchestrator owns only the sequencing state.
- **Stable surface.** Two public write functions on the orchestrator (`createPipeline`, `cancelPipeline`), two on the hook (`approveStage`, `rejectStage`). Anything else is a view or a callback.
- **Currency-agnostic.** USDC, EURC, or any token the owner allowlists -- pipelines are defined in terms of an ERC-20 budget, not a hardcoded asset.

## Why Arc

This protocol is only useful on Arc:

- **ERC-8183 (AgenticCommerce)**: Each stage is a native ERC-8183 job. We don't reimplement escrow, submit, or evaluator authority -- we compose them.
- **ERC-8004 (Identity + Reputation)**: Stage outcomes write to ERC-8004 ReputationRegistry; agent identity is verified via IdentityRegistry. Reputation is portable to any other Arc app.
- **USDC / EURC native**: Budgets are stablecoin-denominated end-to-end. No bridges, no token swaps inside the workflow.

Deployed on a chain without ERC-8183 and ERC-8004, this would just be another escrow contract. On Arc it's a sequencer over Arc's primitives.

## What's Built

- 2 pipeline contracts (`PipelineOrchestrator`, `CommerceHook`) -- UUPS upgradeable, Ownable2Step.
- 118 Solidity tests + 59 Python SDK tests, CI green.
- Python SDK and TypeScript SDK -- thin wrappers around the pipeline + ERC-8183 ABIs (intentionally thin: the SDK should not hide the protocol).
- Next.js frontend at https://arc.gudman.xyz -- pipeline builder, my-pipelines view, agent directory, activity feed, public REST API.
- Pipeline #0 completed end-to-end on Arc testnet: 2 stages, 2 USDC, both stages approved, reputation written to ERC-8004.
- Independent marketplace primitives (StreamEscrow, ServiceMarket, ServiceEscrow, SpendingPolicy) live in `src/marketplace/` -- they reuse the same Arc infrastructure but are not part of this pitch.

```python
# Atomic, conditionally-halting pipeline in 5 lines
from arc_commerce import ArcCommerce
agent = ArcCommerce(private_key=os.environ["ARC_AGENT_PK"])
pipeline_id = agent.create_pipeline(
    client_agent_id=933,
    stages=[
        {"provider_agent_id": 934, "provider_address": "0x...", "capability": "audit",  "budget_usdc": 50},
        {"provider_agent_id": 935, "provider_address": "0x...", "capability": "deploy", "budget_usdc": 30},
    ],
)
```

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| PipelineOrchestrator | `0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720` |
| CommerceHook | `0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f` |

## Roadmap

**Now (testnet, complete).** Two pipeline contracts deployed, evaluator-driven approval working, Pipeline #0 completed on-chain with reputation recorded, frontend live, SDKs functional, 177 tests green.

**Next (independent of any third-party action).**
- Publish `arc-commerce` to PyPI and `@arc-commerce/sdk` to npm with pinned versions and quickstart guides.
- Stand up an indexer (subgraph or lightweight Arc-native indexer) for pipelines, stages, and reputation events so other Arc apps can query without reading contracts directly.
- Ship at least one reference integration showing a third-party Arc app composing the orchestrator (e.g., a small builder using pipelines for a multi-step task).
- Mainnet deployment after audit.

**Later.** Capability-routing layer (orchestrator auto-matches stages to providers via ERC-8004 capability tags). Recurring pipeline templates. Multi-currency pipeline support beyond USDC/EURC as Arc adds new stablecoins. Optional autonomous evaluator integration sitting behind the existing `afterAction` surface.

## Grant Ask

Funding will be used to harden the primitive and lower the cost for other Arc builders to adopt it:

- **Security audit** -- Professional review of `PipelineOrchestrator` and `CommerceHook` before mainnet. The two contracts are the entire pitch; auditing them is bounded scope.
- **Mainnet deployment** -- Deploy, verify, and monitor on Arc mainnet.
- **SDK publishing** -- Publish `arc-commerce` (PyPI) and `@arc-commerce/sdk` (npm) with pinned versions and quickstart guides.
- **Indexed API** -- Subgraph or indexer so other Arc builders can query pipelines, stages, and reputation without reading contracts directly.
- **Integration partnerships** -- Build at least two reference integrations with other Arc projects to validate the primitive in real workflows.
- **Documentation** -- Integration guides, architecture docs, and sample apps targeted at Arc builders.

## Team

Solo builder. Shipped projects across DeFi, security tooling, and agent infrastructure. Prior work includes SentinelNet (agent reputation watchdog on Base), ShieldBot (BNB Chain security), and contributions to Fhenix, OpenGradient, and GenLayer.

## Links

- **GitHub**: https://github.com/Ridwannurudeen/arc-agent-commerce
- **Live Demo**: https://arc.gudman.xyz
- **Explorer**: https://testnet.arcscan.app
