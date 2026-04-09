"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import { Skeleton } from "@/components/Skeleton";
import { useOwnedAgents } from "@/hooks/useOwnedAgents";
import { motion } from "framer-motion";
import { Users, Search, ExternalLink, PackageSearch, Star } from "lucide-react";

const PAGE_SIZE = 25;

function agentColor(id: number): string {
  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
  return colors[id % colors.length];
}

type AgentInfo = {
  id: number;
  owner: string;
  tokenURI: string;
};

function AgentCard({
  agent,
  index,
  highlight,
  onClick,
  addrShort,
}: {
  agent: AgentInfo;
  index: number;
  highlight?: boolean;
  onClick: (id: number) => void;
  addrShort: (s: string) => string;
}) {
  return (
    <motion.div
      key={agent.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className="glass-card"
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        border: highlight ? "1px solid var(--accent)" : undefined,
        boxShadow: highlight ? "0 0 0 1px var(--accent)" : undefined,
      }}
      onClick={() => onClick(agent.id)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <div
          className="agent-avatar"
          style={{ background: agentColor(agent.id), width: 36, height: 36, minWidth: 36, fontSize: "0.65rem" }}
        >
          A{agent.id}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            Agent #{agent.id}
            {highlight && <Star size={12} style={{ color: "var(--accent)", fill: "var(--accent)" }} />}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
            {addrShort(agent.owner)}
          </div>
        </div>
      </div>

      {agent.tokenURI && (
        <div style={{ fontSize: "0.72rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <ExternalLink size={11} />
          {agent.tokenURI.startsWith("ipfs://") ? "IPFS" :
            agent.tokenURI.startsWith("arc://") ? agent.tokenURI.replace("arc://agent/", "") :
            agent.tokenURI.length > 25 ? agent.tokenURI.slice(0, 25) + "..." : agent.tokenURI}
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: "0.35rem", borderTop: "1px solid var(--border)" }}>
        <button
          className="btn-sm btn-outline"
          style={{ width: "100%", fontSize: "0.75rem" }}
          onClick={(e) => { e.stopPropagation(); onClick(agent.id); }}
        >
          View Profile
        </button>
      </div>
    </motion.div>
  );
}

export function AgentDirectory({ onViewAgent }: { onViewAgent: (agentId: number) => void }) {
  const { address } = useAccount();
  const { agentIds: ownedAgentIds } = useOwnedAgents(address);
  const [page, setPage] = useState(0);
  const [searchId, setSearchId] = useState("");

  // IdentityRegistry has no working totalSupply() on Arc — the count
  // endpoint binary-searches ownerOf to find the highest minted ID.
  const [totalAgents, setTotalAgents] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/count")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && typeof data?.totalAgents === "number") {
          setTotalAgents(data.totalAgents);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const totalPages = Math.max(1, Math.ceil(totalAgents / PAGE_SIZE));
  const startId = totalAgents - page * PAGE_SIZE;
  const endId = Math.max(1, startId - PAGE_SIZE + 1);
  const ids = startId > 0 ? Array.from({ length: startId - endId + 1 }, (_, i) => startId - i) : [];

  const { data: ownersRaw, isLoading: loadingOwners } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
      abi: IdentityRegistryABI as any,
      functionName: "ownerOf",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: ids.length > 0 },
  });

  const { data: urisRaw, isLoading: loadingURIs } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
      abi: IdentityRegistryABI as any,
      functionName: "tokenURI",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: ids.length > 0 },
  });

  const agents: AgentInfo[] = useMemo(() => {
    if (!ownersRaw) return [];
    return ids
      .map((id, i) => {
        const ownerResult = ownersRaw[i];
        const uriResult = urisRaw?.[i];
        if (ownerResult?.status !== "success") return null;
        return {
          id,
          owner: ownerResult.result as string,
          tokenURI: uriResult?.status === "success" ? (uriResult.result as string) : "",
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [ownersRaw, urisRaw, ids]);

  // Tag each agent card that belongs to the connected wallet so it
  // stands out when the user scrolls the directory.
  const ownedSet = useMemo(() => new Set(ownedAgentIds), [ownedAgentIds]);

  // Fetch tokenURI for owned agents that may not be in the current page.
  const { data: ownedUrisRaw } = useReadContracts({
    contracts: ownedAgentIds.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
      abi: IdentityRegistryABI as any,
      functionName: "tokenURI",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: ownedAgentIds.length > 0 },
  });

  const ownedAgents: AgentInfo[] = useMemo(() => {
    if (!address || ownedAgentIds.length === 0) return [];
    return ownedAgentIds.map((id, i) => ({
      id,
      owner: address,
      tokenURI:
        ownedUrisRaw?.[i]?.status === "success" ? (ownedUrisRaw[i].result as string) : "",
    }));
  }, [ownedAgentIds, ownedUrisRaw, address]);

  const isLoading = loadingOwners || loadingURIs;
  const addr = (s: string) => { const v = s || ""; return `${v.slice(0, 6)}...${v.slice(-4)}`; };

  const handleSearch = () => {
    const id = parseInt(searchId);
    if (id > 0) onViewAgent(id);
  };

  const uniqueOwners = new Set(agents.map((a) => (a.owner || "").toLowerCase())).size;

  return (
    <div>
      <div className="section-header">
        <h2>Agent Directory</h2>
        <p className="section-subtitle">{totalAgents} agents registered on Arc Ecosystem</p>
      </div>

      {/* Search */}
      <div className="search-floating" style={{ marginBottom: "1.25rem" }}>
        <Search size={16} className="search-icon" />
        <input
          type="number"
          placeholder="Search by Agent ID..."
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
      </div>

      {/* My Agents section — only shown when wallet is connected and owns agents */}
      {ownedAgents.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Star size={14} style={{ color: "var(--accent)", fill: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>My Agents</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>({ownedAgents.length})</span>
          </div>
          <div className="agent-grid">
            {ownedAgents.map((a, idx) => (
              <AgentCard
                key={`owned-${a.id}`}
                agent={a}
                index={idx}
                highlight
                addrShort={addr}
                onClick={onViewAgent}
              />
            ))}
          </div>
        </div>
      )}

      {isLoading && <Skeleton />}

      {!isLoading && totalAgents > 0 && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "1rem" }}>
          Showing agents #{startId} -- #{endId} &middot; {uniqueOwners} unique owners on this page
        </div>
      )}

      <div className="agent-grid">
        {agents.map((a, idx) => (
          <AgentCard
            key={a.id}
            agent={a}
            index={idx}
            highlight={ownedSet.has(a.id)}
            addrShort={addr}
            onClick={onViewAgent}
          />
        ))}
      </div>

      {!isLoading && agents.length === 0 && (
        <div className="empty-state">
          <PackageSearch size={40} className="empty-icon" />
          <p>No agents found</p>
        </div>
      )}

      {/* Pagination */}
      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
        <span className="page-info">Page {page + 1} / {totalPages}</span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Older</button>
      </div>
    </div>
  );
}
