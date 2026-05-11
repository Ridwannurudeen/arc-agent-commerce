import type { Address, Hex } from 'viem';

// ── Enums ──

export enum PipelineStatus {
  Active = 0,
  Completed = 1,
  Cancelled = 2,
  Halted = 3,
}

export enum StageStatus {
  Pending = 0,
  Active = 1,
  Completed = 2,
  Rejected = 3,
}

export enum StreamStatus {
  Active = 0,
  Paused = 1,
  Completed = 2,
  Cancelled = 3,
}

// ── Read types ──

export type Service = {
  serviceId: number;
  agentId: number;
  provider: Address;
  capabilityHash: Hex;
  pricePerTask: bigint;
  priceUsdc: number;
  metadataUri: string;
  active: boolean;
};

export type Pipeline = {
  pipelineId: number;
  clientAgentId: number;
  client: Address;
  currency: Address;
  totalBudget: bigint;
  totalSpent: bigint;
  currentStage: number;
  stageCount: number;
  status: PipelineStatus;
  createdAt: number;
  deadline: number;
};

export type Stage = {
  providerAgentId: number;
  providerAddress: Address;
  capabilityHash: Hex;
  budget: bigint;
  jobId: number;
  status: StageStatus;
};

export type Stream = {
  streamId: number;
  client: Address;
  provider: Address;
  clientAgentId: number;
  providerAgentId: number;
  currency: Address;
  deposit: bigint;
  withdrawn: bigint;
  startTime: number;
  endTime: number;
  heartbeatInterval: number;
  lastHeartbeat: number;
  missedBeats: number;
  pausedAt: number;
  totalPausedTime: number;
  status: StreamStatus;
};

// ── Write param types ──

export type StageParam = {
  providerAgentId: number;
  providerAddress: Address;
  capability: string;
  budgetUsdc: number;
};

export type CreateStreamParams = {
  clientAgentId: number;
  providerAgentId: number;
  providerAddress: Address;
  amountUsdc: number;
  durationSeconds: number;
  heartbeatInterval?: number;
};

export type PipelineOpts = {
  currency?: 'USDC' | 'EURC' | Address;
  deadlineHours?: number;
  autoApproveUsdc?: boolean;
};

export type ArcCommerceConfig = {
  privateKey?: Hex;
  rpcUrl?: string;
  contracts?: Partial<ContractAddresses>;
};

export type ContractAddresses = {
  serviceMarket: Address;
  pipelineOrchestrator: Address;
  commerceHook: Address;
  streamEscrow: Address;
  identityRegistry: Address;
  usdc: Address;
  eurc: Address;
};
