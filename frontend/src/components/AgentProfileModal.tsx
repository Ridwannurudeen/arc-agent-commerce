"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { capabilityName, STAGE_STATUS, JOB_STATUS } from "@/lib/constants";
import type { ServiceData } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, ShoppingBag, Star, Briefcase, ExternalLink, CircleDollarSign,
  CheckCircle2, XCircle, Copy, Check, Clock, TrendingUp, Zap, Globe,
  Code2, Link2, Shield, Activity, ChevronDown, ChevronUp,
} from "lucide-react";

type Props = {
  agentId: number;
  onClose: () => void;
  onHire: (agentId: number, provider: string, capability: string, price: bigint) => void;
};

/* ─── Deterministic avatar color ─── */
function agentColor(id: number): string {
  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
  return colors[id % colors.length];
}

function agentGradient(id: number): string {
  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
  const c1 = colors[id % colors.length];
  const c2 = colors[(id + 2) % colors.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

/* ─── Copy-to-clipboard hook ─── */
function useCopyClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    });
  }, [timeout]);
  return { copied, copy };
}

/* ─── Address formatter ─── */
function truncAddr(s: string): string {
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

/* ─── Section wrapper ─── */
function PassportSection({
  icon, title, children, defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="passport-section">
      <button className="passport-section-header" onClick={() => setOpen(!open)}>
        <div className="passport-section-title">
          {icon}
          <span>{title}</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="passport-section-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Services Section
   ══════════════════════════════════════════════════════════ */
function PassportServices({ agentId, onHire }: { agentId: number; onHire: Props["onHire"] }) {
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
      <div className="passport-empty">No services listed yet.</div>
    );
  }

  return (
    <div className="passport-services-grid">
      {ids.map((sid) => (
        <PassportServiceCard key={sid.toString()} serviceId={Number(sid)} agentId={agentId} onHire={onHire} />
      ))}
    </div>
  );
}

function PassportServiceCard({ serviceId, agentId, onHire }: { serviceId: number; agentId: number; onHire: Props["onHire"] }) {
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
    <div className="passport-service-card glass-card">
      <div className="passport-service-top">
        <div>
          <div className="passport-service-name">{capabilityName(svc.capabilityHash)}</div>
          <div className="passport-service-id">Service #{serviceId}</div>
        </div>
        <span className={`pill ${svc.active ? "pill-green" : "pill-red"}`}>
          {svc.active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="passport-service-bottom">
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

/* ══════════════════════════════════════════════════════════
   Stats Dashboard — fetches jobs + pipelines, computes stats
   ══════════════════════════════════════════════════════════ */
type AgentStats = {
  completed: number;
  rejected: number;
  total: number;
  score: number;
  totalEarned: bigint;
  onTimeRate: number;
  pipelineTotal: number;
  acpTotal: number;
  capabilities: Set<string>;
  jobs: JobEntry[];
};

type JobEntry = {
  id: number;
  role: "Client" | "Provider";
  description: string;
  budget: bigint;
  status: number;
  counterparty: string;
};

function useAgentStats(agentId: number, ownerAddr: string | undefined): AgentStats & { loading: boolean } {
  // Pipeline stages
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

  // ACP jobs
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
    query: { enabled: jobCounter > 0 && !!ownerAddr },
  });

  // Service capabilities
  const { data: serviceIds } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getServicesByAgent",
    args: [BigInt(agentId)],
    chainId: arcTestnet.id,
  });
  const svcIds = (serviceIds as bigint[]) ?? [];

  const { data: servicesRaw } = useReadContracts({
    contracts: svcIds.map((sid) => ({
      address: CONTRACTS.SERVICE_MARKET as `0x${string}`,
      abi: ServiceMarketABI as any,
      functionName: "getService",
      args: [sid],
      chainId: arcTestnet.id,
    })),
    query: { enabled: svcIds.length > 0 },
  });

  return useMemo(() => {
    let pipelineCompleted = 0;
    let pipelineFailed = 0;
    let pipelineTotal = 0;
    let acpCompleted = 0;
    let acpRejected = 0;
    let acpTotal = 0;
    let totalEarned = BigInt(0);
    const jobs: JobEntry[] = [];
    const capabilities = new Set<string>();

    // Pipeline stages
    if (stagesRaw) {
      for (const r of stagesRaw) {
        if (r.status !== "success" || !r.result) continue;
        const stages = r.result as any[];
        for (const s of stages) {
          const provAgentId = Number(s.providerAgentId ?? s[0]);
          if (provAgentId !== agentId) continue;
          pipelineTotal++;
          const st = Number(s.status ?? s[5]);
          if (st === 2) pipelineCompleted++;
          if (st === 3) pipelineFailed++;
        }
      }
    }

    // ACP jobs
    if (jobsRaw && ownerAddr) {
      const ownerLower = ownerAddr.toLowerCase();
      for (let i = 0; i < jobsRaw.length; i++) {
        const r = jobsRaw[i];
        if (r.status !== "success" || !r.result) continue;
        const j = r.result as any;
        const client = (j.client ?? j[1] ?? "").toLowerCase();
        const provider = (j.provider ?? j[2] ?? "").toLowerCase();
        const isClient = client === ownerLower;
        const isProvider = provider === ownerLower;
        if (!isClient && !isProvider) continue;

        const status = Number(j.status ?? j[7] ?? 0);
        const budget = BigInt(j.budget ?? j[5] ?? 0);
        const description = j.description ?? j[4] ?? "";

        jobs.push({
          id: i + 1,
          role: isProvider ? "Provider" : "Client",
          description,
          budget,
          status,
          counterparty: isProvider ? truncAddr(j.client ?? j[1] ?? "") : truncAddr(j.provider ?? j[2] ?? ""),
        });

        if (isProvider) {
          acpTotal++;
          if (status === 3) {
            acpCompleted++;
            totalEarned += budget;
          }
          if (status === 4) acpRejected++;
        }
      }
    }

    // Capabilities from services
    if (servicesRaw) {
      for (const r of servicesRaw) {
        if (r.status !== "success" || !r.result) continue;
        const svc = r.result as any;
        const hash = svc.capabilityHash ?? svc[2] ?? "";
        if (hash) capabilities.add(hash);
      }
    }

    const completed = pipelineCompleted + acpCompleted;
    const rejected = pipelineFailed + acpRejected;
    const total = pipelineTotal + acpTotal;
    const score = completed * 100 - rejected * 50;
    const onTimeRate = (completed + rejected) > 0
      ? Math.round((completed / (completed + rejected)) * 100)
      : 0;

    return {
      completed,
      rejected,
      total,
      score,
      totalEarned,
      onTimeRate,
      pipelineTotal,
      acpTotal,
      capabilities,
      jobs: jobs.reverse(),
      loading: isLoading,
    };
  }, [stagesRaw, jobsRaw, servicesRaw, agentId, ownerAddr, isLoading]);
}

/* ══════════════════════════════════════════════════════════
   Stats Dashboard Cards
   ══════════════════════════════════════════════════════════ */
function StatsDashboard({ stats }: { stats: AgentStats }) {
  const cards = [
    {
      label: "Jobs Completed",
      value: stats.completed.toString(),
      icon: <CheckCircle2 size={18} />,
      color: "var(--green)",
    },
    {
      label: "Total Earned",
      value: `${formatUnits(stats.totalEarned, 6)} USDC`,
      icon: <CircleDollarSign size={18} />,
      color: "var(--green)",
    },
    {
      label: "On-Time Rate",
      value: stats.total > 0 ? `${stats.onTimeRate}%` : "--",
      icon: <Clock size={18} />,
      color: "var(--accent)",
    },
    {
      label: "Reputation",
      value: stats.score >= 0 ? `+${stats.score}` : `${stats.score}`,
      icon: <TrendingUp size={18} />,
      color: stats.score >= 0 ? "var(--green)" : "var(--red)",
    },
  ];

  return (
    <div className="passport-stats-grid">
      {cards.map((c) => (
        <div key={c.label} className="passport-stat-card glass-card">
          <div className="passport-stat-icon" style={{ color: c.color }}>{c.icon}</div>
          <div className="passport-stat-value" style={{ color: c.color }}>{c.value}</div>
          <div className="passport-stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Job History Timeline
   ══════════════════════════════════════════════════════════ */
function JobHistory({ jobs }: { jobs: JobEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? jobs : jobs.slice(0, 5);

  if (jobs.length === 0) {
    return <div className="passport-empty">No job history yet.</div>;
  }

  const statusColor = (s: number) => {
    if (s === 3) return "pill-green";
    if (s === 4) return "pill-red";
    if (s === 1 || s === 2) return "pill-blue";
    if (s === 5) return "pill-gray";
    return "pill-gray";
  };

  return (
    <div className="passport-timeline">
      {visible.map((j) => (
        <div key={j.id} className="passport-timeline-item glass-card">
          <div className="passport-timeline-row">
            <div className="passport-timeline-left">
              <span className="passport-job-id">Job #{j.id}</span>
              <span className="passport-job-counterparty">{j.counterparty}</span>
            </div>
            <div className="passport-timeline-right">
              <span className={`pill ${statusColor(j.status)}`}>{JOB_STATUS[j.status] ?? "Unknown"}</span>
              <span className={`pill pill-purple`} style={{ fontSize: "0.65rem" }}>{j.role}</span>
            </div>
          </div>
          <div className="passport-job-desc">
            {(j.description || "No description").length > 80
              ? (j.description || "No description").slice(0, 80) + "..."
              : (j.description || "No description")}
          </div>
          <div className="passport-job-budget">
            <CircleDollarSign size={12} />
            <span>{formatUnits(j.budget, 6)} USDC</span>
          </div>
        </div>
      ))}
      {jobs.length > 5 && (
        <button className="passport-show-more" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show less" : `Show all ${jobs.length} jobs`}
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Capabilities Pills
   ══════════════════════════════════════════════════════════ */
function CapabilitiesPills({ capabilities }: { capabilities: Set<string> }) {
  if (capabilities.size === 0) {
    return <div className="passport-empty">No capabilities registered.</div>;
  }

  return (
    <div className="passport-caps-grid">
      {Array.from(capabilities).map((hash) => (
        <span key={hash} className="passport-cap-pill">
          <Zap size={12} />
          {capabilityName(hash)}
        </span>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Endpoints Badges
   ══════════════════════════════════════════════════════════ */
function EndpointsBadges() {
  const endpoints = [
    { label: "REST API", icon: <Globe size={13} /> },
    { label: "Python SDK", icon: <Code2 size={13} /> },
    { label: "LangChain", icon: <Link2 size={13} /> },
  ];

  return (
    <div className="passport-endpoints-grid">
      {endpoints.map((ep) => (
        <div key={ep.label} className="passport-endpoint-badge glass-card">
          {ep.icon}
          <span>{ep.label}</span>
          <CheckCircle2 size={12} className="passport-endpoint-check" />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Passport Component
   ══════════════════════════════════════════════════════════ */
export function AgentProfileModal({ agentId, onClose, onHire }: Props) {
  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const { copied, copy } = useCopyClipboard();

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

  const owner = ownerAddr as string | undefined;
  const uri = tokenURI as string | undefined;

  const stats = useAgentStats(agentId, owner);
  const isVerified = stats.completed >= 3;

  const explorerUrl = `https://testnet.arcscan.app/token/${CONTRACTS.IDENTITY_REGISTRY}?a=${agentId}`;

  return (
    <div className="passport-backdrop" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="passport-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button className="passport-close" onClick={onClose}>
          <X size={18} />
        </button>

        {/* ── Scrollable content ── */}
        <div className="passport-scroll">

          {/* ═══ 1. Identity Header ═══ */}
          <div className="passport-header">
            <div className="passport-avatar-wrapper">
              <div
                className="passport-avatar"
                style={{ background: agentGradient(agentId) }}
              >
                <span>A{agentId}</span>
              </div>
              {isVerified && (
                <div className="passport-verified-badge" title="Verified: 3+ completed jobs">
                  <CheckCircle2 size={18} />
                </div>
              )}
            </div>

            <div className="passport-identity">
              <h2 className="passport-agent-title">
                Agent #{agentId}
                {isVerified && <span className="passport-verified-text">Verified</span>}
              </h2>

              <div className="passport-owner-row">
                <span className="passport-owner-addr">
                  {owner ? truncAddr(owner) : "Loading..."}
                </span>
                {owner && (
                  <button
                    className="passport-copy-btn"
                    onClick={() => copy(owner)}
                    title="Copy address"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>

              {uri && (
                <a
                  className="passport-metadata-link"
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={12} />
                  <span>ERC-8004 Metadata</span>
                </a>
              )}
            </div>
          </div>

          {/* ═══ 2. Stats Dashboard ═══ */}
          <StatsDashboard stats={stats} />

          {/* ═══ Desktop two-column layout ═══ */}
          <div className="passport-body">
            <div className="passport-col-main">

              {/* ═══ 3. Services ═══ */}
              <PassportSection
                icon={<ShoppingBag size={16} style={{ color: "var(--accent)" }} />}
                title="Services"
              >
                <PassportServices agentId={agentId} onHire={onHire} />
              </PassportSection>

              {/* ═══ 4. Job History ═══ */}
              <PassportSection
                icon={<Briefcase size={16} style={{ color: "var(--accent)" }} />}
                title="Job History"
              >
                <JobHistory jobs={stats.jobs} />
              </PassportSection>
            </div>

            <div className="passport-col-side">

              {/* ═══ 5. Capabilities ═══ */}
              <PassportSection
                icon={<Zap size={16} style={{ color: "var(--yellow)" }} />}
                title="Capabilities"
              >
                <CapabilitiesPills capabilities={stats.capabilities} />
              </PassportSection>

              {/* ═══ 6. Endpoints ═══ */}
              <PassportSection
                icon={<Globe size={16} style={{ color: "var(--cyan)" }} />}
                title="Integration Endpoints"
              >
                <EndpointsBadges />
              </PassportSection>

              {/* ═══ Identity Details ═══ */}
              <PassportSection
                icon={<Shield size={16} style={{ color: "var(--purple)" }} />}
                title="On-Chain Identity"
              >
                <div className="passport-identity-details">
                  <div className="passport-id-row">
                    <span className="passport-id-label">Owner</span>
                    <span className="passport-id-value" style={{ fontFamily: "monospace" }}>
                      {owner ?? "..."}
                    </span>
                  </div>
                  <div className="passport-id-row">
                    <span className="passport-id-label">Token ID</span>
                    <span className="passport-id-value">{agentId}</span>
                  </div>
                  <div className="passport-id-row">
                    <span className="passport-id-label">Registry</span>
                    <span className="passport-id-value" style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      {truncAddr(CONTRACTS.IDENTITY_REGISTRY)}
                    </span>
                  </div>
                  <div className="passport-id-row">
                    <span className="passport-id-label">Metadata URI</span>
                    <span className="passport-id-value" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                      {uri ? (uri.length > 40 ? uri.slice(0, 40) + "..." : uri) : "None"}
                    </span>
                  </div>
                  {(stats.pipelineTotal > 0 || stats.acpTotal > 0) && (
                    <div className="passport-id-row">
                      <span className="passport-id-label">Activity</span>
                      <span className="passport-id-value">
                        {stats.pipelineTotal > 0 && `${stats.pipelineTotal} pipeline stages`}
                        {stats.pipelineTotal > 0 && stats.acpTotal > 0 && " + "}
                        {stats.acpTotal > 0 && `${stats.acpTotal} ACP jobs`}
                      </span>
                    </div>
                  )}
                </div>
              </PassportSection>
            </div>
          </div>

          {/* ═══ 7. Hire CTA ═══ */}
          <div className="passport-cta">
            <button
              className="passport-hire-btn"
              onClick={() => {
                if (owner) onHire(agentId, owner, "", BigInt(0));
              }}
              disabled={!owner}
            >
              <Activity size={18} />
              Hire Agent #{agentId} into Pipeline
            </button>
            <a
              className="passport-explorer-link"
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on ArcScan <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
