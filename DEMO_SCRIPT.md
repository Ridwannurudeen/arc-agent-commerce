# Agent Commerce Protocol -- 90-Second Demo Script

Target: Arc Builders Fund / community reviewers. Goal: show that an ERC-8183 conditional sequencer is a real, composable primitive on Arc -- not a vertical app.

Live site: https://arc.gudman.xyz

---

## Recording Checklist

- [ ] Browser: Chrome, dark mode, 1920x1080, zoom 100%
- [ ] Wallet: MetaMask connected to Arc Testnet (chain 5042002)
- [ ] Deploy wallet `0x917a630f4bd294b68C3ABfD1DD61bff6F6F2d44E` loaded with testnet USDC
- [ ] Clear browser tabs -- only arc.gudman.xyz open
- [ ] DevTools closed, bookmarks bar hidden
- [ ] Screen recorder: OBS or Loom, 1080p, mic audio only (no system audio)
- [ ] Pre-load all pages once so data is cached and loads instantly
- [ ] Have Pipeline #0 already completed (audit + deploy stages both done) for the tracker demo
- [ ] Have at least 2-3 services registered in the marketplace

---

## Section 1: Opening Shot (0:00 - 0:05)

**Screen:** Land on arc.gudman.xyz. Marketplace tab is active. Services are visible.

**Voiceover:**
"ERC-8183 is a single-job primitive. Agent Commerce Protocol turns it into a sequence: ordered ERC-8183 jobs, atomically funded, conditionally halted. A primitive any Arc app can compose."

**Text overlay:** `Agent Commerce Protocol -- ERC-8183 conditional sequencer on Arc`

---

## Section 2: Browse Services (0:05 - 0:20)

**Screen actions:**
1. Show the marketplace header: "Agent Marketplace" with service count and capability count
2. Click a capability filter button (e.g., "Audit") -- list filters to audit-only services
3. Click "All" to show everything again
4. Hover over a service card -- point out: Agent ID, capability badge, price in USDC, reputation badge (e.g., "2/2 jobs")
5. Click "Profile" on one agent to transition to next section

**Voiceover:**
"Agents register services on-chain with capability tags and USDC pricing. Clients browse by capability, see live reputation from completed jobs, and hire directly."

**Text overlay (0:12):** `On-chain services -- USDC pricing -- Live reputation badges`

---

## Section 3: Agent Directory (0:20 - 0:30)

**Screen actions:**
1. Click "Agent Directory" in the sidebar (Ecosystem section)
2. Show the list of registered agents with their IDs and addresses
3. Click on an agent to expand their profile -- show their registered services, capabilities, and job history

**Voiceover:**
"Every agent has an ERC-8004 identity. The directory shows registered agents, their capabilities, and their on-chain track record. No off-chain profiles -- everything is verifiable."

**Text overlay (0:25):** `ERC-8004 identity -- On-chain agent profiles`

---

## Section 4: Create Pipeline (0:30 - 0:50)

**Screen actions:**
1. Click "Create Pipeline" in the sidebar (Client section)
2. Set Client Agent ID to `933`
3. Currency is already USDC -- leave it
4. Stage 1: paste provider address, set Agent ID `1149`, select "Audit" capability, budget `1` USDC
5. Click "+ Add Stage"
6. Stage 2: paste second provider address, set Agent ID, select "Deploy" capability, budget `1` USDC
7. Show the total budget summary: "Total Budget: 2.00 USDC (2 stages)"
8. Click "Approve USDC" -- show MetaMask popup, confirm
9. Step indicator advances: 1. Approve (check) -> 2. Create
10. Click "Create Pipeline" -- show MetaMask popup, confirm
11. Toast appears: "Pipeline created successfully"

**Voiceover:**
"Build a multi-stage pipeline. Audit first, then deploy. Total budget is locked in one transaction. Each stage becomes a native ERC-8183 job. If the audit fails, deployment never starts -- budget is refunded automatically."

**Text overlay (0:35):** `Audit -> Deploy -- 2 USDC locked atomically`
**Text overlay (0:45):** `Each stage = native ERC-8183 job with escrow`

---

## Section 5: Pipeline Tracker (0:50 - 1:10)

**Screen actions:**
1. Click "My Pipelines" in the sidebar
2. Click on Pipeline #0 (the pre-completed one) to expand the tracker
3. Show the stage progress bar: Stage 1 (Audit - Completed, green) and Stage 2 (Deploy - Completed, green)
4. Point out: budget spent vs total, pipeline status "Completed"
5. Then show an active pipeline (if available) -- highlight the "Fund Stage" button and the approve/reject controls
6. Show "Spent: X / Y USDC" budget tracking

**Voiceover:**
"The tracker shows real-time stage progression. When a provider submits work, the client approves or rejects. Approval advances the pipeline and records reputation on ERC-8004. Rejection halts everything and refunds unstarted stages. This is Pipeline zero -- two stages, both completed, reputation recorded on-chain."

**Text overlay (0:55):** `Approve -> advance + reputation | Reject -> halt + refund`
**Text overlay (1:05):** `CommerceHook records reputation on ERC-8004 automatically`

---

## Section 6: Activity Feed (1:10 - 1:20)

**Screen actions:**
1. Click "Activity" in the sidebar (Marketplace section)
2. Show the unified timeline of protocol events -- pipeline creations, stage completions, approvals
3. Scroll briefly to show multiple events with timestamps and transaction links

**Voiceover:**
"The activity feed is a unified timeline of every protocol action. Pipeline creations, stage advances, approvals, rejections -- all linked to on-chain transactions on Arc Testnet."

**Text overlay (1:15):** `Full protocol activity -- every action on-chain`

---

## Section 7: ACP Jobs Explorer (1:20 - 1:30)

**Screen actions:**
1. Click "ACP Jobs" in the sidebar (Ecosystem section)
2. Show the list of real ERC-8183 jobs on Arc -- job IDs, statuses, budgets
3. Point out jobs #36 and #37 (the ones created by Pipeline #0)
4. Hold for a moment to let it sink in -- these are native Arc jobs, not custom escrow

**Voiceover:**
"Every pipeline stage is a real ACP job on Arc's native ERC-8183. Jobs 36 and 37 are the audit and deploy stages from our pipeline. We don't reimplement escrow -- we compose Arc's."

**Text overlay (1:22):** `Native ERC-8183 composition -- not reimplementation`
**Text overlay (1:28):** `This protocol is impossible without Arc`

---

## Key Messages to Hit

These three points must land clearly for a reviewer:

1. **It's a primitive, not an app.** Two thin contracts. No new escrow, no new identity, no new token. Other Arc projects compose it; it does not compete with them.
2. **Composition, not reimplementation.** Each pipeline stage is a native ERC-8183 job. Reputation is native ERC-8004. We coordinate, Arc settles.
3. **Conditional, atomic, fee-free.** Stages advance on approval, halt on rejection, refund unstarted budgets in the same call. The protocol takes no fee on the primitive itself.

---

## Timing Summary

| Section | Duration | Cumulative |
|---------|----------|------------|
| Opening shot | 5s | 0:05 |
| Browse Services | 15s | 0:20 |
| Agent Directory | 10s | 0:30 |
| Create Pipeline | 20s | 0:50 |
| Pipeline Tracker | 20s | 1:10 |
| Activity Feed | 10s | 1:20 |
| ACP Jobs Explorer | 10s | 1:30 |
| **Total** | **90s** | **1:30** |

---

## Recording Tips

- Move the cursor deliberately, not frantically. Judges are watching, not speed-running.
- Pause 1-2 seconds on each important UI element before moving on.
- If MetaMask popups are slow, pre-record those separately and splice in.
- Keep voiceover calm and confident. No filler words. No "um" or "so basically."
- Record voiceover separately if your mic picks up keyboard/mouse noise.
- Final frame: hold on the ACP Jobs view for 2 seconds with the text overlay visible.
