"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { JOB_STATUS } from "@/lib/constants";
import { Skeleton } from "@/components/Skeleton";
import { motion } from "framer-motion";
import { Briefcase, CircleDollarSign, PackageSearch } from "lucide-react";

const PAGE_SIZE = 20;

function jobPillClass(status: number) {
  if (status === 3) return "pill-green"; // Completed
  if (status === 4) return "pill-red";   // Rejected
  if (status === 1) return "pill-blue";  // Funded
  if (status === 2) return "pill-yellow"; // Submitted
  return "pill-gray"; // Open
}

export function AcpJobsExplorer({ onViewAgent }: { onViewAgent: (agentId: number) => void }) {
  const [statusFilter, setStatusFilter] = useState<number | "all">("all");
  const [page, setPage] = useState(0);

  const { data: jobCounterRaw } = useReadContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AgenticCommerceABI as any,
    functionName: "jobCounter",
    chainId: arcTestnet.id,
  });

  const jobCounter = Number(jobCounterRaw ?? 0);

  const { data: jobsRaw, isLoading } = useReadContracts({
    contracts: Array.from({ length: jobCounter }, (_, i) => ({
      address: CONTRACTS.AGENTIC_COMMERCE as `0x${string}`,
      abi: AgenticCommerceABI as any,
      functionName: "getJob",
      args: [BigInt(i + 1)],
    })),
    query: { enabled: jobCounter > 0 },
  });

  const jobs = useMemo(() => {
    if (!jobsRaw) return [];
    return jobsRaw
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const j = r.result as any;
        return {
          id: i + 1,
          client: (j.client ?? j[1]) as string,
          provider: (j.provider ?? j[2]) as string,
          evaluator: (j.evaluator ?? j[3]) as string,
          description: (j.description ?? j[4]) as string,
          budget: BigInt(j.budget ?? j[5] ?? 0),
          expiredAt: BigInt(j.expiredAt ?? j[6] ?? 0),
          status: Number(j.status ?? j[7]),
          hook: (j.hook ?? j[8]) as string,
        };
      })
      .filter((j): j is NonNullable<typeof j> => j !== null)
      .reverse();
  }, [jobsRaw]);

  const statusCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const j of jobs) counts[j.status] = (counts[j.status] || 0) + 1;
    return counts;
  }, [jobs]);

  const filtered = statusFilter === "all" ? jobs : jobs.filter((j) => j.status === statusFilter);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageJobs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const addr = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;
  const isZeroAddr = (s: string) => s === "0x0000000000000000000000000000000000000000";

  return (
    <div>
      <div className="section-header">
        <h2>ACP Jobs Explorer</h2>
        <p className="section-subtitle">{jobCounter} jobs on Arc Testnet -- live ecosystem view</p>
      </div>

      {/* Status filter */}
      <div className="quick-filters" style={{ marginBottom: "1.25rem" }}>
        <button
          className={`quick-filter ${statusFilter === "all" ? "active" : ""}`}
          onClick={() => { setStatusFilter("all"); setPage(0); }}
        >
          All ({jobs.length})
        </button>
        {[3, 1, 0, 2, 4].map((s) => (
          <button
            key={s}
            className={`quick-filter ${statusFilter === s ? "active" : ""}`}
            onClick={() => { setStatusFilter(s); setPage(0); }}
          >
            {JOB_STATUS[s]} ({statusCounts[s] || 0})
          </button>
        ))}
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && pageJobs.length === 0 && (
        <div className="empty-state">
          <PackageSearch size={40} className="empty-icon" />
          <p>No jobs found</p>
          <p className="secondary">Try a different filter or check back later</p>
        </div>
      )}

      <div className="job-grid">
        {pageJobs.map((j, idx) => (
          <motion.div
            key={j.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: idx * 0.02 }}
            className="glass-card"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Briefcase size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Job #{j.id}</span>
              </div>
              <span className={`pill ${jobPillClass(j.status)}`}>
                {JOB_STATUS[j.status] ?? "Unknown"}
              </span>
            </div>

            {j.description && (
              <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.4 }}>
                {j.description.length > 100 ? j.description.slice(0, 100) + "..." : j.description}
              </div>
            )}

            {j.budget > BigInt(0) && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <CircleDollarSign size={14} style={{ color: "var(--green)" }} />
                <span style={{ fontWeight: 600, color: "var(--green)", fontSize: "0.85rem" }}>
                  {formatUnits(j.budget, 6)} USDC
                </span>
              </div>
            )}

            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "auto", paddingTop: "0.35rem", borderTop: "1px solid var(--border)" }}>
              <span>Client: {addr(j.client)}</span>
              <span>Provider: {addr(j.provider)}</span>
              {!isZeroAddr(j.evaluator) && j.evaluator.toLowerCase() !== j.client.toLowerCase() && (
                <span>Evaluator: {addr(j.evaluator)}</span>
              )}
              {!isZeroAddr(j.hook) && <span>Hook: {addr(j.hook)}</span>}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span className="page-info">{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
