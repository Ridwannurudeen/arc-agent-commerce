"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import { Skeleton } from "@/components/Skeleton";

const PAGE_SIZE = 25;

type AgentInfo = {
  id: number;
  owner: string;
  tokenURI: string;
};

export function AgentDirectory({ onViewAgent }: { onViewAgent: (agentId: number) => void }) {
  const [page, setPage] = useState(0);
  const [searchId, setSearchId] = useState("");

  // Read total agent count dynamically from contract
  const { data: totalSupplyRaw } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "totalSupply",
    chainId: arcTestnet.id,
  });

  const totalAgents = Number(totalSupplyRaw ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalAgents / PAGE_SIZE));
  // Show newest first: page 0 = agents MAX..MAX-PAGE_SIZE
  const startId = totalAgents - page * PAGE_SIZE;
  const endId = Math.max(1, startId - PAGE_SIZE + 1);
  const ids = startId > 0 ? Array.from({ length: startId - endId + 1 }, (_, i) => startId - i) : [];

  // Batch read ownerOf for this page
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

  // Batch read tokenURI for this page
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

  const isLoading = loadingOwners || loadingURIs;
  const addr = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;

  const handleSearch = () => {
    const id = parseInt(searchId);
    if (id > 0) {
      onViewAgent(id);
    }
  };

  // Count unique owners on this page
  const uniqueOwners = new Set(agents.map((a) => a.owner.toLowerCase())).size;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>Agent Directory — Arc Ecosystem</h2>
        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
          {totalAgents} agents registered
        </span>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <input
          type="number"
          placeholder="Search by Agent ID..."
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{
            padding: "0.5rem 0.75rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text)",
            fontSize: "0.85rem",
            width: "200px",
          }}
        />
        <button className="btn-sm" onClick={handleSearch}>
          View Profile
        </button>
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && totalAgents > 0 && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
          Showing agents #{startId} – #{endId} &middot; {uniqueOwners} unique owners on this page
        </div>
      )}

      <div style={{ display: "grid", gap: "0.5rem" }}>
        {agents.map((a) => (
          <div
            key={a.id}
            className="card"
            style={{
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => onViewAgent(a.id)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontWeight: 600, minWidth: "80px" }}>Agent #{a.id}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                Owner: {addr(a.owner)}
              </span>
              {a.tokenURI && (
                <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>
                  {a.tokenURI.startsWith("ipfs://") ? "IPFS" :
                   a.tokenURI.startsWith("arc://") ? a.tokenURI.replace("arc://agent/", "") :
                   a.tokenURI.length > 30 ? a.tokenURI.slice(0, 30) + "..." : a.tokenURI}
                </span>
              )}
            </div>
            <button className="btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); onViewAgent(a.id); }}>
              Profile
            </button>
          </div>
        ))}
      </div>

      {/* Pagination */}
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
    </div>
  );
}
