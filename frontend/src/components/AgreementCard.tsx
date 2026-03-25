"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import { STATUS_LABELS } from "@/lib/constants";
import { useIsOwner } from "@/hooks/useIsOwner";
import type { AgreementData } from "@/lib/types";

type Props = {
  agreementId: number;
  onViewAgent?: (agentId: number) => void;
};

function Countdown({ deadline }: { deadline: bigint }) {
  const [remaining, setRemaining] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(deadline) - now;
      if (diff <= 0) {
        setRemaining("EXPIRED");
        setUrgent(true);
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setRemaining(`${h}h ${m}m remaining`);
      setUrgent(diff < 3600);
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [deadline]);

  return <span className={`countdown${urgent ? " urgent" : ""}`}>{remaining}</span>;
}

export function AgreementCard({ agreementId, onViewAgent }: Props) {
  const { address } = useAccount();
  const isOwner = useIsOwner();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });
  const [clientPct, setClientPct] = useState(50);

  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const agr = data as unknown as AgreementData;

  const statusLabel = STATUS_LABELS[agr.status] ?? "unknown";
  const isClient = address?.toLowerCase() === agr.client.toLowerCase();
  const isActive = agr.status === 0;
  const isDisputed = agr.status === 2;
  const now = Math.floor(Date.now() / 1000);
  const isPastDeadline = now > Number(agr.deadline);

  return (
    <div className="agreement-item">
      <div className="row">
        <span className="label">Agreement #{agreementId}</span>
        <span className={`status ${statusLabel}`}>{statusLabel.toUpperCase()}</span>
      </div>
      <div className="row">
        <span className="label">Amount</span>
        <span>{formatUnits(agr.amount, 6)} USDC</span>
      </div>
      <div className="row">
        <span className="label">Provider</span>
        <span className="addr">
          {agr.provider.slice(0, 6)}...{agr.provider.slice(-4)}
        </span>
      </div>
      <div className="row">
        <span className="label">Client Agent</span>
        <span
          className="agent-link"
          onClick={() => onViewAgent?.(Number(agr.clientAgentId))}
        >
          #{agr.clientAgentId.toString()}
        </span>
      </div>
      <div className="row">
        <span className="label">Provider Agent</span>
        <span
          className="agent-link"
          onClick={() => onViewAgent?.(Number(agr.providerAgentId))}
        >
          #{agr.providerAgentId.toString()}
        </span>
      </div>
      <div className="row">
        <span className="label">Deadline</span>
        <span>
          {new Date(Number(agr.deadline) * 1000).toLocaleString()}
          {isActive && <>{" "}<Countdown deadline={agr.deadline} /></>}
        </span>
      </div>

      {isActive && isClient && (
        <div className="actions">
          <button
            className="btn btn-sm"
            disabled={isLoading}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "confirmCompletion",
                args: [BigInt(agreementId)],
                chainId: arcTestnet.id,
              })
            }
          >
            {isLoading ? "Confirming..." : "Confirm Complete"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoading}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "dispute",
                args: [BigInt(agreementId)],
                chainId: arcTestnet.id,
              })
            }
          >
            Dispute
          </button>
        </div>
      )}

      {isActive && isPastDeadline && isClient && (
        <div className="actions">
          <button
            className="btn btn-sm"
            style={{ background: "var(--red)" }}
            disabled={isLoading}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "claimExpired",
                args: [BigInt(agreementId)],
                chainId: arcTestnet.id,
              })
            }
          >
            {isLoading ? "Claiming..." : "Claim Expired Refund"}
          </button>
        </div>
      )}

      {isDisputed && isOwner && (
        <div className="dispute-resolve">
          <div className="row">
            <span className="label">Resolve Dispute</span>
            <span>Client gets {clientPct}% &middot; Provider gets {100 - clientPct}%</span>
          </div>
          <div className="flex-row" style={{ marginTop: "0.5rem" }}>
            <input
              type="range"
              className="range-slider"
              min={0}
              max={100}
              value={clientPct}
              onChange={(e) => setClientPct(Number(e.target.value))}
            />
            <span className="range-value">{clientPct}%</span>
            <button
              className="btn btn-sm"
              disabled={isLoading}
              onClick={() =>
                writeContract({
                  address: CONTRACTS.SERVICE_ESCROW,
                  abi: ServiceEscrowABI,
                  functionName: "resolveDispute",
                  args: [BigInt(agreementId), BigInt(clientPct)],
                  chainId: arcTestnet.id,
                })
              }
            >
              {isLoading ? "Resolving..." : "Resolve"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
