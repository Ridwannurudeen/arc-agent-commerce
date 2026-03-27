"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import { AgreementCard } from "./AgreementCard";
import { Skeleton } from "./Skeleton";

type Props = {
  onViewAgent: (agentId: number) => void;
};

export function MyAgreements({ onViewAgent }: Props) {
  const { address } = useAccount();
  const [view, setView] = useState<"client" | "provider">("client");

  const { data: clientIds, isLoading: isLoadingClient } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getClientAgreements",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const { data: providerIds, isLoading: isLoadingProvider } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getProviderAgreements",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const cIds = (clientIds as bigint[]) ?? [];
  const pIds = (providerIds as bigint[]) ?? [];
  const ids = view === "client" ? cIds : pIds;
  const isLoading = view === "client" ? isLoadingClient : isLoadingProvider;

  if (!address) {
    return <div className="empty">Connect wallet to view your agreements.</div>;
  }

  return (
    <div>
      <div className="toggle-row">
        <button
          className={`toggle-btn ${view === "client" ? "active" : ""}`}
          onClick={() => setView("client")}
        >
          As Client ({cIds.length})
        </button>
        <button
          className={`toggle-btn ${view === "provider" ? "active" : ""}`}
          onClick={() => setView("provider")}
        >
          As Provider ({pIds.length})
        </button>
      </div>
      {isLoading ? (
        <Skeleton lines={4} />
      ) : ids.length === 0 ? (
        <div className="empty">No agreements found as {view}.</div>
      ) : (
        ids.map((id) => (
          <AgreementCard
            key={id.toString()}
            agreementId={Number(id)}
            onViewAgent={onViewAgent}
          />
        ))
      )}
    </div>
  );
}
