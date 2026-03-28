"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import { STATUS_LABELS } from "@/lib/constants";
import type { AgreementData } from "@/lib/types";

type Props = {
  onViewAgent: (agentId: number) => void;
};

function ActivityFeedItem({
  agreementId,
  data: prefetchedData,
  onViewAgent,
}: {
  agreementId: number;
  data?: AgreementData;
  onViewAgent: (agentId: number) => void;
}) {
  const { data: fetchedData } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
    chainId: arcTestnet.id,
    query: { enabled: !prefetchedData },
  });

  const agr = (prefetchedData || fetchedData) as unknown as AgreementData;
  if (!agr) return null;
  const statusLabel = STATUS_LABELS[agr.status] ?? "unknown";

  return (
    <div className="agreement-item">
      <div className="row">
        <span className="label">Agreement #{agreementId}</span>
        <span className={`status ${statusLabel}`}>{statusLabel.toUpperCase()}</span>
      </div>
      <div className="row">
        <span className="label">Amount</span>
        <span>{formatUnits(agr.amount, 6)} USDC</span>
      </div>
      <div className="row">
        <span className="label">Client</span>
        <span>
          <span className="addr">
            {agr.client.slice(0, 6)}...{agr.client.slice(-4)}
          </span>{" "}
          (
          <span
            className="agent-link"
            onClick={() => onViewAgent(Number(agr.clientAgentId))}
          >
            Agent #{agr.clientAgentId.toString()}
          </span>
          )
        </span>
      </div>
      <div className="row">
        <span className="label">Provider</span>
        <span>
          <span className="addr">
            {agr.provider.slice(0, 6)}...{agr.provider.slice(-4)}
          </span>{" "}
          (
          <span
            className="agent-link"
            onClick={() => onViewAgent(Number(agr.providerAgentId))}
          >
            Agent #{agr.providerAgentId.toString()}
          </span>
          )
        </span>
      </div>
    </div>
  );
}

export function ActivityFeed({ onViewAgent }: Props) {
  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const count = Number(nextId ?? 0);
  const ids = count > 0 ? Array.from({ length: count }, (_, i) => count - 1 - i) : [];

  const { data: batchAgreements } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.SERVICE_ESCROW,
      abi: ServiceEscrowABI as any,
      functionName: "getAgreement",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: ids.length > 0 },
  });

  if (count === 0) {
    return <div className="empty">No protocol activity yet.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "1rem" }}>
        All protocol agreements (newest first)
      </div>
      {ids.map((id, idx) => {
        const result = batchAgreements?.[idx];
        const agrData = result && result.status === "success"
          ? (result.result as unknown as AgreementData)
          : undefined;
        return (
          <ActivityFeedItem
            key={id}
            agreementId={id}
            data={agrData}
            onViewAgent={onViewAgent}
          />
        );
      })}
    </div>
  );
}
