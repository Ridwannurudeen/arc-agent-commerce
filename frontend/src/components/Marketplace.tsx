"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { capabilityName } from "@/lib/constants";
import { formatUnits } from "viem";
import { Skeleton } from "@/components/Skeleton";

type Props = {
  onViewAgent: (agentId: number) => void;
  onHire: (agentId: number, provider: string, capability: string, price: bigint) => void;
};

export function Marketplace({ onViewAgent, onHire }: Props) {
  const [selectedCapability, setSelectedCapability] = useState<string>("all");

  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
  });

  const serviceCount = Number(nextId ?? 0);

  const { data: servicesRaw, isLoading } = useReadContracts({
    contracts: Array.from({ length: serviceCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_MARKET as `0x${string}`,
      abi: ServiceMarketABI as any,
      functionName: "getService",
      args: [BigInt(i)],
    })),
    query: { enabled: serviceCount > 0 },
  });

  const services = useMemo(() => {
    if (!servicesRaw) return [];
    return servicesRaw
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const d = r.result as any[];
        return {
          serviceId: i,
          agentId: Number(d[0]),
          provider: d[1] as string,
          capabilityHash: d[2] as string,
          pricePerTask: BigInt(d[3]),
          metadataURI: d[4] as string,
          active: d[5] as boolean,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.active);
  }, [servicesRaw]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const s of services) {
      const hash = s.capabilityHash.toLowerCase();
      if (!map.has(hash)) map.set(hash, []);
      map.get(hash)!.push(s);
    }
    return map;
  }, [services]);

  const filtered =
    selectedCapability === "all"
      ? services
      : services.filter((s) => s.capabilityHash.toLowerCase() === selectedCapability);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>Agent Marketplace</h2>
        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
          {services.length} active services across {grouped.size} capabilities
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button
          className={`btn-sm ${selectedCapability === "all" ? "" : "btn-outline"}`}
          onClick={() => setSelectedCapability("all")}
          style={selectedCapability === "all" ? { background: "var(--accent)", color: "#fff" } : {}}
        >
          All ({services.length})
        </button>
        {Array.from(grouped.entries()).map(([hash, svcs]) => (
          <button
            key={hash}
            className={`btn-sm ${selectedCapability === hash ? "" : "btn-outline"}`}
            onClick={() => setSelectedCapability(hash)}
            style={selectedCapability === hash ? { background: "var(--accent)", color: "#fff" } : {}}
          >
            {capabilityName(hash)} ({svcs.length})
          </button>
        ))}
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && filtered.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-dim)", marginBottom: "0.5rem" }}>No agents available yet.</p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            Be the first — register your agent in the Provider section.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {filtered.map((s) => (
          <div
            key={s.serviceId}
            className="card"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem" }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                <button className="agent-link" onClick={() => onViewAgent(s.agentId)} style={{ fontWeight: 600, background: "none", border: "none", padding: 0 }}>
                  Agent #{s.agentId}
                </button>
                <span className="status active" style={{ fontSize: "0.75rem" }}>
                  {capabilityName(s.capabilityHash)}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                {s.provider.slice(0, 6)}...{s.provider.slice(-4)}
                {s.metadataURI && (
                  <>
                    {" "}
                    &middot; {s.metadataURI.length > 50 ? s.metadataURI.slice(0, 50) + "..." : s.metadataURI}
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontWeight: 600, fontSize: "1rem" }}>
                {formatUnits(s.pricePerTask, 6)} USDC
              </span>
              <button className="btn-sm btn-outline" onClick={() => onViewAgent(s.agentId)}>
                Profile
              </button>
              <button
                className="btn-sm"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => onHire(s.agentId, s.provider, s.capabilityHash, s.pricePerTask)}
              >
                Hire
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
