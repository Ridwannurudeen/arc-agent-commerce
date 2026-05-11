"use client";

import { useState, useMemo, useEffect } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { capabilityName } from "@/lib/constants";
import { formatUnits } from "viem";
import { SkeletonGrid } from "@/components/Skeleton";
import { motion } from "framer-motion";
import { Search, CheckCircle2, PackageSearch } from "lucide-react";

type Props = {
  onViewAgent: (agentId: number) => void;
  onHire: (agentId: number, provider: string, capability: string, price: bigint) => void;
};

function agentColor(id: number): string {
  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
  return colors[id % colors.length];
}

function agentInitials(id: number): string {
  return `A${id}`;
}

const FILTER_TAGS: { label: string; match: (cap: string) => boolean }[] = [
  { label: "All", match: () => true },
  { label: "Audit", match: (c) => c.includes("audit") },
  { label: "Security", match: (c) => c.includes("security") },
  { label: "Deploy", match: (c) => c.includes("deploy") },
  { label: "Monitor", match: (c) => c.includes("monitor") },
  { label: "Testing", match: (c) => c.includes("test") },
  { label: "Consulting", match: (c) => c.includes("consult") },
];

type ApiService = {
  serviceId: number;
  agentId: number;
  provider: string;
  capabilityHash: string;
  priceUsdc: number;
  priceRaw: string;
  metadataUri: string;
  active: boolean;
};

type ApiStats = {
  totalServices: number;
  activeServices: number;
  totalJobs: number;
  completedJobs: number;
};

export function Marketplace({ onViewAgent, onHire }: Props) {
  const [selectedCapability, setSelectedCapability] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState(0);

  // API fallback data
  const [apiServices, setApiServices] = useState<ApiService[] | null>(null);
  const [apiStats, setApiStats] = useState<ApiStats | null>(null);
  const [apiFetched, setApiFetched] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/services").then((r) => r.json()).catch(() => null),
      fetch("/api/stats").then((r) => r.json()).catch(() => null),
    ]).then(([svcData, statsData]) => {
      if (svcData?.services) setApiServices(svcData.services);
      if (statsData?.totalServices != null) setApiStats(statsData);
      setApiFetched(true);
    });
  }, []);

  const { data: nextId, isError: serviceError } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const serviceCount = Number(nextId ?? 0);

  const { data: servicesRaw, isLoading, isError: batchError } = useReadContracts({
    contracts: Array.from({ length: serviceCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_MARKET as `0x${string}`,
      abi: ServiceMarketABI as any,
      functionName: "getService",
      args: [BigInt(i)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: serviceCount > 0 },
  });

  // Fetch ACP job stats for reputation badges
  const { data: jobCounterRaw } = useReadContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AgenticCommerceABI as any,
    functionName: "jobCounter",
    chainId: arcTestnet.id,
  });

  const jobCount = Number(jobCounterRaw ?? 0);

  const { data: jobsRaw } = useReadContracts({
    contracts: Array.from({ length: jobCount }, (_, i) => ({
      address: CONTRACTS.AGENTIC_COMMERCE as `0x${string}`,
      abi: AgenticCommerceABI as any,
      functionName: "getJob",
      args: [BigInt(i + 1)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: jobCount > 0 },
  });

  // Build provider reputation map: provider address -> { completed, total }
  const providerStats = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    if (!jobsRaw) return map;
    for (const r of jobsRaw) {
      if (r.status !== "success" || !r.result) continue;
      const j = r.result as any;
      const provider = ((j.provider ?? j[2] ?? "") as string || "").toLowerCase();
      if (provider === "0x0000000000000000000000000000000000000000") continue;
      if (!map.has(provider)) map.set(provider, { completed: 0, total: 0 });
      const stats = map.get(provider)!;
      stats.total++;
      if (Number(j.status ?? j[7] ?? 0) === 3) stats.completed++;
    }
    return map;
  }, [jobsRaw]);

  // Count total completed jobs
  const completedJobs = useMemo(() => {
    let count = 0;
    providerStats.forEach((s) => { count += s.completed; });
    return count;
  }, [providerStats]);

  const services = useMemo(() => {
    // Try on-chain data first
    if (servicesRaw && servicesRaw.length > 0) {
      const onChain = servicesRaw
        .map((r, i) => {
          if (r.status !== "success" || !r.result) return null;
          // ServiceMarket.Service has named struct fields so viem decodes
          // it as an object, not an indexed array.
          const d = r.result as any;
          const provider = ((d.provider ?? d[1] ?? "") as string) || "";
          if (!provider) return null;
          return {
            serviceId: i,
            agentId: Number(d.agentId ?? d[0] ?? 0),
            provider,
            capabilityHash: ((d.capabilityHash ?? d[2] ?? "") as string) || "",
            pricePerTask: BigInt(d.pricePerTask ?? d[3] ?? 0),
            metadataURI: ((d.metadataURI ?? d[4] ?? "") as string) || "",
            active: !!(d.active ?? d[5]),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null && s.active);
      if (onChain.length > 0) return onChain;
    }
    // Fallback to API data
    if (apiServices) {
      return apiServices
        .filter((s) => s.active)
        .map((s) => ({
          serviceId: s.serviceId,
          agentId: s.agentId,
          provider: s.provider,
          capabilityHash: s.capabilityHash,
          pricePerTask: BigInt(s.priceRaw || Math.round(s.priceUsdc * 1_000_000)),
          metadataURI: s.metadataUri || "",
          active: true,
        }));
    }
    return [];
  }, [servicesRaw, apiServices]);

  // Unique agent count
  const uniqueAgents = useMemo(() => {
    const ids = new Set<number>();
    services.forEach((s) => ids.add(s.agentId));
    return ids.size;
  }, [services]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const s of services) {
      const hash = s.capabilityHash.toLowerCase();
      if (!map.has(hash)) map.set(hash, []);
      map.get(hash)!.push(s);
    }
    return map;
  }, [services]);

  // Count services per filter tag
  const tagCounts = useMemo(() => {
    return FILTER_TAGS.map((tag) => {
      if (tag.label === "All") return services.length;
      return services.filter((s) => {
        const name = capabilityName(s.capabilityHash).toLowerCase();
        return tag.match(name);
      }).length;
    });
  }, [services]);

  // Apply tag + search filtering
  const filtered = useMemo(() => {
    let result = services;

    // Capability filter (legacy dropdown)
    if (selectedCapability !== "all") {
      result = result.filter((s) => s.capabilityHash.toLowerCase() === selectedCapability);
    }

    // Tag filter
    if (activeTag > 0) {
      const tag = FILTER_TAGS[activeTag];
      result = result.filter((s) => {
        const name = capabilityName(s.capabilityHash).toLowerCase();
        return tag.match(name);
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const name = capabilityName(s.capabilityHash).toLowerCase();
        const agentStr = `agent #${s.agentId}`.toLowerCase();
        const addr = s.provider.toLowerCase();
        return name.includes(q) || agentStr.includes(q) || addr.includes(q);
      });
    }

    return result;
  }, [services, selectedCapability, activeTag, searchQuery]);

  const isError = serviceError || batchError;

  return (
    <div>
      {/* ── Bento Grid Stats ── */}
      <div className="bento-grid">
        <div className="bento-card">
          <div className="label">Services Listed</div>
          <div className="value">{services.length || apiStats?.activeServices || 0}</div>
        </div>
        <div className="bento-card">
          <div className="label">Agents Active</div>
          <div className="value">{uniqueAgents || (apiServices ? new Set(apiServices.map((s) => s.agentId)).size : 0)}</div>
        </div>
        <div className="bento-card">
          <div className="label">Jobs Completed</div>
          <div className="value">{completedJobs || apiStats?.completedJobs || 0}</div>
        </div>
        <div className="bento-card">
          <div className="label">Network</div>
          <div className="value" style={{ display: "flex", alignItems: "center", fontSize: "1rem" }}>
            <span className="status-dot green" />
            Arc Testnet
          </div>
        </div>
      </div>

      {/* ── Floating Search Bar ── */}
      <div className="search-floating">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search agents by capability..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ── Quick Filter Tags ── */}
      <div className="quick-filters">
        {FILTER_TAGS.map((tag, i) => (
          <button
            key={tag.label}
            className={`quick-filter${activeTag === i ? " active" : ""}`}
            onClick={() => {
              setActiveTag(i);
              setSelectedCapability("all");
            }}
          >
            #{tag.label} ({tagCounts[i]})
          </button>
        ))}
      </div>

      {/* ── Loading State ── */}
      {isLoading && !apiFetched && <SkeletonGrid count={6} />}

      {/* ── Error State ── */}
      {isError && !isLoading && (
        <div className="warning-banner" style={{ marginBottom: "1rem" }}>
          Failed to load marketplace data. Check your network connection or switch to Arc Testnet.
        </div>
      )}

      {/* ── Empty State ── */}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="empty-state">
          <PackageSearch size={48} className="empty-icon" />
          <p>
            {searchQuery
              ? `No agents match "${searchQuery}".`
              : activeTag > 0
                ? `No agents offering ${FILTER_TAGS[activeTag].label} services.`
                : "No agents available yet."}
          </p>
          <p className="secondary">
            {searchQuery || activeTag > 0
              ? "Try a different search or browse all services."
              : "Be the first -- register your agent in the Provider section."}
          </p>
        </div>
      )}

      {/* ── Service Card Grid ── */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="service-grid">
          {filtered.map((s) => {
            const stats = providerStats.get(s.provider.toLowerCase());
            const isVerified = (stats?.completed ?? 0) >= 3;
            const priceFormatted = formatUnits(s.pricePerTask, 6);

            return (
              <motion.div
                key={s.serviceId}
                className="service-card"
                whileHover={{ y: -4, borderColor: "rgba(59, 130, 246, 0.5)" }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                {/* Card Header */}
                <div className="service-card-header">
                  <div
                    className="agent-avatar"
                    style={{ background: agentColor(s.agentId) }}
                  >
                    {agentInitials(s.agentId)}
                  </div>
                  <div className="service-card-info">
                    <div className="capability-name">
                      {capabilityName(s.capabilityHash)}
                    </div>
                    <div className="agent-id-row">
                      <button
                        className="agent-link"
                        onClick={() => onViewAgent(s.agentId)}
                        style={{ background: "none", border: "none", padding: 0, fontSize: "0.82rem" }}
                      >
                        Agent #{s.agentId}
                      </button>
                      {isVerified && (
                        <span title="3+ completed ACP jobs" style={{ display: "inline-flex" }}>
                          <CheckCircle2 size={14} className="verified" />
                        </span>
                      )}
                      {stats && stats.total > 0 && (
                        <span style={{
                          fontSize: "0.68rem",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "4px",
                          background: stats.completed === stats.total
                            ? "rgba(34, 197, 94, 0.15)"
                            : "rgba(234, 179, 8, 0.15)",
                          color: stats.completed === stats.total
                            ? "var(--green)"
                            : "var(--yellow)",
                          fontWeight: 600,
                        }}>
                          {stats.completed}/{stats.total}
                        </span>
                      )}
                    </div>
                    <div className="meta-line">
                      {s.provider.slice(0, 6)}...{s.provider.slice(-4)}
                    </div>
                    {s.metadataURI && (
                      <div className="meta-line">
                        {s.metadataURI.length > 40
                          ? s.metadataURI.slice(0, 40) + "..."
                          : s.metadataURI}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="service-card-footer">
                  <span className="price-pill">
                    ${priceFormatted} USDC
                  </span>
                  <button
                    className="btn-hire"
                    onClick={() => onHire(s.agentId, s.provider, s.capabilityHash, s.pricePerTask)}
                  >
                    Hire
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
