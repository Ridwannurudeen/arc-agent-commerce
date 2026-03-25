"use client";

import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import { capabilityName, STATUS_LABELS } from "@/lib/constants";
import type { ServiceData, AgreementData } from "@/lib/types";

type Props = {
  agentId: number;
  onClose: () => void;
  onHire: (provider: string, agentId: string, price: string) => void;
};

function AgentServices({ agentId, onHire }: { agentId: number; onHire: Props["onHire"] }) {
  const { data: serviceIds } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getServicesByAgent",
    args: [BigInt(agentId)],
    chainId: arcTestnet.id,
  });

  const ids = (serviceIds as bigint[]) ?? [];

  if (ids.length === 0) {
    return <div className="meta">No services listed.</div>;
  }

  return (
    <div>
      {ids.map((sid) => (
        <AgentServiceRow key={sid.toString()} serviceId={Number(sid)} onHire={onHire} />
      ))}
    </div>
  );
}

function AgentServiceRow({ serviceId, onHire }: { serviceId: number; onHire: Props["onHire"] }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as unknown as ServiceData;
  const priceStr = formatUnits(svc.pricePerTask, 6);

  return (
    <div className="service-item" style={{ marginBottom: "0.5rem" }}>
      <div className="info">
        <h4>
          {capabilityName(svc.capabilityHash)}
          {!svc.active && <span className="status expired" style={{ marginLeft: "0.5rem" }}>INACTIVE</span>}
        </h4>
        <div className="meta">Service #{serviceId}</div>
      </div>
      <div className="flex-row">
        <div className="price">{priceStr} USDC</div>
        {svc.active && (
          <button
            className="btn btn-sm"
            onClick={() => onHire(svc.provider, svc.agentId.toString(), priceStr)}
          >
            Hire
          </button>
        )}
      </div>
    </div>
  );
}

function AgentReputation({ agentId }: { agentId: number }) {
  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const count = Number(nextId ?? 0);

  // We read all agreements and filter by providerAgentId
  // This is O(n) — acceptable at testnet scale
  return (
    <ReputationCalculator agentId={agentId} totalAgreements={count} />
  );
}

function ReputationCalculator({ agentId, totalAgreements }: { agentId: number; totalAgreements: number }) {
  // Read agreements in batches — for testnet, just render individual readers
  const items: React.ReactNode[] = [];
  for (let i = 0; i < totalAgreements; i++) {
    items.push(<ReputationAgreement key={i} agreementId={i} agentId={agentId} />);
  }

  return (
    <div>
      <ReputationSummary agentId={agentId} totalAgreements={totalAgreements} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.5rem" }}>
        Agreement history as provider:
      </div>
      {items.length === 0 ? (
        <div className="meta">No agreements found.</div>
      ) : (
        items
      )}
    </div>
  );
}

function ReputationSummary({ agentId, totalAgreements }: { agentId: number; totalAgreements: number }) {
  // We need to iterate all agreements. For now, display a note.
  // Individual agreement items will show inline.
  return null;
}

function ReputationAgreement({ agreementId, agentId }: { agreementId: number; agentId: number }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const agr = data as unknown as AgreementData;
  if (Number(agr.providerAgentId) !== agentId) return null;

  const statusLabel = STATUS_LABELS[agr.status] ?? "unknown";
  const scoreMap: Record<number, number> = { 1: 100, 4: -50, 3: -30 };
  const score = scoreMap[agr.status] ?? 0;

  return (
    <div className="agreement-item" style={{ padding: "0.5rem 0.75rem", marginBottom: "0.25rem" }}>
      <div className="row">
        <span className="label">#{agreementId} — {formatUnits(agr.amount, 6)} USDC</span>
        <span>
          <span className={`status ${statusLabel}`}>{statusLabel.toUpperCase()}</span>
          {score !== 0 && (
            <span className={`reputation-score ${score > 0 ? "positive" : "negative"}`}>
              {score > 0 ? "+" : ""}{score}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function AgentProfileModal({ agentId, onClose, onHire }: Props) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>

        <div className="profile-header">
          <h2>Agent #{agentId}</h2>
        </div>

        <div className="profile-section">
          <h4>Identity</h4>
          <div className="policy-stat">
            <span className="label">Owner</span>
            <span className="addr">{(ownerAddr as string) ?? "—"}</span>
          </div>
          <div className="policy-stat">
            <span className="label">Metadata</span>
            <span className="addr" style={{ wordBreak: "break-all" }}>
              {(tokenURI as string) || "—"}
            </span>
          </div>
        </div>

        <div className="profile-section">
          <h4>Services</h4>
          <AgentServices agentId={agentId} onHire={onHire} />
        </div>

        <div className="profile-section">
          <h4>Reputation &amp; History</h4>
          <div className="meta" style={{ marginBottom: "0.5rem" }}>
            Scoring: Completed +100, Resolved -50, Expired -30
          </div>
          <AgentReputation agentId={agentId} />
        </div>
      </div>
    </div>
  );
}
