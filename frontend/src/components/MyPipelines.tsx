"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import { PipelineTracker } from "./PipelineTracker";
import { Skeleton } from "./Skeleton";
import { motion } from "framer-motion";
import { Layers, ChevronDown, ChevronUp, Calendar, Wallet, PackageSearch } from "lucide-react";

const PIPELINE_STATUS = ["Active", "Completed", "Halted", "Cancelled"];

function statusPillClass(s: string) {
  if (s === "Active") return "pill-blue";
  if (s === "Completed") return "pill-green";
  if (s === "Halted") return "pill-red";
  return "pill-gray";
}

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
    return (
      <div className="empty-state">
        <Wallet size={40} className="empty-icon" />
        <p>Connect wallet to view your pipelines.</p>
      </div>
    );
  }

  if (!CONTRACTS.PIPELINE_ORCHESTRATOR) {
    return (
      <div className="empty-state">
        <Layers size={40} className="empty-icon" />
        <p>Pipeline Orchestrator address not configured.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <div className="section-header">
          <h2>My Pipelines</h2>
        </div>
        <Skeleton lines={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2>My Pipelines</h2>
        <p className="section-subtitle">{ids.length} pipeline{ids.length !== 1 ? "s" : ""} found</p>
      </div>

      {ids.length === 0 ? (
        <div className="empty-state">
          <PackageSearch size={40} className="empty-icon" />
          <p>No pipelines found</p>
          <p className="secondary">Create one in the Pipeline Builder to get started</p>
        </div>
      ) : (
        ids.map((id, idx) => {
          const result = batchPipelines?.[idx];
          const raw = result && result.status === "success" ? (result.result as unknown[]) : undefined;

          const status = raw ? Number(raw[7] ?? 0) : -1;
          const statusLabel = PIPELINE_STATUS[status] ?? "Loading";
          const totalBudget = raw ? ((raw[3] as bigint) ?? BigInt(0)) : BigInt(0);
          const totalSpent = raw ? ((raw[4] as bigint) ?? BigInt(0)) : BigInt(0);
          const stageCount = raw ? Number(raw[6] ?? 0) : 0;
          const currentStage = raw ? Number(raw[5] ?? 0) : 0;
          const createdAt = raw ? Number(raw[8] ?? 0) : 0;
          const isExpanded = expandedId === id;

          const completedStages = status === 1 ? stageCount : Math.min(currentStage, stageCount);
          const progressPct = stageCount > 0 ? (completedStages / stageCount) * 100 : 0;

          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.03 }}
              className="glass-card"
              style={{ marginBottom: "0.75rem", cursor: "pointer" }}
              onClick={() => setExpandedId(isExpanded ? null : id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.35rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Pipeline #{id}</span>
                    <span className={`pill ${statusPillClass(statusLabel)}`}>{statusLabel}</span>
                  </div>
                  <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.8rem", color: "var(--text-dim)", flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Layers size={13} /> {stageCount} stage{stageCount !== 1 ? "s" : ""}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <Calendar size={13} /> {createdAt > 0 ? new Date(createdAt * 1000).toLocaleDateString() : "--"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span className="price-pill">{raw ? formatUnits(totalBudget, 6) : "--"} USDC</span>
                  {isExpanded ? <ChevronUp size={16} style={{ color: "var(--text-dim)" }} /> : <ChevronDown size={16} style={{ color: "var(--text-dim)" }} />}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                  <span>{completedStages}/{stageCount} stages complete</span>
                  <span>{raw ? formatUnits(totalSpent, 6) : "0"} / {raw ? formatUnits(totalBudget, 6) : "0"} USDC spent</span>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill ${status === 1 ? "green" : ""}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {isExpanded && (
                <div onClick={(e) => e.stopPropagation()}>
                  <PipelineTracker pipelineId={id} />
                </div>
              )}
            </motion.div>
          );
        })
      )}
    </div>
  );
}
