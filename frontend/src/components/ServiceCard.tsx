"use client";

import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { capabilityName } from "@/lib/constants";
import type { ServiceData } from "@/lib/types";

type Props = {
  serviceId: number;
  onHire: (provider: string, agentId: string, price: string) => void;
  onViewAgent?: (agentId: number) => void;
};

export function ServiceCard({ serviceId, onHire, onViewAgent }: Props) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as unknown as ServiceData;
  if (!svc.active) return null;

  const priceStr = formatUnits(svc.pricePerTask, 6);

  return (
    <div className="service-item">
      <div className="info">
        <h4>{capabilityName(svc.capabilityHash)}</h4>
        <div className="meta">
          Service #{serviceId} &middot;{" "}
          <span
            className="agent-link"
            onClick={() => onViewAgent?.(Number(svc.agentId))}
          >
            Agent #{svc.agentId.toString()}
          </span>{" "}
          &middot;{" "}
          <span className="addr">
            {svc.provider.slice(0, 6)}...{svc.provider.slice(-4)}
          </span>
        </div>
        <div className="meta" style={{ marginTop: "0.25rem" }}>
          {svc.metadataURI}
        </div>
      </div>
      <div className="flex-row">
        <div className="price">{priceStr} USDC</div>
        <button
          className="btn btn-sm"
          onClick={() => onHire(svc.provider, svc.agentId.toString(), priceStr)}
        >
          Hire
        </button>
      </div>
    </div>
  );
}
