export type Tab =
  | "marketplace"
  | "agent-profile"
  | "register-agent"
  | "my-services"
  | "incoming-jobs"
  | "create-pipeline"
  | "my-pipelines"
  | "spending-policy"
  | "activity"
  | "admin";

export type Prefill = {
  provider: string;
  providerAgentId: string;
  amount: string;
};

export type ServiceData = {
  agentId: bigint;
  provider: string;
  capabilityHash: string;
  pricePerTask: bigint;
  metadataURI: string;
  active: boolean;
};

export type AgreementData = {
  client: string;
  provider: string;
  providerAgentId: bigint;
  clientAgentId: bigint;
  amount: bigint;
  deadline: bigint;
  taskHash: string;
  serviceId: bigint;
  status: number;
};

export type PolicyData = {
  maxPerTx: bigint;
  maxDaily: bigint;
  dailySpent: bigint;
  dayStart: bigint;
  exists: boolean;
};

export type PipelineData = {
  clientAgentId: bigint;
  client: string;
  currency: string;
  totalBudget: bigint;
  totalSpent: bigint;
  currentStage: bigint;
  stageCount: bigint;
  status: number; // 0=Active, 1=Completed, 2=Halted, 3=Cancelled
  createdAt: bigint;
  deadline: bigint;
};

export type StageData = {
  providerAgentId: bigint;
  providerAddress: string;
  capabilityHash: string;
  budget: bigint;
  jobId: bigint;
  status: number; // 0=Pending, 1=Active, 2=Completed, 3=Failed
};

export type JobData = {
  id: bigint;
  client: string;
  provider: string;
  evaluator: string;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: number; // 0=Open, 1=Funded, 2=Submitted, 3=Completed, 4=Rejected, 5=Expired
  hook: string;
};
