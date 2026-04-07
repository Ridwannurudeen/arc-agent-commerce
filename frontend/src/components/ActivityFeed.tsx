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
import { motion } from "framer-motion";
import { Activity, Briefcase, Layers, FileText, CircleDollarSign, PackageSearch } from "lucide-react";

const PAGE_SIZE = 25;

type Props = {
  onViewAgent: (agentId: number) => void;
};

function eventDotColor(type: string, status: string): string {
  if (type === "acp-job") {
    if (status === "Completed") return "green";
    if (status === "Rejected" || status === "Cancelled") return "red";
    return "blue";
  }
  if (type === "pipeline") {
    if (status === "Completed") return "green";
    if (status === "Cancelled" || status === "Halted") return "red";
    return "blue";
  }
  // agreement
  if (status === "completed") return "green";
  if (status === "expired" || status === "disputed") return "red";
  return "yellow";
}

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

  // ACP Jobs
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

  type ActivityItem = {
    type: "agreement" | "pipeline" | "acp-job";
    id: number;
    timestamp: bigint;
    data: any;
  };

  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    if (agrBatch) {
      agrBatch.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const agr = r.result as unknown as AgreementData;
        list.push({ type: "agreement", id: i, timestamp: agr.deadline, data: agr });
      });
    }

    if (pipBatch) {
      pipBatch.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const arr = r.result as unknown[];
        list.push({
          type: "pipeline", id: i, timestamp: (arr[8] as bigint) ?? BigInt(0),
          data: { clientAgentId: Number(arr[0] ?? 0), totalBudget: (arr[3] as bigint) ?? BigInt(0), stageCount: Number(arr[6] ?? 0), status: Number(arr[7] ?? 0) },
        });
      });
    }

    if (jobBatch) {
      jobBatch.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const j = r.result as any;
        list.push({
          type: "acp-job", id: i + 1, timestamp: BigInt(j.expiredAt ?? j[6] ?? 0),
          data: {
            client: j.client ?? j[1] ?? "", provider: j.provider ?? j[2] ?? "",
            description: j.description ?? j[4] ?? "", budget: BigInt(j.budget ?? j[5] ?? 0),
            status: Number(j.status ?? j[7] ?? 0),
          },
        });
      });
    }

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
        <div className="section-header">
          <h2>Activity Feed</h2>
          <p className="section-subtitle">Loading protocol events...</p>
        </div>
        <Skeleton />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <div className="section-header">
          <h2>Activity Feed</h2>
        </div>
        <div className="empty-state">
          <Activity size={40} className="empty-icon" />
          <p>No protocol activity yet</p>
          <p className="secondary">Events will appear here as ACP jobs, pipelines, and agreements are created</p>
        </div>
      </div>
    );
  }

  const filterButtons: { key: typeof typeFilter; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "all", label: "All", icon: <Activity size={13} />, count: items.length },
    { key: "acp-job", label: "ACP Jobs", icon: <Briefcase size={13} />, count: typeCounts["acp-job"] },
    { key: "pipeline", label: "Pipelines", icon: <Layers size={13} />, count: typeCounts.pipeline },
    { key: "agreement", label: "Agreements", icon: <FileText size={13} />, count: typeCounts.agreement },
  ];

  return (
    <div>
      <div className="section-header">
        <h2>Activity Feed</h2>
        <p className="section-subtitle">{items.length} events across ACP jobs, pipelines, and agreements</p>
      </div>

      {/* Type filter */}
      <div className="quick-filters" style={{ marginBottom: "1.25rem" }}>
        {filterButtons.map((f) => (
          <button
            key={f.key}
            className={`quick-filter ${typeFilter === f.key ? "active" : ""}`}
            onClick={() => { setTypeFilter(f.key); setPage(0); }}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            {f.icon} {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="timeline">
        {paged.map((item, idx) => {
          if (item.type === "acp-job") {
            const j = item.data;
            const statusLabel = JOB_STATUS[j.status] ?? "Unknown";
            const addr = (s: string) => { const v = s || ""; return `${v.slice(0, 6)}...${v.slice(-4)}`; };
            return (
              <motion.div
                key={`acp-${item.id}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.02 }}
                className="timeline-item"
              >
                <div className={`timeline-dot ${eventDotColor("acp-job", statusLabel)}`} />
                <div className="glass-card" style={{ padding: "0.85rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Briefcase size={14} style={{ color: "var(--accent)" }} />
                      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>ACP Job #{item.id}</span>
                    </div>
                    <span className={`pill ${statusLabel === "Completed" ? "pill-green" : statusLabel === "Open" ? "pill-blue" : "pill-gray"}`}>
                      {statusLabel}
                    </span>
                  </div>
                  {j.description && (
                    <div style={{ fontSize: "0.82rem", marginBottom: "0.25rem", color: "var(--text)" }}>
                      {j.description.length > 60 ? j.description.slice(0, 57) + "..." : j.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <CircleDollarSign size={12} /> {formatUnits(j.budget, 6)} USDC
                    </span>
                    <span>Client: {addr(j.client)}</span>
                    {j.provider !== "0x0000000000000000000000000000000000000000" && (
                      <span>Provider: {addr(j.provider)}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          }

          if (item.type === "pipeline") {
            const p = item.data;
            const statusLabel = PIPELINE_STATUS[p.status] ?? "Unknown";
            return (
              <motion.div
                key={`pip-${item.id}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: idx * 0.02 }}
                className="timeline-item"
              >
                <div className={`timeline-dot ${eventDotColor("pipeline", statusLabel)}`} />
                <div className="glass-card" style={{ padding: "0.85rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Layers size={14} style={{ color: "var(--cyan, #06b6d4)" }} />
                      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Pipeline #{item.id}</span>
                    </div>
                    <span className={`pill ${statusLabel === "Active" ? "pill-blue" : statusLabel === "Completed" ? "pill-green" : "pill-gray"}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <CircleDollarSign size={12} /> {formatUnits(p.totalBudget, 6)} USDC
                    </span>
                    <span>{p.stageCount} stages</span>
                    <span
                      className="agent-link"
                      onClick={() => onViewAgent(p.clientAgentId)}
                      style={{ cursor: "pointer" }}
                    >
                      Client Agent #{p.clientAgentId}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          }

          // Agreement
          const agr = item.data as AgreementData;
          const statusLabel = (STATUS_LABELS[agr.status] ?? "unknown") as string;
          return (
            <motion.div
              key={`agr-${item.id}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.02 }}
              className="timeline-item"
            >
              <div className={`timeline-dot ${eventDotColor("agreement", statusLabel)}`} />
              <div className="glass-card" style={{ padding: "0.85rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FileText size={14} style={{ color: "var(--yellow)" }} />
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Agreement #{item.id}</span>
                  </div>
                  <span className={`pill ${statusLabel === "completed" ? "pill-green" : statusLabel === "active" ? "pill-blue" : "pill-yellow"}`}>
                    {statusLabel.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <CircleDollarSign size={12} /> {formatUnits(agr.amount ?? BigInt(0), 6)} USDC
                  </span>
                  <span
                    className="agent-link"
                    onClick={() => onViewAgent(Number(agr.providerAgentId ?? 0))}
                    style={{ cursor: "pointer" }}
                  >
                    Provider Agent #{(agr.providerAgentId ?? 0).toString()}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
          <span className="page-info">Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      )}
    </div>
  );
}
