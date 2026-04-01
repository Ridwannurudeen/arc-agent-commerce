# Agent Commerce Protocol v3 — Arc-Native Rewrite

## Problem

v2 is a generic EVM marketplace that happens to be deployed on Arc. Nothing about it requires Arc. Circle's Builders Fund explicitly funds projects where Arc's unique features are *necessary*, not nice-to-haves. v2 would not get funded.

Additionally, v2 duplicates Arc's native infrastructure:
- ServiceEscrow reimplements what ERC-8183 already provides natively
- ServiceMarket reimplements what ERC-8004 metadata already provides
- No integration with ValidationRegistry or StableFX

## Solution

Rewrite the protocol as a **multi-agent pipeline orchestration layer** that composes Arc's native primitives (ERC-8183 jobs, ERC-8004 identity/reputation/validation, USDC/EURC) into something new: **conditional multi-stage agent workflows with atomic settlement**.

The protocol doesn't rebuild what Arc provides — it makes Arc's agent infrastructure composable.

## Core Concept: Pipelines

A pipeline is an ordered sequence of stages. Each stage is a job for a different agent.

Example: Agent A wants a contract audited, deployed, and monitored.

```
Pipeline: "Audit + Deploy"
  Stage 1: AUDITOR (Agent #934) — audit code — 50 USDC
  Stage 2: DEPLOYER (Agent #935) — deploy to testnet — 30 USDC

  Total locked: 80 USDC

  Flow:
  1. Client funds 80 USDC in one tx
  2. Stage 1 creates ERC-8183 job for AUDITOR
  3. AUDITOR submits deliverable
  4. CommerceHook (as evaluator) approves → reputation recorded → Stage 2 starts
  5. DEPLOYER submits deliverable
  6. CommerceHook approves → reputation recorded → pipeline complete

  If Stage 1 fails:
  - Pipeline halts
  - 30 USDC (Stage 2 budget) refunds to client
  - Negative reputation for AUDITOR
```

No other protocol does this on any chain.

---

## Architecture

```
ERC-8004 (Arc Native)
┌──────────┬─────────────┬──────────────┐
│ Identity │ Reputation  │ Validation   │
│ Registry │ Registry    │ Registry     │
└────┬─────┴──────┬──────┴───────┬──────┘
     │            │              │
     │       ┌────┴─────┐       │
     │       │ ERC-8183 │       │
     │       │ (Native  │       │
     │       │  Jobs)   │       │
     │       └────┬─────┘       │
     │            │              │
┌────┴────────────┴──────────────┴──────┐
│   CommerceHook.sol (EVALUATOR)        │
│   - Calls complete() on ERC-8183      │
│   - Records reputation                │
│   - Advances pipeline stages          │
│   - Auto-approve or client-approve    │
└────────────────┬──────────────────────┘
                 │
┌────────────────┴──────────────────────┐
│   PipelineOrchestrator.sol            │
│   - Multi-stage workflows             │
│   - Single-currency per pipeline      │
│   - All stages required               │
│   - Atomic funding + partial refund   │
│   - Creates ERC-8183 jobs per stage   │
└────────────────┬──────────────────────┘
                 │
┌────────────────┴──────────────────────┐
│   AgentPolicy.sol                     │
│   - maxPerTx (per stage)              │
│   - maxDaily (across all pipelines)   │
│   - Counterparty allowlists           │
└───────────────────────────────────────┘
```

**No custom service registry.** Agents list capabilities in their ERC-8004 metadata URI. ValidationRegistry proves capabilities. The SDK queries ERC-8004 directly for agent discovery.

**No custom escrow.** ERC-8183 handles job settlement natively. CommerceHook acts as the evaluator role to trigger reputation + stage advancement.

---

## Contract 1: PipelineOrchestrator.sol

### State

```solidity
struct Stage {
    uint256 providerAgentId;    // ERC-8004 agent doing the work
    bytes32 capabilityHash;     // keccak256("smart_contract_audit")
    uint256 budget;             // Payment for this stage (6-decimal stablecoin)
    uint256 jobId;              // ERC-8183 job ID (set when stage activates)
    StageStatus status;         // Pending, Active, Completed, Failed
}

enum StageStatus { Pending, Active, Completed, Failed }

struct Pipeline {
    uint256 clientAgentId;
    address client;
    address currency;           // USDC or EURC (one per pipeline)
    uint256 totalBudget;        // Sum of all stage budgets
    uint256 totalSpent;         // Running total of completed stages
    uint256 currentStage;       // Index of active stage
    uint256 stageCount;
    PipelineStatus status;      // Active, Completed, Halted, Cancelled
    uint256 createdAt;
    uint256 deadline;           // Global deadline for entire pipeline
}

enum PipelineStatus { Active, Completed, Halted, Cancelled }

mapping(uint256 => Pipeline) public pipelines;
mapping(uint256 => mapping(uint256 => Stage)) public stages; // pipelineId => stageIndex => Stage
mapping(address => uint256[]) internal _clientPipelines;
mapping(uint256 => uint256) internal _jobToPipeline;         // ERC-8183 jobId => pipelineId
mapping(uint256 => uint256) internal _jobToStage;            // ERC-8183 jobId => stageIndex
uint256 public nextPipelineId;
```

### Functions

**`createPipeline(clientAgentId, stageParams[], currency, deadline) → pipelineId`**
- Validates: caller owns clientAgentId (via IdentityRegistry), currency is USDC or EURC, deadline in future, stageParams.length > 0
- Checks AgentPolicy: total budget within limits
- Pulls total budget from client (ERC-20 transferFrom)
- Stores pipeline + stages
- Activates first stage: creates ERC-8183 job with CommerceHook as evaluator
- Emits: `PipelineCreated(pipelineId, clientAgentId, stageCount, totalBudget, currency)`

**`cancelPipeline(pipelineId)`**
- Only client can call
- If current stage has an active ERC-8183 job that's been submitted: revert (can't pull mid-delivery)
- If current stage is active but not yet submitted: cancel remains possible
- Marks remaining stages as Failed, pipeline as Cancelled
- Refunds unspent budget (totalBudget - totalSpent) to client
- Emits: `PipelineCancelled(pipelineId, refundAmount)`

**`advanceStage(pipelineId)` — internal, called by CommerceHook only**
- Marks current stage Completed, increments currentStage
- If more stages: creates next ERC-8183 job, marks it Active
- If last stage completed: marks pipeline Completed, refunds any dust, emits `PipelineCompleted`
- Updates totalSpent

**`haltPipeline(pipelineId)` — internal, called by CommerceHook only**
- Marks current stage Failed, pipeline Halted
- Refunds unspent budget to client
- Emits: `PipelineHalted(pipelineId, failedStage, refundAmount)`

**Read functions:**
- `getPipeline(pipelineId) → Pipeline`
- `getStages(pipelineId) → Stage[]`
- `getClientPipelines(address) → uint256[]`
- `getPipelineByJob(jobId) → (pipelineId, stageIndex)`

**Admin:**
- `pause()` / `unpause()` — owner emergency control
- `_authorizeUpgrade()` — UUPS

### Design Decisions
- Single currency per pipeline (honest about StableFX being permissioned today)
- All stages required (no conditional skip logic — YAGNI)
- Global deadline applies to entire pipeline, not per-stage
- Only CommerceHook can call advanceStage/haltPipeline (access control)

---

## Contract 2: CommerceHook.sol

### Role

Acts as the **evaluator** on all ERC-8183 jobs created by PipelineOrchestrator. The evaluator is the address that calls `complete()` on ERC-8183 — this is a guaranteed on-chain role, not dependent on hook callback mechanics.

### State

```solidity
address public orchestrator;       // PipelineOrchestrator address
address public erc8183;            // ERC-8183 job contract
address public reputationRegistry; // ERC-8004 ReputationRegistry
address public identityRegistry;   // ERC-8004 IdentityRegistry

// Approval mode per pipeline
mapping(uint256 => bool) public autoApprove; // pipelineId => auto-approve mode

// Track submissions
mapping(uint256 => bool) public submitted;   // jobId => provider has submitted
```

### Functions

**`onProviderSubmit(jobId)`**
- Called after provider submits deliverable to ERC-8183
- Marks submitted[jobId] = true
- If autoApprove for this pipeline: immediately calls `_evaluateAndAdvance(jobId)`
- If client-approve: emits `StageAwaitingApproval(pipelineId, stageIndex, jobId)`

**`approveStage(pipelineId, stageIndex)` — client-approve mode**
- Only pipeline client can call
- Verifies stage is active and submitted
- Calls `_evaluateAndAdvance(jobId)`

**`rejectStage(pipelineId, stageIndex, reason)` — client rejects delivery**
- Only pipeline client can call
- Records negative reputation for provider (-50, "delivery_rejected")
- Calls orchestrator.haltPipeline(pipelineId)

**`_evaluateAndAdvance(jobId)` — internal**
1. Call `erc8183.complete(jobId, "approved", "")` — releases escrowed funds to provider
2. Record positive reputation: `reputationRegistry.giveFeedback(providerAgentId, +100, 1, "stage_completed", "", "", "", feedbackHash)` — wrapped in try/catch
3. Call `orchestrator.advanceStage(pipelineId)`
4. Emits: `StageCompleted(pipelineId, stageIndex, jobId)`

**`handleExpiredJob(jobId)`**
- Anyone can call if ERC-8183 job has expired
- Records negative reputation for provider (-30, "delivery_expired")
- Calls orchestrator.haltPipeline(pipelineId)

**`setAutoApprove(pipelineId, enabled)` — client sets approval mode**
- Only pipeline client can call
- For automated agent workflows: autoApprove = true
- For human-oversight: autoApprove = false (default)

### Design Decisions
- Evaluator role is guaranteed by ERC-8183 spec (no assumption about hook callbacks)
- Two approval modes: auto (for autonomous agents) and client (for human oversight)
- Reputation recording uses try/catch (never blocks settlement)
- Anyone can trigger expired job handling (same pattern as v2 dispute timeout)

---

## Contract 3: AgentPolicy.sol

### State

```solidity
struct Policy {
    uint256 maxPerTx;       // Max per single stage (6-decimal stablecoin)
    uint256 maxDaily;       // Max daily across all pipelines
    uint256 dailySpent;     // Cumulative today
    uint256 dayStart;       // UTC day boundary
    bool exists;
}

mapping(address => Policy) public policies;
mapping(address => mapping(address => bool)) public allowedCounterparties;
mapping(address => bool) public counterpartyRestricted;
mapping(address => address) public policyOwners;
```

### Functions

**`setPolicy(agent, maxPerTx, maxDaily)`**
- Sets policyOwners[agent] = msg.sender
- Resets daily counters
- Emits: PolicySet

**`checkStageBudget(agent, amount, counterparty) → bool`**
- Called by PipelineOrchestrator before each stage
- Returns true if no policy exists
- Checks: amount <= maxPerTx, dailySpent + amount <= maxDaily
- Checks counterparty allowlist if restricted
- Updates dailySpent (resets at day boundary)

**`checkPipelineBudget(agent, totalBudget) → bool`**
- Called by PipelineOrchestrator on pipeline creation
- Checks: dailySpent + totalBudget <= maxDaily
- Does NOT update dailySpent (each stage updates individually)

**`wouldPass(agent, amount, counterparty) → bool`** — read-only simulation

**`dailyRemaining(agent) → uint256`**

**`setCounterpartyRestriction(agent, restricted)`** — policy owner only

**`setAllowedCounterparty(agent, counterparty, allowed)`** — policy owner only

### Design Decisions
- No maxPipeline field (redundant with maxPerTx + maxDaily)
- Currency-agnostic (amounts are in 6-decimal stablecoins regardless of USDC/EURC)
- Same day-reset logic as v2 (proven pattern)

---

## Service Discovery (No Custom Registry)

Agents register via ERC-8004 IdentityRegistry with metadata URI pointing to:

```json
{
  "name": "AuditBot v2",
  "description": "Automated smart contract security auditor",
  "capabilities": ["smart_contract_audit", "gas_optimization"],
  "pricing": {
    "smart_contract_audit": { "amount": "50000000", "currency": "USDC" },
    "gas_optimization": { "amount": "25000000", "currency": "USDC" }
  },
  "version": "2.0.0"
}
```

ValidationRegistry records (if any) prove capability claims. The SDK handles discovery:

```python
agents = client.find_agents("smart_contract_audit")
# Queries ERC-8004 metadata, filters by capability, sorts by reputation + validation status
```

Verified agents (with ValidationRegistry proof) surface first. Unverified agents still appear but are flagged.

---

## Python SDK v2

### Core Client (`arc_commerce.ArcCommerce`)

**Pipeline operations:**
- `create_pipeline(client_agent_id, stages, currency, deadline_hours, auto_approve=True) → pipeline_id`
  - stages: list of `{"provider_agent_id": int, "capability": str, "budget_usdc": float}`
- `cancel_pipeline(pipeline_id) → receipt`
- `approve_stage(pipeline_id, stage_index) → receipt`
- `reject_stage(pipeline_id, stage_index, reason) → receipt`
- `get_pipeline(pipeline_id) → Pipeline`
- `get_stages(pipeline_id) → list[Stage]`
- `get_client_pipelines(address) → list[int]`

**Agent discovery (queries ERC-8004 directly):**
- `find_agents(capability) → list[AgentProfile]`
  - Reads metadata URIs, filters by capability, checks ValidationRegistry
- `get_agent_profile(agent_id) → AgentProfile`
  - Returns: name, capabilities, pricing, reputation score, validation status

**Policy operations (unchanged from v2):**
- `set_policy(agent, max_per_tx, max_daily)`
- `would_pass(agent, amount, counterparty)`
- `daily_remaining(agent)`

**Convenience:**
- `hire_pipeline(capabilities, deadline_hours=24) → pipeline_id`
  - Finds best agent for each capability, creates pipeline automatically
  - Example: `hire_pipeline(["smart_contract_audit", "contract_deployment"])`

### LangChain Adapter (`arc_commerce.langchain`)

```python
from arc_commerce.langchain import ArcPipelineTool, ArcDiscoverTool

tools = [ArcPipelineTool(private_key=pk), ArcDiscoverTool()]

# ArcPipelineTool:
#   name: "arc_create_pipeline"
#   description: "Create a multi-stage agent workflow on Arc.
#                 Specify capabilities needed in order."
#   input: {"capabilities": ["audit", "deploy"], "deadline_hours": 24}
#   output: {"pipeline_id": 42, "stages": [...], "total_cost": "80.00 USDC"}

# ArcDiscoverTool:
#   name: "arc_find_agents"
#   description: "Find agents on Arc that can perform a specific capability."
#   input: {"capability": "smart_contract_audit"}
#   output: [{"agent_id": 934, "name": "AuditBot", "price": "50 USDC", "verified": true}]
```

CrewAI and AutoGen adapters: documented as "coming soon" in README. Not shipped in v3.

---

## Live Demo: 3 Autonomous Agents

### Agents

| Agent ID | Name | Capability | Behavior |
|----------|------|-----------|----------|
| 933 | BUILDER | Client | Creates "audit → deploy" pipelines every ~10 min |
| 934 | AUDITOR | `smart_contract_audit` | Picks up audit jobs, submits findings hash |
| 935 | DEPLOYER | `contract_deployment` | Picks up deploy jobs, submits deployment tx hash |

### Demo Script (`sdk/examples/pipeline_demo.py`)

Runs as systemd service on VPS (75.119.153.252). Loop:
1. BUILDER discovers AUDITOR and DEPLOYER via ERC-8004 metadata
2. BUILDER creates 2-stage pipeline: audit (50 USDC) → deploy (30 USDC)
3. AUDITOR detects active job, runs mock audit, submits deliverable
4. CommerceHook auto-approves, reputation recorded, stage 2 starts
5. DEPLOYER detects active job, runs mock deploy, submits deliverable
6. CommerceHook auto-approves, reputation recorded, pipeline complete
7. Wait 10 minutes, repeat

All on-chain. All verifiable on arcscan.app. The frontend shows live pipeline progression.

### What This Demonstrates
- Multi-stage atomic workflows actually working
- ERC-8183 native settlement (not custom escrow)
- ERC-8004 reputation accumulating over time
- Autonomous agent-to-agent commerce with no human intervention

---

## Frontend Updates

### New Components

**Pipeline Builder** — Sequential form:
1. Select client agent ID
2. Select currency (USDC / EURC)
3. Add Stage: pick provider agent (search by capability), set budget
4. "Add Another Stage" button → repeat
5. Set global deadline
6. Review all stages → Submit

**Pipeline Tracker** — Visual stage progression:
```
[Stage 1: Audit]  →  [Stage 2: Deploy]
   ✓ Complete          ● Active
   50 USDC paid        30 USDC locked
   Agent #934          Agent #935
```

**Agent Discovery** — Search by capability, show:
- Agent name + metadata from ERC-8004
- Reputation score from ReputationRegistry
- "Verified" badge if ValidationRegistry has a passing record
- Pricing from metadata URI

### Updated Components
- Dashboard: show pipeline stats (active, completed, total value)
- Activity Feed: show pipeline events (created, stage advanced, completed, halted)

### Removed
- Browse Services tab (replaced by Agent Discovery)
- List Service tab (agents register via ERC-8004 directly)
- Create Agreement tab (replaced by Pipeline Builder)
- My Agreements tab (replaced by My Pipelines with stage tracking)

---

## Updated Builders Fund Pitch

### One-Liner

Multi-agent pipeline orchestration on Arc — the only protocol where AI agents compose multi-step workflows with conditional escrow and atomic settlement through Arc's native ERC-8183 and ERC-8004 infrastructure.

### Why Arc (Not Possible Elsewhere)

1. **ERC-8183 native settlement** — Jobs settle through Arc's own escrow. We're a hook, not a competitor. Any Arc project using ERC-8183 can opt into our orchestration.
2. **ERC-8004 full stack** — Identity for agent registration, Reputation for track records, Validation for capability proof. All three registries integrated, not just identity.
3. **Sub-second finality** — Stage transitions happen in 350ms. An audit completes, deployment starts instantly. No block confirmation delays.
4. **USDC native gas** — Agents operate entirely in dollars. No ETH management, no token swaps, no volatility.
5. **Protocol compliance** — Blocklisted addresses can't participate. Built into Arc's execution layer.
6. **FX-ready architecture** — Pipeline currency abstraction supports USDC and EURC today. StableFX auto-conversion plugs in when permissionless (interface designed, not faked).

### What's Built

- 3 contracts deployed on Arc Testnet (PipelineOrchestrator, CommerceHook, AgentPolicy)
- 3 autonomous agents running live pipelines 24/7 on testnet
- Python SDK with pipeline support + LangChain adapter
- Frontend with pipeline builder and stage tracker
- Full test suite (Foundry)

### What's Novel

No other protocol on any chain supports multi-agent pipelines with conditional stage advancement, automatic reputation recording, and atomic multi-stage settlement. This is the missing coordination layer between Arc's agent identity (ERC-8004) and agent jobs (ERC-8183).

---

## What's Removed From v2

| v2 Component | Status | Reason |
|-------------|--------|--------|
| ServiceMarket.sol | Removed | ERC-8004 metadata handles service discovery |
| ServiceEscrow.sol | Removed | ERC-8183 handles escrow natively |
| Custom service registry | Removed | Duplicated Arc infrastructure |
| Single-job agreements | Replaced | Pipelines subsume single jobs (1-stage pipeline) |

v2 contracts remain deployed for backwards compatibility but are not part of the v3 protocol.

---

## Test Plan

### Contract Tests (Foundry)

**PipelineOrchestrator:**
- Create pipeline with 1, 2, 3 stages
- Cancel before any stage starts → full refund
- Cancel after stage 1 complete → partial refund
- Cancel while stage active but not submitted → allowed
- Cancel while stage submitted → revert
- Global deadline expiry → halt + refund
- Invalid inputs: zero stages, past deadline, unregistered agent, wrong currency

**CommerceHook:**
- Auto-approve: submit → complete → advance
- Client-approve: submit → approve → complete → advance
- Client reject: submit → reject → halt + refund
- Expired job: halt + refund + negative reputation
- Reputation recording: success path + try/catch on failure
- Access control: only orchestrator can call advanceStage/haltPipeline

**AgentPolicy:**
- Per-stage limits (pass and fail)
- Daily limits with reset
- Pipeline budget check
- Counterparty allowlists
- No policy = always passes

**Integration:**
- Full pipeline lifecycle: create → stage 1 submit → approve → stage 2 submit → approve → complete
- Pipeline halt on stage failure: create → stage 1 reject → halt → refund
- Pipeline with policy: create → policy check → enforce limits
- Multi-pipeline daily limit exhaustion

### SDK Tests (pytest)
- Pipeline CRUD operations
- Agent discovery from ERC-8004 metadata
- LangChain tool integration
- Error handling (reverts, timeouts, policy violations)

---

## Migration Path

1. Deploy v3 contracts alongside v2 (different addresses)
2. Update SDK to support both v2 (single agreements) and v3 (pipelines)
3. Update frontend to v3 UI
4. v2 contracts stay live but are not promoted
5. Demo agents switch to v3 pipelines

No breaking changes for existing v2 users (if any exist on testnet).
