"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { JOB_STATUS } from "@/lib/constants";
import { Skeleton } from "@/components/Skeleton";

const PAGE_SIZE = 20;

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

  // Batch-read all jobs (47 is small enough)
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
          budget: BigInt(j.budget ?? j[5]),
          expiredAt: BigInt(j.expiredAt ?? j[6]),
          status: Number(j.status ?? j[7]),
          hook: (j.hook ?? j[8]) as string,
        };
      })
      .filter((j): j is NonNullable<typeof j> => j !== null)
      .reverse(); // newest first
  }, [jobsRaw]);

  const statusCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const j of jobs) {
      counts[j.status] = (counts[j.status] || 0) + 1;
    }
    return counts;
  }, [jobs]);

  const filtered = statusFilter === "all" ? jobs : jobs.filter((j) => j.status === statusFilter);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageJobs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const addr = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;
  const isZeroAddr = (s: string) => s === "0x0000000000000000000000000000000000000000";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>ACP Jobs — Live Ecosystem</h2>
        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
          {jobCounter} jobs on Arc Testnet
        </span>
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button
          className={`btn-sm ${statusFilter === "all" ? "" : "btn-outline"}`}
          onClick={() => { setStatusFilter("all"); setPage(0); }}
          style={statusFilter === "all" ? { background: "var(--accent)", color: "#fff" } : {}}
        >
          All ({jobs.length})
        </button>
        {[3, 1, 0, 2, 4].map((s) => (
          <button
            key={s}
            className={`btn-sm ${statusFilter === s ? "" : "btn-outline"}`}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            style={statusFilter === s ? { background: "var(--accent)", color: "#fff" } : {}}
          >
            {JOB_STATUS[s]} ({statusCounts[s] || 0})
          </button>
        ))}
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && pageJobs.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-dim)" }}>No jobs found.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {pageJobs.map((j) => (
          <div key={j.id} className="card" style={{ padding: "1rem 1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: 600 }}>Job #{j.id}</span>
                  {j.budget > BigInt(0) && (
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                      {formatUnits(j.budget, 6)} USDC
                    </span>
                  )}
                </div>
                {j.description && (
                  <div style={{ fontSize: "0.85rem", marginBottom: "0.35rem", color: "var(--text)" }}>
                    {j.description.length > 120 ? j.description.slice(0, 120) + "..." : j.description}
                  </div>
                )}
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <span>Client: {addr(j.client)}</span>
                  <span>Provider: {addr(j.provider)}</span>
                  {!isZeroAddr(j.evaluator) && j.evaluator.toLowerCase() !== j.client.toLowerCase() && (
                    <span>Evaluator: {addr(j.evaluator)}</span>
                  )}
                  {!isZeroAddr(j.hook) && <span>Hook: {addr(j.hook)}</span>}
                </div>
              </div>
              <span
                className={`status ${
                  j.status === 3 ? "completed" : j.status === 4 ? "expired" : "active"
                }`}
              >
                {JOB_STATUS[j.status] ?? "Unknown"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn-sm btn-outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: "32px" }}>
            {page + 1} / {totalPages}
          </span>
          <button className="btn-sm btn-outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
