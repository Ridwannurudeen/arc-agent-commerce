import { ponder } from "ponder:registry";
import { pipeline, stage } from "ponder:schema";
import PipelineOrchestratorAbi from "../abis/PipelineOrchestrator.json" with { type: "json" };

const STAGE_STATUS_LABELS = ["Pending", "Active", "Completed", "Failed", "Refunded"] as const;

const stageId = (pipelineId: bigint, stageIndex: number) =>
  `${pipelineId.toString()}-${stageIndex}`;

ponder.on("PipelineOrchestrator:PipelineCreated", async ({ event, context }) => {
  const { pipelineId, clientAgentId, stageCount, totalBudget, currency } = event.args;

  // Read pipeline.client directly so the schema's `client` matches the contract
  // (msg.sender), not tx.from — these differ for Safe / forwarder calls.
  const onchainPipeline = (await context.client.readContract({
    abi: PipelineOrchestratorAbi as readonly unknown[],
    address: event.log.address,
    functionName: "pipelines",
    args: [pipelineId],
    blockNumber: event.block.number,
  })) as readonly [bigint, `0x${string}`, `0x${string}`, bigint, bigint, number, number, number, bigint, bigint];

  const onchainStages = (await context.client.readContract({
    abi: PipelineOrchestratorAbi as readonly unknown[],
    address: event.log.address,
    functionName: "getStages",
    args: [pipelineId],
    blockNumber: event.block.number,
  })) as ReadonlyArray<{
    providerAgentId: bigint;
    providerAddress: `0x${string}`;
    capabilityHash: `0x${string}`;
    budget: bigint;
    jobId: bigint;
    status: number;
  }>;

  const client = onchainPipeline[1];

  await context.db
    .insert(pipeline)
    .values({
      id: pipelineId,
      clientAgentId,
      client,
      currency,
      totalBudget,
      stageCount: Number(stageCount),
      currentStage: 0,
      createdAt: event.block.timestamp,
      createdTx: event.transaction.hash,
    })
    .onConflictDoUpdate(() => ({
      clientAgentId,
      client,
      currency,
      totalBudget,
      stageCount: Number(stageCount),
      createdAt: event.block.timestamp,
      createdTx: event.transaction.hash,
    }));

  for (let i = 0; i < onchainStages.length; i++) {
    const s = onchainStages[i]!;
    const status = STAGE_STATUS_LABELS[s.status] ?? "Pending";
    const isActive = status === "Active";
    await context.db
      .insert(stage)
      .values({
        id: stageId(pipelineId, i),
        pipelineId,
        stageIndex: i,
        providerAgentId: s.providerAgentId,
        providerAddress: s.providerAddress,
        capabilityHash: s.capabilityHash,
        budget: s.budget,
        jobId: s.jobId === 0n ? null : s.jobId,
        status,
        activatedAt: isActive ? event.block.timestamp : null,
      })
      .onConflictDoUpdate(() => ({
        providerAgentId: s.providerAgentId,
        providerAddress: s.providerAddress,
        capabilityHash: s.capabilityHash,
        budget: s.budget,
      }));
  }
});

ponder.on("PipelineOrchestrator:StageActivated", async ({ event, context }) => {
  const { pipelineId, stageIndex, jobId } = event.args;

  // _activateStage(0) emits StageActivated BEFORE the parent createPipeline emits
  // PipelineCreated. The pipeline + stage rows don't exist yet on the first stage
  // of a brand-new pipeline. The PipelineCreated handler that runs next reads
  // on-chain state and writes stage 0 with status=Active, so it's safe to skip
  // here when the pipeline row is missing.
  const existing = await context.db.find(pipeline, { id: pipelineId });
  if (!existing) return;

  await context.db
    .update(stage, { id: stageId(pipelineId, Number(stageIndex)) })
    .set({
      jobId,
      status: "Active",
      activatedAt: event.block.timestamp,
    });
  await context.db
    .update(pipeline, { id: pipelineId })
    .set({ currentStage: Number(stageIndex) });
});

ponder.on("PipelineOrchestrator:PipelineCompleted", async ({ event, context }) => {
  const { pipelineId, totalSpent } = event.args;
  const p = await context.db.find(pipeline, { id: pipelineId });
  if (!p) return;
  // dust = totalBudget - totalSpent is refunded to client on completion (see
  // PipelineOrchestrator.sol:237). The PipelineCompleted event doesn't carry it,
  // so derive from the row we already have.
  const dust = p.totalBudget - totalSpent;
  await context.db
    .update(pipeline, { id: pipelineId })
    .set({
      status: "Completed",
      totalSpent,
      refundAmount: dust,
      completedAt: event.block.timestamp,
    });
});

ponder.on("PipelineOrchestrator:PipelineHalted", async ({ event, context }) => {
  const { pipelineId, failedStage, refundAmount } = event.args;
  const failedIdx = Number(failedStage);

  const p = await context.db.find(pipeline, { id: pipelineId });
  if (!p) return;

  await context.db
    .update(pipeline, { id: pipelineId })
    .set({
      status: "Halted",
      failedStage: failedIdx,
      refundAmount,
      haltedAt: event.block.timestamp,
    });

  // Contract marks the failed stage and every later stage as Failed
  // (see PipelineOrchestrator.sol:254-262). Mirror that in the indexer.
  for (let i = failedIdx; i < p.stageCount; i++) {
    await context.db
      .update(stage, { id: stageId(pipelineId, i) })
      .set({
        status: "Failed",
        rejectedAt: i === failedIdx ? event.block.timestamp : null,
        rejectedTx: i === failedIdx ? event.transaction.hash : null,
      });
  }
});

ponder.on("PipelineOrchestrator:PipelineCancelled", async ({ event, context }) => {
  const { pipelineId, refundAmount } = event.args;

  const p = await context.db.find(pipeline, { id: pipelineId });
  if (!p) return;

  await context.db
    .update(pipeline, { id: pipelineId })
    .set({
      status: "Cancelled",
      refundAmount,
      cancelledAt: event.block.timestamp,
    });

  // Contract marks every non-Completed stage as Failed (PipelineOrchestrator.sol:282-286).
  for (let i = 0; i < p.stageCount; i++) {
    const s = await context.db.find(stage, { id: stageId(pipelineId, i) });
    if (!s || s.status === "Completed") continue;
    await context.db
      .update(stage, { id: stageId(pipelineId, i) })
      .set({ status: "Failed" });
  }
});

ponder.on("CommerceHook:StageApproved", async ({ event, context }) => {
  const { pipelineId, stageIndex } = event.args;
  await context.db
    .update(stage, { id: stageId(pipelineId, Number(stageIndex)) })
    .set({
      status: "Completed",
      approvedAt: event.block.timestamp,
      approvedTx: event.transaction.hash,
    });
});

ponder.on("CommerceHook:StageAutoApproved", async ({ event, context }) => {
  const { pipelineId, stageIndex } = event.args;
  await context.db
    .update(stage, { id: stageId(pipelineId, Number(stageIndex)) })
    .set({
      status: "Completed",
      approvedAt: event.block.timestamp,
      approvedTx: event.transaction.hash,
    });
});

ponder.on("CommerceHook:StageRejected", async ({ event, context }) => {
  const { pipelineId, stageIndex, reason } = event.args;
  await context.db
    .update(stage, { id: stageId(pipelineId, Number(stageIndex)) })
    .set({
      rejectReason: reason,
      // status -> "Failed" is set by the orchestrator's PipelineHalted handler,
      // which fires in the same tx and also handles the cascading Failed marks
      // for unstarted stages. Don't write status here to avoid double-write races.
      rejectedAt: event.block.timestamp,
      rejectedTx: event.transaction.hash,
    });
});
