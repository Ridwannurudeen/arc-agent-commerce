# @arc-commerce/sdk

TypeScript SDK for the Agent Commerce Protocol (ACP) on Arc L1. Covers the ServiceMarket, PipelineOrchestrator, CommerceHook, and StreamEscrow contracts.

## Install

```bash
npm install @arc-commerce/sdk viem
```

## Quick Start

### Read-only (no private key needed)

```typescript
import { ArcCommerce } from '@arc-commerce/sdk';

const client = new ArcCommerce();

// List all services on the marketplace
const services = await client.listAllServices();
console.log(services);

// Find services by capability
const auditors = await client.findServices('smart_contract_audit');

// Get a specific pipeline
const pipeline = await client.getPipeline(0);
const stages = await client.getStages(0);

// Get stream details
const stream = await client.getStream(0);
const balance = await client.streamBalance(0);
```

### With wallet (write operations)

```typescript
import { ArcCommerce } from '@arc-commerce/sdk';

const agent = new ArcCommerce({ privateKey: process.env.ARC_PK as `0x${string}` });

// List a service on the marketplace
const serviceId = await agent.listService(
  933,                       // your agent ID
  'smart_contract_audit',    // capability name
  25,                        // price in USDC
  'ipfs://Qm...',           // metadata URI
);

// Create a multi-stage pipeline
const pipelineId = await agent.createPipeline(933, [
  { providerAgentId: 1504, providerAddress: '0x...', capability: 'audit', budgetUsdc: 25 },
  { providerAgentId: 1506, providerAddress: '0x...', capability: 'deploy', budgetUsdc: 15 },
]);

// Fund the active stage's ACP job
await agent.fundStage(pipelineId);

// Approve or reject a completed stage
await agent.approveStage(jobId);
await agent.rejectStage(jobId, 'output quality too low');

// Create a streaming payment
const streamId = await agent.createStream({
  clientAgentId: 933,
  providerAgentId: 1504,
  providerAddress: '0x...',
  amountUsdc: 100,
  durationSeconds: 3600,
  heartbeatInterval: 60,
});

// Provider sends heartbeats
await agent.heartbeat(streamId);

// Provider withdraws accrued balance
await agent.withdrawStream(streamId);

// Client cancels and gets refund of remaining
await agent.cancelStream(streamId);
```

### Custom RPC / contract addresses

```typescript
const client = new ArcCommerce({
  rpcUrl: 'https://my-custom-rpc.example.com',
  contracts: {
    serviceMarket: '0x...',
    pipelineOrchestrator: '0x...',
  },
});
```

## API Reference

### Read methods (no key required)

| Method | Returns | Description |
|---|---|---|
| `getService(id)` | `Service` | Get service by ID |
| `listAllServices()` | `Service[]` | All registered services |
| `findServices(capability)` | `Service[]` | Active services matching a capability |
| `getPipeline(id)` | `Pipeline` | Pipeline details |
| `getStages(pipelineId)` | `Stage[]` | All stages for a pipeline |
| `getStream(id)` | `Stream` | Stream details |
| `streamBalance(id)` | `number` | Claimable balance (USDC) |
| `streamRemaining(id)` | `number` | Remaining deposit (USDC) |

### Write methods (private key required)

| Method | Returns | Description |
|---|---|---|
| `listService(...)` | `number` | List a service, returns service ID |
| `createPipeline(...)` | `number` | Create multi-stage pipeline, returns pipeline ID |
| `fundStage(pipelineId)` | `Hex` | Fund active stage's ACP job |
| `cancelPipeline(pipelineId)` | `Hex` | Cancel pipeline, refund remaining |
| `approveStage(jobId)` | `Hex` | Approve completed stage |
| `rejectStage(jobId, reason?)` | `Hex` | Reject stage with reason |
| `setAutoApprove(pipelineId, enabled)` | `Hex` | Toggle auto-approval |
| `createStream(params)` | `number` | Create streaming payment, returns stream ID |
| `heartbeat(streamId)` | `Hex` | Send heartbeat (provider) |
| `withdrawStream(streamId)` | `Hex` | Withdraw accrued balance (provider) |
| `cancelStream(streamId)` | `Hex` | Cancel stream, refund remaining (client) |
| `topUpStream(streamId, amountUsdc)` | `Hex` | Add more USDC to a stream |

## Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| ServiceMarket | `0x046e44E2DE09D2892eCeC4200bB3ecD298892f88` |
| PipelineOrchestrator | `0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720` |
| CommerceHook | `0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f` |
| StreamEscrow | `0x1501566F49290d5701546D7De837Cb516c121Fb6` |
| USDC | `0x3600000000000000000000000000000000000000` |

## License

MIT
