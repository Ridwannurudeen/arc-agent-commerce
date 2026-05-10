# InvoiceFlow — reference integration

A 200-line B2B invoice settlement app built on the Agent Commerce Protocol. When an accounts-payable team approves an invoice for payment, InvoiceFlow funds the entire payout into a 3-stage pipeline:

1. **Validation** — a validator agent checks invoice format, line items, and totals.
2. **KYB screening** — a compliance agent screens the vendor against sanctions and risk lists.
3. **Settlement** — a settlement agent executes the USDC transfer to the vendor.

If validation or KYB fails, the unstarted stage budgets refund atomically in the same transaction. AP locks the payout up-front; the protocol only releases per stage on approval.

## Why compose the pipeline orchestrator instead of writing this directly?

A naive implementation needs:
- A custom escrow contract that holds the full payout
- Per-stage release logic with refund accounting
- A way to attribute reputation to each provider

The orchestrator gives all three as a primitive. Stage funds live in ERC-8183 jobs, reputation lives on ERC-8004, and the conditional halt + refund is atomic by construction.

InvoiceFlow itself is one Python file. It does no escrow accounting of its own.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env  # fill in keys + agent IDs
python app.py invoice-sample.json
```

`.env` requires three Arc Testnet wallets — AP team and two providers (validator, KYB). The settlement stage forwards USDC, so the third provider is the vendor wallet itself.

```
ARC_AP_PK=0x...            # accounts-payable wallet (client)
ARC_AP_AGENT_ID=...
ARC_VALIDATOR_PK=0x...     # validation provider
ARC_VALIDATOR_AGENT_ID=...
ARC_KYB_PK=0x...           # KYB provider
ARC_KYB_AGENT_ID=...
VENDOR_ADDRESS=0x...       # vendor receiving final payout
VENDOR_AGENT_ID=...
```

## What this demonstrates

- A third-party Arc app composing `PipelineOrchestrator` via the published `arc-commerce-sdk` package.
- The KYB-fail path: invoke `--simulate-kyb-reject` to halt the pipeline at stage 2 and watch unstarted budget refund to AP in the same call.
- Pipelines as a primitive: this app reads from the orchestrator and SDK only — no custom escrow, no custom reputation table.

## Caveats

The validator/KYB/settlement agents are scripted (the AP wallet drives `approve_stage` / `reject_stage`). In production, those would be independent agents responding to ERC-8183 job assignments. The composition pattern is identical either way — the orchestrator doesn't care who calls `approveStage`, only that the call comes from the configured evaluator role.
