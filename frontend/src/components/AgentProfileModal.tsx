"use client";

import { useMemo, useEffect } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { capabilityName, STAGE_STATUS, JOB_STATUS } from "@/lib/constants";
import type { ServiceData } from "@/lib/types";
import { motion } from "framer-motion";
import { X, User, ShoppingBag, Star, Briefcase, ExternalLink, CircleDollarSign, CheckCircle2, XCircle } from "lucide-react";

type Props = {
  agentId: number;
  onClose: () => void;
  onHire: (agentId: number, provider: string, capability: string, price: bigint) => void;
};

function agentColor(id: number): string {
  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
  return colors[id % colors.length];
}

function AgentServices({ agentId, onHire }: { agentId: number; onHire: Props["onHire"] }) {
  const { data: serviceIds } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getServicesByAgent",
    args: [BigInt(agentId)],
    chainId: arcTestnet.id,
  });

  const ids = (serviceIds as bigint[]) ?? [];

  if (ids.length === 0) {
    return (
      <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.5rem 0" }}>
        No services listed.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {ids.map((sid) => (
        <AgentServiceRow key={sid.toString()} serviceId={Number(sid)} agentId={agentId} onHire={onHire} />
      ))}
    </div>
  );
}

function AgentServiceRow({ serviceId, agentId, onHire }: { serviceId: number; agentId: number; onHire: Props["onHire"] }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as unknown as ServiceData;

  return (
    <div className="glass-card" style={{ padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.15rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{capabilityName(svc.capabilityHash)}</span>
          {!svc.active && <span className="pill pill-red">Inactive</span>}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Service #{serviceId}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <span className="price-pill">{formatUnits(svc.pricePerTask, 6)} USDC</span>
        {svc.active && (
          <button
            className="btn-hire"
            onClick={() => onHire(agentId, svc.provider, svc.capabilityHash, svc.pricePerTask)}
          >
            Hire
          </button>
        )}
      </div>
    </div>
  );
}

function AgentReputation({ agentId, ownerAddr }: { agentId: number; ownerAddr: string | undefined }) {
  const { data: nextPipelineId } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "nextPipelineId",
    chainId: arcTestnet.id,
  });

  const pipelineCount = Number(nextPipelineId ?? 0);

  const { data: stagesRaw } = useReadContracts({
    contracts: Array.from({ length: pipelineCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR as `0x${string}`,
      abi: PipelineOrchestratorABI as any,
      functionName: "getStages",
      args: [BigInt(i)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: pipelineCount > 0 },
  });

  const { data: jobCounterRaw } = useReadContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AgenticCommerceABI as any,
    functionName: "jobCounter",
    chainId: arcTestnet.id,
  });

  const jobCounter = Number(jobCounterRaw ?? 0);

  const { data: jobsRaw } = useReadContracts({
    contracts: Array.from({ length: jobCounter }, (_, i) => ({
      address: CONTRACTS.AGENTIC_COMMERCE as `0x${string}`,
      abi: AgenticCommerceABI as any,
      functionName: "getJob",
      args: [BigInt(i + 1)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: jobCounter > 0 && !!ownerAddr },
  });

  const stats = useMemo(() => {
    let pipelineCompleted = 0;
    let pipelineFailed = 0;
    let pipelineTotal = 0;
    let acpCompleted = 0;
    let acpRejected = 0;
    let acpTotal = 0;

    if (stagesRaw) {
      for (const r of stagesRaw) {
        if (r.status !== "success" || !r.result) continue;
        const stages = r.result as any[];
        for (const s of stages) {
          const provAgentId = Number(s.providerAgentId ?? s[0]);
          if (provAgentId !== agentId) continue;
          pipelineTotal++;
          if (Number(s.status ?? s[5]) === 2) pipelineCompleted++;
          if (Number(s.status ?? s[5]) === 3) pipelineFailed++;
        }
      }
    }

    if (jobsRaw && ownerAddr) {
      const ownerLower = ownerAddr.toLowerCase();
      for (const r of jobsRaw) {
        if (r.status !== "success" || !r.result) continue;
        const j = r.result as any;
        const provider = (j.provider ?? j[2] ?? "").toLowerCase();
        if (provider !== ownerLower) continue;
        acpTotal++;
        const status = Number(j.status ?? j[7] ?? 0);
        if (status === 3) acpCompleted++;
        if (status === 4) acpRejected++;
      }
    }

    const completed = pipelineCompleted + acpCompleted;
    const failed = pipelineFailed + acpRejected;
    const total = pipelineTotal + acpTotal;
    const score = completed * 100 - failed * 50;
    return { completed, failed, total, score, pipelineTotal, acpTotal };
  }, [stagesRaw, jobsRaw, agentId, ownerAddr]);

  if (stats.total === 0) {
    return <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.5rem 0" }}>No on-chain history yet.</div>;
  }

  return (
    <div>
      {/* Stats grid */}
      <div className="profile-stats">
        <div className="profile-stat-card">
          <div className="stat-value" style={{ color: stats.score >= 0 ? "var(--green)" : "var(--red)" }}>
            {stats.score >= 0 ? "+" : ""}{stats.score}
          </div>
          <div className="stat-label">Score</div>
        </div>
        <div className="profile-stat-card">
          <div className="stat-value" style={{ color: "var(--green)" }}>{stats.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="profile-stat-card">
          <div className="stat-value" style={{ color: "var(--red)" }}>{stats.failed}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="profile-stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      {(stats.pipelineTotal > 0 || stats.acpTotal > 0) && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
          {stats.pipelineTotal > 0 && <span>{stats.pipelineTotal} pipeline stages</span>}
          {stats.pipelineTotal > 0 && stats.acpTotal > 0 && <span> + </span>}
          {stats.acpTotal > 0 && <span>{stats.acpTotal} ACP jobs</span>}
        </div>
      )}
    </div>
  );
}

function AgentAcpHistory({ ownerAddr }: { ownerAddr: string }) {
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
      chainId: arcTestnet.id,
    })),
    query: { enabled: jobCounter > 0 },
  });

  const jobs = useMemo(() => {
    if (!jobsRaw) return [];
    const ownerLower = ownerAddr.toLowerCase();
    return jobsRaw
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const j = r.result as any;
        const client = (j.client ?? j[1] ?? "").toLowerCase();
        const provider = (j.provider ?? j[2] ?? "").toLowerCase();
        if (client !== ownerLower && provider !== ownerLower) return null;
        return {
          id: i + 1,
          role: client === ownerLower ? "Client" : "Provider",
          description: j.description ?? j[4] ?? "",
          budget: BigInt(j.budget ?? j[5] ?? 0),
          status: Number(j.status ?? j[7] ?? 0),
        };
      })
      .filter((j): j is NonNullable<typeof j> => j !== null)
      .reverse();
  }, [jobsRaw, ownerAddr]);

  if (isLoading) return <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Loading...</div>;

  if (jobs.length === 0) {
    return <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.5rem 0" }}>No ACP jobs found for this owner.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {jobs.map((j) => (
        <div
          key={j.id}
          className="glass-card"
          style={{ padding: "0.65rem 0.85rem" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Job #{j.id}</span>
            <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span className={`pill ${j.status === 3 ? "pill-green" : j.status === 4 ? "pill-red" : j.status === 1 ? "pill-blue" : "pill-gray"}`}>
                {JOB_STATUS[j.status] ?? "Unknown"}
              </span>
              <span className="pill pill-purple" style={{ fontSize: "0.68rem" }}>{j.role}</span>
            </span>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.78rem", marginBottom: "0.15rem" }}>
            {(j.description || "No description").length > 40 ? (j.description || "No description").slice(0, 40) + "..." : (j.description || "No description")}
          </div>
          <div style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <CircleDollarSign size={12} style={{ color: "var(--green)" }} />
            <span>{formatUnits(j.budget, 6)} USDC</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentProfileModal({ agentId, onClose, onHire }: Props) {
  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const { data: ownerAddr } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "ownerOf",
    args: [BigInt(agentId)],
    chainId: arcTestnet.id,
  });

  const { data: tokenURI } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "tokenURI",
    args: [BigInt(agentId)],
    chainId: arcTestnet.id,
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="modal-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        {/* Header with avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <div
            className="agent-avatar"
            style={{
              background: agentColor(agentId),
              width: 56, height: 56, minWidth: 56,
              fontSize: "1rem", fontWeight: 700,
            }}
          >
            A{agentId}
          </div>
          <div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "0.15rem" }}>
              Agent #{agentId}
            </h2>
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
              {(ownerAddr as string) ?? "Loading..."}
            </div>
          </div>
        </div>

        {/* Identity Section */}
        <div className="glass-card" style={{ padding: "0.85rem 1rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.65rem" }}>
            <User size={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Identity</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-dim)" }}>Owner</span>
            <span style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{(ownerAddr as string) ?? "..."}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-dim)" }}>Metadata</span>
            <span style={{ wordBreak: "break-all", fontSize: "0.8rem", maxWidth: "60%", textAlign: "right" }}>
              {(tokenURI as string) ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--accent)" }}>
                  <ExternalLink size={12} />
                  {(tokenURI as string).length > 35 ? (tokenURI as string).slice(0, 35) + "..." : (tokenURI as string)}
                </span>
              ) : "None"}
            </span>
          </div>
        </div>

        {/* Services */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.65rem" }}>
            <ShoppingBag size={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Services</span>
          </div>
          <AgentServices agentId={agentId} onHire={onHire} />
        </div>

        {/* Reputation */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.65rem" }}>
            <Star size={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Reputation</span>
          </div>
          <AgentReputation agentId={agentId} ownerAddr={ownerAddr as string | undefined} />
        </div>

        {/* ACP Job History */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.65rem" }}>
            <Briefcase size={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>ACP Job History</span>
          </div>
          {ownerAddr ? (
            <AgentAcpHistory ownerAddr={ownerAddr as string} />
          ) : (
            <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Loading owner...</div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
