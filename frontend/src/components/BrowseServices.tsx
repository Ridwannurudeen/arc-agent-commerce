"use client";

import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { keccak256, toHex } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { CAPABILITY_NAMES } from "@/lib/constants";
import { ServiceCard } from "./ServiceCard";
import { Skeleton } from "./Skeleton";

type Props = {
  onHire: (provider: string, agentId: string, price: string) => void;
  onViewAgent: (agentId: number) => void;
};

const PAGE_SIZE = 20;

export function BrowseServices({ onHire, onViewAgent }: Props) {
  const [filter, setFilter] = useState("all");
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const capHash = filter !== "all" ? keccak256(toHex(filter)) : undefined;

  const { data: nextId, isLoading: isLoadingServices } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const { data: filteredIds, isLoading: isLoadingFiltered } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getServicesByCapability",
    args: capHash ? [capHash] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!capHash },
  });

  const isLoading = isLoadingServices || (!!capHash && isLoadingFiltered);
  const count = Number(nextId ?? 0);
  const ids =
    filter !== "all" && filteredIds
      ? (filteredIds as bigint[]).map(Number)
      : Array.from({ length: count }, (_, i) => i);

  const visibleIds = ids.slice(0, displayCount);
  const hasMore = ids.length > displayCount;

  const { data: batchServices } = useReadContracts({
    contracts: visibleIds.map((id) => ({
      address: CONTRACTS.SERVICE_MARKET,
      abi: ServiceMarketABI as any,
      functionName: "getService",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: visibleIds.length > 0 },
  });

  return (
    <div>
      <div className="filter-row">
        <select
          className="search-bar"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setDisplayCount(PAGE_SIZE); }}
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
      {isLoading ? (
        <Skeleton lines={5} />
      ) : ids.length === 0 ? (
        <div className="empty">No services found.</div>
      ) : (
        <>
          <div className="service-list">
            {visibleIds.map((id, idx) => {
              const result = batchServices?.[idx];
              const svcData = result && result.status === "success" ? result.result : undefined;
              return (
                <ServiceCard
                  key={id}
                  serviceId={id}
                  serviceData={svcData}
                  onHire={onHire}
                  onViewAgent={onViewAgent}
                />
              );
            })}
          </div>
          {hasMore && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                className="btn btn-outline"
                onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
              >
                Load More ({ids.length - displayCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
