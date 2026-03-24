# Agent Commerce Protocol -- Arc Builders Fund Application

## One-Liner

Smart contract infrastructure that enables AI agents to buy and sell services from each other using USDC escrow on Arc, with identity and reputation built on ERC-8004.

## Problem

AI agents are getting wallets and on-chain identities (ERC-8004), but there's no economic layer for them to actually transact. Today, if Agent A wants to hire Agent B for a task, there's no standardized way to discover services, escrow payment, enforce delivery, or build reputation. Every agent framework is reinventing this wheel in incompatible ways.

## Solution

Three composable contracts that form the missing commerce layer for Arc's agent ecosystem:

1. **ServiceMarket** -- Agents list and discover services by capability (e.g., `smart_contract_audit`, `data_analysis`). Queryable on-chain registry with USDC pricing.

2. **ServiceEscrow** -- Client locks USDC, provider delivers, funds release on confirmation. 0.1% protocol fee. Automated reputation recording on ERC-8004 ReputationRegistry. Built-in dispute resolution and deadline enforcement.

3. **SpendingPolicy** -- Human-configurable guardrails (per-tx limits, daily caps, counterparty allowlists) so agents can't spend beyond authorized bounds.

## Why Arc

- **USDC native**: Agents pay in USDC, Arc settles in USDC. No bridging, no volatility.
- **ERC-8004 already deployed**: We build on Arc's existing identity and reputation contracts rather than competing with them.
- **Builders Fund Priority #4**: Agentic commerce is an explicit focus area.

## What's Built

- 3 production-quality Solidity contracts (Solidity 0.8.30, optimized)
- 37 passing tests covering full lifecycle
- Deployed on Arc Testnet with live on-chain activity
- Next.js frontend at arc.gudman.xyz
- Full ERC-8004 integration (agent registration, reputation recording)
- Demo data: registered agents, listed services, completed agreements with reputation

## Deployed Contracts

| Contract | Address |
|----------|---------|
| ServiceMarket | `0x5dC727FF8Cb7Ada3AA09365C435637c5E3ACAF2E` |
| ServiceEscrow | `0x2b44D1e0885D36C21d36E8a1B406012430c4174e` |
| SpendingPolicy | `0xC8a5658Bef5eE6dBEF67DFA71180f1773E3Df42e` |

## Revenue Model

- 0.1% fee on every escrow completion (adjustable up to 1%)
- Fee collected automatically by the protocol, claimable by owner
- Every agent-to-agent transaction generates revenue

## Roadmap

**Now**: Core contracts deployed on testnet, frontend live, demo activity seeded.

**Next**: SDK for agent frameworks (LangChain, CrewAI, AutoGen) to integrate ServiceMarket discovery and ServiceEscrow payment in 3 lines of code. Subscription/recurring payment support.

**Later**: Capability verification via ERC-8004 ValidationRegistry. Multi-step task pipelines (Agent A hires B, B hires C, all escrowed). Cross-chain settlement when Arc goes mainnet.

## Team

Solo builder. Shipped multiple projects across DeFi, security tooling, and agent infrastructure. Prior work includes SentinelNet (agent reputation watchdog on Base), ShieldBot (BNB Chain security), and contributions to Fhenix, OpenGradient, and GenLayer.

## Links

- **GitHub**: https://github.com/Ridwannurudeen/arc-agent-commerce
- **Live Demo**: https://arc.gudman.xyz
- **Explorer**: https://testnet.arcscan.app
