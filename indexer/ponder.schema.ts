import { onchainTable, relations } from "ponder";

const PIPELINE_STATUS = ["Active", "Completed", "Halted", "Cancelled"] as const;
const STAGE_STATUS = ["Pending", "Active", "Completed", "Failed", "Refunded"] as const;

export const pipeline = onchainTable("pipeline", (t) => ({
  id: t.bigint().primaryKey(),
  clientAgentId: t.bigint().notNull(),
  client: t.hex().notNull(),
  currency: t.hex().notNull(),
  totalBudget: t.bigint().notNull(),
  totalSpent: t.bigint().notNull().default(0n),
  refundAmount: t.bigint().notNull().default(0n),
  stageCount: t.integer().notNull(),
  currentStage: t.integer().notNull().default(0),
  status: t.text().notNull().default("Active"),
  failedStage: t.integer(),
  createdAt: t.bigint().notNull(),
  createdTx: t.hex().notNull(),
  completedAt: t.bigint(),
  haltedAt: t.bigint(),
  cancelledAt: t.bigint(),
}));

export const stage = onchainTable("stage", (t) => ({
  id: t.text().primaryKey(),
  pipelineId: t.bigint().notNull(),
  stageIndex: t.integer().notNull(),
  providerAgentId: t.bigint().notNull(),
  providerAddress: t.hex().notNull(),
  capabilityHash: t.hex().notNull(),
  budget: t.bigint().notNull(),
  jobId: t.bigint(),
  status: t.text().notNull().default("Pending"),
  rejectReason: t.text(),
  activatedAt: t.bigint(),
  approvedAt: t.bigint(),
  rejectedAt: t.bigint(),
  approvedTx: t.hex(),
  rejectedTx: t.hex(),
}));

export const pipelineRelations = relations(pipeline, ({ many }) => ({
  stages: many(stage),
}));

export const stageRelations = relations(stage, ({ one }) => ({
  pipeline: one(pipeline, {
    fields: [stage.pipelineId],
    references: [pipeline.id],
  }),
}));

export { PIPELINE_STATUS, STAGE_STATUS };
