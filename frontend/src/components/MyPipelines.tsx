"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import { PipelineTracker } from "./PipelineTracker";
import { Skeleton } from "./Skeleton";

const PIPELINE_STATUS = ["Active", "Completed", "Halted", "Cancelled"];
const STATUS_BADGE_STYLES: Record<string, React.CSSProperties> = {
  Active: { background: "var(--green)", color: "#fff" },
  Completed: { background: "var(--green)", color: "#fff", opacity: 0.7 },
  Halted: { background: "var(--red)", color: "#fff" },
  Cancelled: { background: "var(--text-dim)", color: "#fff" },
};

export function MyPipelines() {
  const { address } = useAccount();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch pipeline IDs for connected wallet
  const { data: pipelineIds, isLoading } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "getClientPipelines",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.PIPELINE_ORCHESTRATOR },
  });

  const ids = ((pipelineIds as bigint[]) ?? []).map(Number).sort((a, b) => b - a);

  // Batch fetch pipeline data for all IDs
  const { data: batchPipelines } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR,
      abi: PipelineOrchestratorABI as any,
      functionName: "pipelines",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: ids.length > 0 },
  });

  if (!address) {
    return <div className="empty">Connect wallet to view your pipelines.</div>;
  }

  if (!CONTRACTS.PIPELINE_ORCHESTRATOR) {
    return <div className="empty">Pipeline Orchestrator address not configured.</div>;
  }

  if (isLoading) {
    return <Skeleton lines={4} />;
  }

  if (ids.length === 0) {
    return <div className="empty">No pipelines found. Create one to get started.</div>;
  }

  return (
    <div>
      {ids.map((id, idx) => {
        const result = batchPipelines?.[idx];
        const raw = result && result.status === "success" ? (result.result as unknown[]) : undefined;

        const status = raw ? Number(raw[7]) : -1;
        const statusLabel = PIPELINE_STATUS[status] ?? "Loading";
        const totalBudget = raw ? (raw[3] as bigint) : BigInt(0);
        const stageCount = raw ? Number(raw[6]) : 0;
        const createdAt = raw ? Number(raw[8]) : 0;
        const isExpanded = expandedId === id;

        return (
          <div key={id} className="card" style={{ marginBottom: "0.75rem" }}>
            <div
              style={{ cursor: "pointer" }}
              onClick={() => setExpandedId(isExpanded ? null : id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>Pipeline #{id}</strong>
                  <span style={{ marginLeft: "0.75rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    {stageCount} stage{stageCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      ...(STATUS_BADGE_STYLES[statusLabel] ?? {}),
                    }}
                  >
                    {statusLabel}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                    {isExpanded ? "collapse" : "expand"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
                <span>Budget: {raw ? formatUnits(totalBudget, 6) : "--"}</span>
                <span>
                  Created: {createdAt > 0 ? new Date(createdAt * 1000).toLocaleDateString() : "--"}
                </span>
              </div>
            </div>

            {isExpanded && <PipelineTracker pipelineId={id} />}
          </div>
        );
      })}
    </div>
  );
}
