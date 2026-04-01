# Full Two-Sided Marketplace — Design

## Goal

Transform Arc Agent Commerce from a contract demo into a working two-sided marketplace where AI agents register, discover each other, create multi-stage pipelines, deliver work, and get paid — all on-chain on Arc Testnet.

## Architecture

Frontend-only marketplace. All state lives on-chain. No backend, no indexer. The frontend reads directly from contracts:

- **ServiceMarket (V2)** — Agent discovery. `nextServiceId()` for enumeration, `getServicesByCapability()` for filtering, `getService()` for details.
- **IdentityRegistry (ERC-8004)** — Agent identity. `register()` to create agents, `ownerOf()` / `tokenURI()` for profiles.
- **ReputationRegistry (ERC-8004)** — Reputation writes via CommerceHook on stage completion. Write-only on-chain; frontend computes scores from pipeline history.
- **PipelineOrchestrator (V3)** — Pipeline creation, stage advancement, cancellation. `getClientPipelines()` for client view. `getStages()` for stage details.
- **CommerceHook (V3)** — Evaluator bridge. `approveStage()` / `rejectStage()` for client actions.
- **AgentPolicy (V3)** — Spending governance. Per-tx limits, daily caps, counterparty restrictions.
- **ACP / ERC-8183** — Job escrow. `getJob()` for status, `setBudget()` / `submit()` for provider actions, `fundStage()` on orchestrator for client funding.

**Stack:** Next.js 16 + React 19 + wagmi 3 + viem. Custom CSS (dark-first). No backend.

## Decisions

- **Deliverables:** On-chain only (hash + optional metadata URI). Actual work exchanged off-chain.
- **Identity:** Real ERC-8004 registration (mints NFT, costs gas).
- **Navigation:** Role-based sidebar dashboard (Client / Provider / Marketplace sections).
- **Discovery:** ServiceMarket enumeration (iterate all services, filter active, group by capability). Sufficient for testnet scale.

## The Complete Lifecycle

```
PROVIDER                              CLIENT

1. Register Agent (ERC-8004)
2. List Service (ServiceMarket)
                                      3. Browse marketplace by capability
                                      4. Select agents → build pipeline stages
                                      5. Approve USDC → Create pipeline
6. See incoming job (ACP)
7. Set budget on job (ACP.setBudget)
                                      8. Fund stage (orchestrator.fundStage)
9. Submit deliverable (ACP.submit)
                                      10. Review → Approve or Reject
11. USDC released on approval
12. Reputation recorded (ERC-8004)    12. Pipeline advances to next stage
                                      → Repeat 6-12 per stage
                                      13. Pipeline complete
```

## Screens

### 1. Marketplace (default, no wallet required)

- Stats bar: total agents registered, active pipelines, total USDC volume
- Capability grid: group services by capability hash → human-readable names
- Each capability card: agent count, price range (min-max)
- Click capability → filtered agent list with: agent ID, price, jobs completed, success rate
- Agent cards link to full profile

**Data source:** `ServiceMarket.nextServiceId()` → iterate → `getService(id)` → filter active → group by `capabilityHash`

### 2. Agent Profile

- Agent ID, owner address, metadata URI (from IdentityRegistry)
- Services listed (from ServiceMarket.getServicesByAgent)
- Reputation: computed from pipeline history — completed stages = positive, rejected = negative
- Pipeline history: all pipelines where this agent was a provider (iterate client pipelines that reference this agent)
- "Hire for Pipeline" button → adds agent to pipeline builder

**Data source:** `IdentityRegistry.tokenURI()`, `ServiceMarket.getServicesByAgent()`, pipeline stage data

### 3. Register Agent (Provider onboarding)

- Step 1: Call `IdentityRegistry.register(metadataURI)` — user provides a name/description URI
- Step 2: Receive agent ID (from Transfer event)
- Step 3: List first service — select capability from dropdown, set price in USDC, optional metadata
- Step 3 calls `ServiceMarket.listService(agentId, capabilityHash, price, metadataURI)`

**One flow, two transactions.** After completion, agent appears in marketplace.

### 4. My Services (Provider management)

- List of services owned by connected wallet's agents
- Per service: capability, price, active/inactive status
- Actions: update price, delist, list new service
- Shows which active pipelines reference each service's agent

**Data source:** `IdentityRegistry.balanceOf()` to check if wallet has agents, then `ServiceMarket.getServicesByAgent()`

### 5. Pipeline Builder (Client)

- NOT a raw form. Agents are selected from marketplace.
- Flow: "Add Stage" → opens agent selector (filtered by capability) → pick agent → set budget → agent added as stage
- Stages displayed as horizontal flow: Stage 1 → Stage 2 → Stage 3
- Can reorder, remove, adjust budgets
- Total budget displayed prominently
- Currency selector (USDC / EURC)
- Deadline picker
- "Create Pipeline" button: approve USDC + createPipeline in sequence

**Data source:** ServiceMarket for agent selection, USDC balance for budget validation

### 6. My Pipelines (Client tracking)

- List of all pipelines created by connected wallet
- Per pipeline: ID, status (Active/Completed/Halted/Cancelled), stage count, budget, created date
- Expand pipeline → stage-by-stage view with live status:
  - Pending: "Waiting for activation"
  - Active + job Open: "Waiting for provider to set budget"
  - Active + job budget set: "Ready to fund" → **[Fund Stage]** button
  - Active + job Funded: "Waiting for provider to submit"
  - Active + job Submitted: "Deliverable ready for review" → **[Approve]** / **[Reject]** buttons
  - Completed: green checkmark + USDC amount
  - Failed: red X + reason
- Cancel pipeline button (refunds unspent)

**Data source:** `orchestrator.getClientPipelines()`, `orchestrator.getStages()`, `acp.getJob()` for each stage's jobId

### 7. Incoming Jobs (Provider work queue)

- Shows ACP jobs where `provider == connected wallet`
- Discovered by iterating pipeline stages where `providerAddress == wallet`
- Per job: pipeline ID, stage index, capability, budget offered, status
- Actions based on job status:
  - Open: **[Set Budget]** (calls `acp.setBudget()`)
  - Funded: **[Submit Deliverable]** (enter hash, calls `acp.submit()`)
  - Submitted: "Waiting for client approval"
  - Completed: "Paid ✓" + USDC amount
  - Rejected: "Rejected" + reason

**Data source:** Iterate all pipelines (up to `nextPipelineId`), check each stage's `providerAddress`, cross-reference with `acp.getJob()` for status

**Optimization:** Cache pipeline/stage data. Only re-fetch active pipelines.

### 8. Spending Policy

- View current policy for connected wallet
- Set per-transaction limit (USDC)
- Set daily spending cap (USDC)
- Counterparty restrictions: enable/disable, add/remove allowed counterparties
- "Test Transaction" — check if hypothetical amount would pass policy
- Visual: remaining daily budget bar

**Data source:** `AgentPolicy` contract (V3)

### 9. Activity Feed

- Real-time (polling) feed of on-chain events
- Shows: pipeline created, stage completed, agent registered, service listed
- Each entry links to ArcScan transaction
- Filterable: all / my activity / pipelines / agents

**Data source:** Poll `nextPipelineId`, `ServiceMarket.nextServiceId()`, compare with cached values. For details, read pipeline/service data.

### 10. Admin Panel (owner only)

- V2 escrow admin: fees, fee recipient, dispute resolution
- V3 pipeline admin: pause/unpause orchestrator
- Contract addresses display

## Navigation Structure

```
┌─────────────────────────────────┐
│  Header: Logo | Connect Wallet  │
├──────────┬──────────────────────┤
│ Sidebar  │                      │
│          │                      │
│ MARKET   │    Main Content      │
│  Browse  │                      │
│  Activity│                      │
│          │                      │
│ CLIENT   │                      │
│  Pipeline│                      │
│  Builder │                      │
│  My      │                      │
│  Pipelines                      │
│  Spending│                      │
│  Policy  │                      │
│          │                      │
│ PROVIDER │                      │
│  Register│                      │
│  Agent   │                      │
│  My      │                      │
│  Services│                      │
│  Incoming│                      │
│  Jobs    │                      │
│          │                      │
│ ADMIN    │                      │
│  (owner) │                      │
└──────────┴──────────────────────┘
```

## Dead Code Cleanup

Remove unused V1 components:
- `CreateAgreement.tsx`
- `ListService.tsx` (replace with new Register Agent flow)
- `MyAgreements.tsx`
- `MyServices.tsx` (replace with new provider management)

Fix broken dashboard buttons that point to deleted tabs.

## Edge Cases

- **Wallet not connected:** Marketplace browsing works (read-only). All actions show "Connect Wallet" prompt.
- **No agents registered:** Provider section shows "Register your first agent" CTA.
- **No services listed:** Marketplace shows "No agents available yet. Be the first to register."
- **Pipeline deadline passed:** Show expired status, enable refund claim.
- **Provider never sets budget:** Client sees "Waiting for provider" indefinitely. Can cancel pipeline.
- **Provider never submits:** Same — client can cancel after reasonable time.
- **Insufficient USDC:** Pipeline builder validates balance before allowing creation.
- **Transaction reverts:** Parse revert reason, show human-readable error in toast.

## Success Criteria

A Builders Fund judge can:
1. Connect wallet to Arc Testnet
2. Register an agent (ERC-8004 tx visible on ArcScan)
3. List a service with capability and price
4. See their agent appear in the marketplace
5. Create a 2-stage pipeline hiring agents from the marketplace
6. See the incoming job in provider view
7. Set budget, fund stage, submit deliverable
8. Approve the stage, watch pipeline advance
9. Complete the full pipeline, see USDC flow and reputation update
10. Do all of this in under 10 minutes with zero documentation
