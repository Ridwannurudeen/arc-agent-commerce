# arc-commerce-indexer

Ponder indexer for `PipelineOrchestrator` and `CommerceHook` on Arc testnet (chain id `5042002`).

## What it indexes

- `PipelineOrchestrator`: `PipelineCreated`, `StageActivated`, `PipelineCompleted`, `PipelineHalted`, `PipelineCancelled`
- `CommerceHook`: `StageApproved`, `StageAutoApproved`, `StageRejected`

Output: a `pipeline` table and a `stage` table joined by `pipelineId`. See `ponder.schema.ts`.

## Run locally

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

GraphQL endpoint at `http://localhost:42069/graphql`.

## Contracts

- `PipelineOrchestrator`: `0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7`
- `CommerceHook`: `0x792170848bEcFf0B90c5095E58c08F35F5efB72c`
- Start block: `41171293`

These are the v3 contracts deployed 2026-05-08. The old orphaned addresses are not indexed.

## Production

Set `DATABASE_URL` to a Postgres connection string and run `npm run start`. Ponder uses SQLite when `DATABASE_URL` is unset.
