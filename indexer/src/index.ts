import { ponder } from "ponder:registry";
import { pipeline, stage } from "ponder:schema";
import PipelineOrchestratorAbi from "../abis/PipelineOrchestrator.json" with { type: "json" };

const stageId = (pipelineId: bigint, stageIndex: number) =>
  `${pipelineId.toString()}-${stageIndex}`;

ponder.on("PipelineOrchestrator:PipelineCreated", async ({ event, context }) => {
  const { pipelineId, clientAgentId, stageCount, totalBudget, currency } = event.args;

  const tx = await context.client.getTransaction({ hash: event.transaction.hash });
  const stages = (await context.client.readContract({
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

  await context.db.insert(pipeline).values({
    id: pipelineId,
    clientAgentId,
    client: tx.from,
    currency,
    totalBudget,
    stageCount: Number(stageCount),
    createdAt: event.block.timestamp,
    createdTx: event.transaction.hash,
  });

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    await context.db.insert(stage).values({
      id: stageId(pipelineId, i),
      pipelineId,
      stageIndex: i,
      providerAgentId: s.providerAgentId,
      providerAddress: s.providerAddress,
      capabilityHash: s.capabilityHash,
      budget: s.budget,
    });
  }
});

ponder.on("PipelineOrchestrator:StageActivated", async ({ event, context }) => {
  const { pipelineId, stageIndex, jobId } = event.args;
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
  await context.db
    .update(pipeline, { id: pipelineId })
    .set({
      status: "Completed",
      totalSpent,
      completedAt: event.block.timestamp,
    });
});

ponder.on("PipelineOrchestrator:PipelineHalted", async ({ event, context }) => {
  const { pipelineId, failedStage, refundAmount } = event.args;
  await context.db
    .update(pipeline, { id: pipelineId })
    .set({
      status: "Halted",
      failedStage: Number(failedStage),
      refundAmount,
      haltedAt: event.block.timestamp,
    });
});

ponder.on("PipelineOrchestrator:PipelineCancelled", async ({ event, context }) => {
  const { pipelineId, refundAmount } = event.args;
  await context.db
    .update(pipeline, { id: pipelineId })
    .set({
      status: "Cancelled",
      refundAmount,
      cancelledAt: event.block.timestamp,
    });
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
      status: "Failed",
      rejectReason: reason,
      rejectedAt: event.block.timestamp,
      rejectedTx: event.transaction.hash,
    });
});
