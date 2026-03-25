"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { keccak256, toHex } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { CAPABILITY_NAMES } from "@/lib/constants";
import { ServiceCard } from "./ServiceCard";

type Props = {
  onHire: (provider: string, agentId: string, price: string) => void;
  onViewAgent: (agentId: number) => void;
};

export function BrowseServices({ onHire, onViewAgent }: Props) {
  const [filter, setFilter] = useState("all");

  const capHash = filter !== "all" ? keccak256(toHex(filter)) : undefined;

  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const { data: filteredIds } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getServicesByCapability",
    args: capHash ? [capHash] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!capHash },
  });

  const count = Number(nextId ?? 0);
  const ids =
    filter !== "all" && filteredIds
      ? (filteredIds as bigint[]).map(Number)
      : Array.from({ length: count }, (_, i) => i);

  return (
    <div>
      <div className="filter-row">
        <select
          className="search-bar"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Capabilities</option>
          {CAPABILITY_NAMES.map(([raw, display]) => (
            <option key={raw} value={raw}>
              {display}
            </option>
          ))}
        </select>
        <span className="meta" style={{ marginLeft: "0.75rem" }}>
          {ids.length} of {count} services
        </span>
      </div>
      {ids.length === 0 ? (
        <div className="empty">No services found.</div>
      ) : (
        <div className="service-list">
          {ids.map((id) => (
            <ServiceCard
              key={id}
              serviceId={id}
              onHire={onHire}
              onViewAgent={onViewAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
