const REVERT_REASONS: Record<string, string> = {
  // V1/V2
  NotAgentOwner: "You don't own this agent",
  ZeroPrice: "Price must be greater than zero",
  InvalidAmount: "Amount must be greater than zero",
  PolicyCheckFailed: "Spending policy limit exceeded",
  NotClient: "Only the client can perform this action",
  NotProvider: "Only the provider can perform this action",
  NotOwner: "Only the contract owner can perform this action",
  AlreadyCompleted: "This agreement is already completed",
  AlreadyDisputed: "This agreement is already disputed",
  NotActive: "This agreement is not active",
  DeadlineNotPassed: "The deadline has not passed yet",
  DeadlinePassed: "The deadline has already passed",
  ServiceNotActive: "This service is not active",
  InsufficientAllowance: "Insufficient USDC allowance — approve first",
  InsufficientBalance: "Insufficient USDC balance",
  FeeTooHigh: "Fee exceeds maximum (100 bps)",
  ZeroAddress: "Address cannot be zero",
  // V3 Pipeline
  NoStages: "Pipeline must have at least one stage",
  DeadlineInPast: "Deadline must be in the future",
  PipelineNotActive: "Pipeline is not active",
  WrongStage: "Cannot operate on this stage",
  UnsupportedCurrency: "This currency is not supported",
  NotCommerceHook: "Only the commerce hook can call this",
  NotPipelineClient: "Only the pipeline client can call this",
  OnlyOrchestrator: "Only the orchestrator can call this",
  OnlyACP: "Only the ACP contract can call this",
  JobNotRegistered: "This job is not registered in the pipeline",
  JobNotSubmitted: "Job must be in submitted status",
  HookNotWhitelisted: "Hook is not whitelisted on ACP",
  Unauthorized: "Not authorized to perform this action",
};

export function parseContractError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Check for known revert reasons
  for (const [key, label] of Object.entries(REVERT_REASONS)) {
    if (msg.includes(key)) return label;
  }

  // User rejected in wallet
  if (msg.includes("User rejected") || msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
    return "Transaction rejected by user";
  }

  // Insufficient funds for gas
  if (msg.includes("insufficient funds")) {
    return "Insufficient funds for gas";
  }

  // Generic execution reverted
  if (msg.includes("execution reverted")) {
    const match = msg.match(/reason:\s*"?([^"]+)"?/);
    if (match) return `Transaction reverted: ${match[1]}`;
    return "Transaction reverted by contract";
  }

  // Fallback: truncate long messages
  if (msg.length > 120) {
    return msg.slice(0, 120) + "...";
  }

  return msg || "Unknown error";
}
