"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import { capabilityName, STAGE_STATUS } from "@/lib/constants";
import type { ServiceData } from "@/lib/types";

type Props = {
  agentId: number;
  onClose: () => void;
  onHire: (agentId: number, provider: string, capability: string, price: bigint) => void;
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
    return <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No services listed.</div>;
  }

  return (
    <div>
      {ids.map((sid) => (
        <AgentServiceRow key={sid.toString()} serviceId={Number(sid)} agentId={agentId} onHire={onHire} />
      ))}
    </div>
  );
}

function AgentServiceRow({ serviceId, agentId, onHire }: { serviceId: number; agentId: number; onHire: Props["onHire"] }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as unknown as ServiceData;

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
        <div className="price">{formatUnits(svc.pricePerTask, 6)} USDC</div>
        {svc.active && (
          <button
            className="btn btn-sm"
            onClick={() => onHire(agentId, svc.provider, svc.capabilityHash, svc.pricePerTask)}
          >
            Hire
          </button>
        )}
      </div>
    </div>
  );
}

function AgentReputation({ agentId }: { agentId: number }) {
  // Compute from pipeline stages where this agent is provider
  const { data: nextPipelineId } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "nextPipelineId",
    chainId: arcTestnet.id,
  });

  const pipelineCount = Number(nextPipelineId ?? 0);

  const { data: stagesRaw } = useReadContracts({
    contracts: Array.from({ length: pipelineCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR as `0x${string}`,
      abi: PipelineOrchestratorABI as any,
      functionName: "getStages",
      args: [BigInt(i)],
    })),
    query: { enabled: pipelineCount > 0 },
  });

  const stats = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let total = 0;

    if (!stagesRaw) return { completed, failed, total, score: 0 };

    for (const r of stagesRaw) {
      if (r.status !== "success" || !r.result) continue;
      const stages = r.result as any[];
      for (const s of stages) {
        const provAgentId = Number(s.providerAgentId ?? s[0]);
        if (provAgentId !== agentId) continue;
        total++;
        if (Number(s.status ?? s[5]) === 2) completed++;
        if (Number(s.status ?? s[5]) === 3) failed++;
      }
    }

    const score = completed * 100 - failed * 50;
    return { completed, failed, total, score };
  }, [stagesRaw, agentId]);

  if (stats.total === 0) {
    return <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No pipeline history yet.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem" }}>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            {stats.score}
            <span className={`reputation-score ${stats.score >= 0 ? "positive" : "negative"}`} style={{ marginLeft: "0.5rem" }}>
              {stats.score >= 0 ? "+" : ""}{stats.score}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Reputation Score</div>
        </div>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--green)" }}>{stats.completed}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Completed</div>
        </div>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--red)" }}>{stats.failed}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Failed</div>
        </div>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{stats.total}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Total</div>
        </div>
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
            <span className="addr">{(ownerAddr as string) ?? "..."}</span>
          </div>
          <div className="policy-stat">
            <span className="label">Metadata</span>
            <span className="addr" style={{ wordBreak: "break-all" }}>
              {(tokenURI as string) || "None"}
            </span>
          </div>
        </div>

        <div className="profile-section">
          <h4>Services</h4>
          <AgentServices agentId={agentId} onHire={onHire} />
        </div>

        <div className="profile-section">
          <h4>Reputation</h4>
          <AgentReputation agentId={agentId} />
        </div>
      </div>
    </div>
  );
}
