"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { STATUS_LABELS, PIPELINE_STATUS, JOB_STATUS } from "@/lib/constants";
import type { AgreementData } from "@/lib/types";
import { Skeleton } from "@/components/Skeleton";

const PAGE_SIZE = 25;

type Props = {
  onViewAgent: (agentId: number) => void;
};

export function ActivityFeed({ onViewAgent }: Props) {
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | "acp-job" | "pipeline" | "agreement">("all");

  // Agreements
  const { data: nextAgrId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const agrCount = Number(nextAgrId ?? 0);

  const { data: agrBatch, isLoading: loadingAgr } = useReadContracts({
    contracts: Array.from({ length: agrCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_ESCROW as `0x${string}`,
      abi: ServiceEscrowABI as any,
      functionName: "getAgreement",
      args: [BigInt(i)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: agrCount > 0 },
  });

  // Pipelines
  const { data: nextPipId } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "nextPipelineId",
    chainId: arcTestnet.id,
  });

  const pipCount = Number(nextPipId ?? 0);

  const { data: pipBatch, isLoading: loadingPip } = useReadContracts({
    contracts: Array.from({ length: pipCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR as `0x${string}`,
      abi: PipelineOrchestratorABI as any,
      functionName: "pipelines",
      args: [BigInt(i)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: pipCount > 0 },
  });

  // ACP Jobs (ecosystem-wide)
  const { data: jobCounterRaw } = useReadContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AgenticCommerceABI as any,
    functionName: "jobCounter",
    chainId: arcTestnet.id,
  });

  const jobCount = Number(jobCounterRaw ?? 0);

  const { data: jobBatch, isLoading: loadingJobs } = useReadContracts({
    contracts: Array.from({ length: jobCount }, (_, i) => ({
      address: CONTRACTS.AGENTIC_COMMERCE as `0x${string}`,
      abi: AgenticCommerceABI as any,
      functionName: "getJob",
      args: [BigInt(i + 1)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: jobCount > 0 },
  });

  // Build unified activity list
  type ActivityItem = {
    type: "agreement" | "pipeline" | "acp-job";
    id: number;
    timestamp: bigint;
    data: any;
  };

  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    // Agreements
    if (agrBatch) {
      agrBatch.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const agr = r.result as unknown as AgreementData;
        list.push({ type: "agreement", id: i, timestamp: agr.deadline, data: agr });
      });
    }

    // Pipelines
    if (pipBatch) {
      pipBatch.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const arr = r.result as unknown[];
        list.push({
          type: "pipeline",
          id: i,
          timestamp: arr[8] as bigint, // createdAt
          data: {
            clientAgentId: Number(arr[0]),
            totalBudget: arr[3] as bigint,
            stageCount: Number(arr[6]),
            status: Number(arr[7]),
          },
        });
      });
    }

    // ACP Jobs
    if (jobBatch) {
      jobBatch.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const j = r.result as any;
        list.push({
          type: "acp-job",
          id: i + 1,
          timestamp: BigInt(j.expiredAt ?? j[6] ?? 0),
          data: {
            client: j.client ?? j[1] ?? "",
            provider: j.provider ?? j[2] ?? "",
            description: j.description ?? j[4] ?? "",
            budget: BigInt(j.budget ?? j[5] ?? 0),
            status: Number(j.status ?? j[7] ?? 0),
          },
        });
      });
    }

    // Sort by timestamp descending
    list.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
    return list;
  }, [agrBatch, pipBatch, jobBatch]);

  const filtered = typeFilter === "all" ? items : items.filter((i) => i.type === typeFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isLoading = loadingAgr || loadingPip || loadingJobs;

  const typeCounts = useMemo(() => {
    const counts = { "acp-job": 0, pipeline: 0, agreement: 0 };
    for (const item of items) counts[item.type]++;
    return counts;
  }, [items]);

  if (isLoading) {
    return (
      <div>
        <h2 style={{ marginBottom: "0.5rem" }}>Activity</h2>
        <Skeleton />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="empty">No protocol activity yet.</div>;
  }

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Activity</h2>
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "1rem" }}>
        {items.length} events — ACP jobs, pipelines, agreements (newest first)
      </div>

      {/* Type filter */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {(["all", "acp-job", "pipeline", "agreement"] as const).map((t) => {
          const label = t === "all" ? `All (${items.length})`
            : t === "acp-job" ? `ACP Jobs (${typeCounts["acp-job"]})`
            : t === "pipeline" ? `Pipelines (${typeCounts.pipeline})`
            : `Agreements (${typeCounts.agreement})`;
          return (
            <button
              key={t}
              className={`btn-sm ${typeFilter === t ? "" : "btn-outline"}`}
              onClick={() => { setTypeFilter(t); setPage(0); }}
              style={typeFilter === t ? { background: "var(--accent)", color: "#fff" } : {}}
            >
              {label}
            </button>
          );
        })}
      </div>

      {paged.map((item) => {
        if (item.type === "acp-job") {
          const j = item.data;
          const statusLabel = JOB_STATUS[j.status] ?? "Unknown";
          const addr = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;
          return (
            <div key={`acp-${item.id}`} className="agreement-item">
              <div className="row">
                <span className="label">ACP Job #{item.id}</span>
                <span className={`status ${statusLabel.toLowerCase() === "completed" ? "completed" : statusLabel.toLowerCase() === "open" ? "active" : "expired"}`}>
                  {statusLabel}
                </span>
              </div>
              {j.description && (
                <div className="row">
                  <span className="label">Task</span>
                  <span style={{ fontSize: "0.85rem" }}>{j.description.length > 60 ? j.description.slice(0, 57) + "..." : j.description}</span>
                </div>
              )}
              <div className="row">
                <span className="label">Budget</span>
                <span>{formatUnits(j.budget, 6)} USDC</span>
              </div>
              <div className="row">
                <span className="label">Client</span>
                <span>{addr(j.client)}</span>
              </div>
              {j.provider !== "0x0000000000000000000000000000000000000000" && (
                <div className="row">
                  <span className="label">Provider</span>
                  <span>{addr(j.provider)}</span>
                </div>
              )}
            </div>
          );
        }
        if (item.type === "pipeline") {
          const p = item.data;
          const statusLabel = PIPELINE_STATUS[p.status] ?? "Unknown";
          return (
            <div key={`pip-${item.id}`} className="agreement-item">
              <div className="row">
                <span className="label">Pipeline #{item.id}</span>
                <span className={`status ${statusLabel.toLowerCase() === "active" ? "active" : statusLabel.toLowerCase() === "completed" ? "completed" : "expired"}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="row">
                <span className="label">Budget</span>
                <span>{formatUnits(p.totalBudget, 6)} USDC</span>
              </div>
              <div className="row">
                <span className="label">Stages</span>
                <span>{p.stageCount}</span>
              </div>
              <div className="row">
                <span className="label">Client Agent</span>
                <span
                  className="agent-link"
                  onClick={() => onViewAgent(p.clientAgentId)}
                >
                  #{p.clientAgentId}
                </span>
              </div>
            </div>
          );
        }

        // Agreement
        const agr = item.data as AgreementData;
        const statusLabel = STATUS_LABELS[agr.status] ?? "unknown";
        return (
          <div key={`agr-${item.id}`} className="agreement-item">
            <div className="row">
              <span className="label">Agreement #{item.id}</span>
              <span className={`status ${statusLabel}`}>{statusLabel.toUpperCase()}</span>
            </div>
            <div className="row">
              <span className="label">Amount</span>
              <span>{formatUnits(agr.amount, 6)} USDC</span>
            </div>
            <div className="row">
              <span className="label">Provider</span>
              <span>
                <span
                  className="agent-link"
                  onClick={() => onViewAgent(Number(agr.providerAgentId))}
                >
                  Agent #{agr.providerAgentId.toString()}
                </span>
              </span>
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn-sm btn-outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Newer
          </button>
          <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: "32px" }}>
            Page {page + 1} / {totalPages}
          </span>
          <button className="btn-sm btn-outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Older
          </button>
        </div>
      )}
    </div>
  );
}
