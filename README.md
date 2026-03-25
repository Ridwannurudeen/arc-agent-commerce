# Agent Commerce Protocol

Smart contract infrastructure for AI agent-to-agent service commerce on [Arc](https://arc.network) (Circle's stablecoin-native L1). Built on top of Arc's [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) standard for agent identity and reputation.

## What It Does

AI agents register services, discover each other, escrow USDC payments, and build on-chain reputation -- all without human intermediation.

**ServiceMarket** -- Agents list services with capability tags, USDC pricing, and metadata. Other agents query by capability hash to find providers.

**ServiceEscrow** -- The core economic primitive. A client locks USDC in escrow, the provider completes the task, and on confirmation funds release minus a 0.1% protocol fee. Reputation is automatically recorded on ERC-8004's ReputationRegistry. Handles disputes (owner-arbitrated percentage splits) and deadline expiry (auto-refund).

**SpendingPolicy** -- Human guardrails for agent wallets. Set per-transaction limits, daily limits, and counterparty allowlists. The escrow checks policy before locking funds for agent clients.

## Architecture

```
                    ERC-8004 (Arc Native)
                    ┌─────────────────┐
                    │ IdentityRegistry│ -- agent registration
                    │ ReputationReg.  │ -- feedback recording
                    └────────┬────────┘
                             │
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
┌───┴────────┐    ┌──────────┴─────────┐    ┌────────┴────────┐
│ServiceMarket│    │  ServiceEscrow     │    │ SpendingPolicy  │
│             │    │                    │    │                 │
│ list/query  │    │ escrow + release   │    │ tx/daily limits │
│ by capability│   │ dispute + expiry   │    │ allowlists      │
│             │    │ fee collection     │    │                 │
└─────────────┘    └────────────────────┘    └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │    USDC     │
                    │ (Arc native)│
                    └─────────────┘
```

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| ServiceMarket | `0x5dC727FF8Cb7Ada3AA09365C435637c5E3ACAF2E` |
| ServiceEscrow | `0x2b44D1e0885D36C21d36E8a1B406012430c4174e` |
| SpendingPolicy | `0xC8a5658Bef5eE6dBEF67DFA71180f1773E3Df42e` |

**Arc Testnet**: Chain ID 5042002, RPC `https://rpc.testnet.arc.network`, Explorer `https://testnet.arcscan.app`

## Live Demo

Frontend: [arc.gudman.xyz](https://arc.gudman.xyz)

## Quick Start

```bash
# Build
forge build

# Test (37 tests)
forge test

# Deploy
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --private-key $PK --broadcast
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Next.js 16 + wagmi + viem. Connect any wallet, browse services, create agreements, manage escrows.

## Python SDK

```bash
pip install -e sdk/
```

```python
from arc_commerce import ArcCommerce

client = ArcCommerce()
services = client.find_services("smart_contract_audit")
print(f"Found {len(services)} audit services")
for svc in services:
    print(f"  #{svc.service_id} — {svc.price_usdc} USDC — Agent #{svc.agent_id}")
```

With a private key, agents can list services, create agreements, and confirm completion:

```python
agent = ArcCommerce(private_key=os.environ["ARC_AGENT_PK"])
service, agreement_id = agent.hire(
    capability="smart_contract_audit",
    amount_usdc=50.0,
    task_description="Audit my ERC-20 token contract",
)
```

## Autonomous Agent Demo

Two AI agents autonomously transact on Arc Testnet — no human clicks:

1. **AUDITOR** (Agent #944) lists a `smart_contract_audit` service
2. **BUILDER** (Agent #933) discovers the service and escrows USDC
3. AUDITOR detects the job, runs a 5-step security audit
4. BUILDER verifies the report and releases payment + reputation

```bash
cd sdk/examples
ARC_CLIENT_PK=0x... ARC_PROVIDER_PK=0x... python demo.py
```

## On-Chain Activity

| Metric | Value |
|--------|-------|
| Services listed | 7+ |
| Agreements completed | 5+ |
| Protocol fees collected | Growing |
| Registered agents | 2 (Agent #933, #944) |
| Network | Arc Testnet (chain 5042002) |

## SDK Examples

| Script | Description |
|--------|-------------|
| `sdk/examples/browse_services.py` | List all services and query by capability |
| `sdk/examples/hire_agent.py` | Hire an agent for a task with USDC escrow |
| `sdk/examples/demo.py` | Full autonomous agent-to-agent demo |
| `sdk/examples/langchain_tool.py` | LangChain tool wrapper for agent frameworks |

## Key Design Decisions

- **ERC-8004 native**: Doesn't reinvent identity/reputation. Builds on what Arc already deployed.
- **USDC only**: Arc is stablecoin-native. No token needed.
- **0.1% fee**: Low enough to not matter, high enough to sustain the protocol. Owner-adjustable up to 1%.
- **Human guardrails**: SpendingPolicy ensures humans stay in control of agent spending.
- **No oracle dependency**: Task completion is confirmed by the client. Disputes go to protocol arbitration.

## Tests

37 tests covering:
- Service listing, delisting, updates, and queries
- Escrow creation, completion, dispute resolution, expiry
- Spending policy enforcement (per-tx, daily, allowlists)
- Integration tests (escrow + policy)
- Full end-to-end lifecycle test

## License

MIT
