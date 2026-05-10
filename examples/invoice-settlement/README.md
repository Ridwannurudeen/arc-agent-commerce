# InvoiceFlow — reference integration

A small B2B invoice settlement app built on the Agent Commerce Protocol. When an accounts-payable team approves an invoice for payment, InvoiceFlow funds the entire payout into a 3-stage pipeline:

1. **Validation** — a validator agent checks invoice format, line items, and totals.
2. **KYB screening** — a compliance agent screens the vendor against sanctions and risk lists.
3. **Settlement** — the vendor receives payout via the final ERC-8183 job.

If validation or KYB fails, the unstarted stage budgets refund atomically in the same transaction. AP locks the payout up-front; the protocol only releases per stage on approval.

## Why compose the pipeline orchestrator instead of writing this directly?

A naive implementation needs:
- A custom escrow contract that holds the full payout
- Per-stage release logic with refund accounting
- A way to attribute reputation to each provider

The orchestrator gives all three as a primitive. Stage funds live in ERC-8183 jobs, reputation lives on ERC-8004, and the conditional halt + refund of unstarted stages is atomic by construction. The app itself does no escrow accounting.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env  # fill in 4 wallets + 4 agent IDs
python app.py invoice-sample.json
```

`.env` requires four Arc Testnet wallets — AP team, validator, KYB, vendor. Each must be a registered ERC-8004 agent. The AP wallet needs `total_usdc` USDC plus gas; the providers need only gas.

```
ARC_AP_PK=0x...           ARC_AP_AGENT_ID=...
ARC_VALIDATOR_PK=0x...    ARC_VALIDATOR_AGENT_ID=...
ARC_KYB_PK=0x...          ARC_KYB_AGENT_ID=...
ARC_VENDOR_PK=0x...       ARC_VENDOR_AGENT_ID=...
```

Each stage runs the standard ERC-8183 lifecycle (`Open → setBudget → fund → submit → approve`). The example drives all four roles in a single process so you can watch the conditional halt happen — in production each role would be a separate agent.

## What this demonstrates

- A third-party Arc app composing `PipelineOrchestrator` via the published `arc-commerce-sdk` package.
- The full ERC-8183 lifecycle per stage: provider quotes via `setBudget`, client funds via `fundStage`, provider delivers via `submit`, client decides via `approveStage`/`rejectStage`.
- The KYB-fail path: `python app.py invoice-sample.json --simulate-kyb-reject` halts the pipeline at stage 2 and the unstarted settlement budget refunds to AP in the same call. The rejected stage's already-funded budget stays in ACP escrow until `claimRefund(jobId)` (the orchestrator only refunds *unstarted* stage budgets atomically).

## Caveats

For brevity the example drives all four roles from one process. In production:
- Each provider is a separate agent reacting to its own `StageActivated` event.
- The deliverable hashes here are stub `keccak256` digests; real providers would commit to validation reports / KYB clearance documents / settlement tx receipts.
- The vendor stage uses the ERC-8183 lifecycle for symmetry with validation and KYB. A simpler design would be a 2-stage pipeline (validation, KYB) followed by a direct USDC transfer on approval, dropping one of the four wallets.
