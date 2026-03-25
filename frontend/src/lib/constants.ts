import { keccak256, toHex } from "viem";

export const CAPABILITY_NAMES: [string, string][] = [
  ["smart_contract_audit", "Smart Contract Audit"],
  ["data_analysis", "Data Analysis"],
  ["code_review", "Code Review"],
  ["price_monitoring", "Price Monitoring"],
];

export const KNOWN_CAPABILITIES = Object.fromEntries(
  CAPABILITY_NAMES.map(([raw, display]) => [keccak256(toHex(raw)), display])
);

export function capabilityName(hash: string): string {
  return KNOWN_CAPABILITIES[hash.toLowerCase()] ?? `${hash.slice(0, 10)}...`;
}

export const STATUS_LABELS = ["active", "completed", "disputed", "expired", "resolved"];
