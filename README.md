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
