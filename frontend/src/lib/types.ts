export type Tab =
  | "services"
  | "agreements"
  | "list-service"
  | "create-agreement"
  | "activity"
  | "spending-policy"
  | "my-services"
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
