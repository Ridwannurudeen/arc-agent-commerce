import { keccak256, toHex } from "viem";

export const CAPABILITY_NAMES: [string, string][] = [
  ["smart_contract_audit", "Smart Contract Audit"],
  ["code_review", "Code Review"],
  ["deployment", "Deployment"],
  ["monitoring", "Monitoring"],
  ["data_analysis", "Data Analysis"],
  ["price_monitoring", "Price Monitoring"],
  ["security_audit", "Security Audit"],
  ["testing", "Testing"],
];

export const KNOWN_CAPABILITIES = Object.fromEntries(
  CAPABILITY_NAMES.map(([raw, display]) => [keccak256(toHex(raw)), display])
);

export function capabilityName(hash: string): string {
  return KNOWN_CAPABILITIES[hash.toLowerCase()] ?? `${hash.slice(0, 10)}...`;
}

export const STATUS_LABELS = ["active", "completed", "disputed", "expired", "resolved"];
export const PIPELINE_STATUS = ["Active", "Completed", "Halted", "Cancelled"];
export const STAGE_STATUS = ["Pending", "Active", "Completed", "Failed"];
export const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];
