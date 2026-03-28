"use client";

import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { AgreementCard } from "./AgreementCard";
import type { Tab } from "@/lib/types";

type Props = {
  onNavigate: (tab: Tab) => void;
  onViewAgent: (agentId: number) => void;
};

export function Dashboard({ onNavigate, onViewAgent }: Props) {
  const { address } = useAccount();
  const balance = useUsdcBalance();

  const { data: clientIds } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getClientAgreements",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const { data: providerIds } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getProviderAgreements",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  if (!address) {
    return <div className="empty">Connect wallet to view your dashboard.</div>;
  }

  const cIds = (clientIds as bigint[]) ?? [];
  const pIds = (providerIds as bigint[]) ?? [];

  // Merge, dedupe, sort descending by ID — show recent 5
  const allIds = [...new Set([...cIds, ...pIds].map(Number))].sort((a, b) => b - a);
  const recentIds = allIds.slice(0, 5);

  return (
    <div>
      <div className="stats">
        <div className="stat-card">
          <div className="label">As Client</div>
          <div className="value">{cIds.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">As Provider</div>
          <div className="value">{pIds.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Agreements</div>
          <div className="value">{allIds.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">USDC Balance</div>
          <div className="value">{balance ?? "\u2014"}</div>
        </div>
      </div>

      <div className="actions" style={{ marginBottom: "1.5rem" }}>
        <button className="btn" onClick={() => onNavigate("services")}>
          Browse Services
        </button>
        <button className="btn btn-outline" onClick={() => onNavigate("list-service")}>
          List Service
        </button>
        <button className="btn btn-outline" onClick={() => onNavigate("create-agreement")}>
          Create Agreement
        </button>
      </div>

      {recentIds.length > 0 && (
        <>
          <h3 style={{ marginBottom: "1rem", color: "var(--text-dim)" }}>Recent Agreements</h3>
          {recentIds.map((id) => (
            <AgreementCard key={id} agreementId={id} onViewAgent={onViewAgent} />
          ))}
        </>
      )}
    </div>
  );
}
