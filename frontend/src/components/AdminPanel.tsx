"use client";

import { useState, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import { STATUS_LABELS } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import type { AgreementData } from "@/lib/types";

function DisputeQueueItem({ agreementId }: { agreementId: number }) {
  const { addToast } = useToast();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [clientPct, setClientPct] = useState(50);

  useEffect(() => {
    if (isSuccess && hash) {
      addToast(`Dispute #${agreementId} resolved`, "success", hash);
    }
  }, [isSuccess, hash, addToast, agreementId]);

  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const agr = data as unknown as AgreementData;
  if (agr.status !== 2) return null; // Only disputed

  return (
    <div className="dispute-queue-item">
      <div className="row">
        <span className="label">Agreement #{agreementId}</span>
        <span>{formatUnits(agr.amount, 6)} USDC</span>
      </div>
      <div className="row">
        <span className="label">Client</span>
        <span className="addr">{agr.client.slice(0, 6)}...{agr.client.slice(-4)}</span>
      </div>
      <div className="row">
        <span className="label">Provider</span>
        <span className="addr">{agr.provider.slice(0, 6)}...{agr.provider.slice(-4)}</span>
      </div>
      <div className="flex-row" style={{ marginTop: "0.5rem" }}>
        <span style={{ fontSize: "0.8rem", minWidth: "120px" }}>
          Client: {clientPct}% &middot; Provider: {100 - clientPct}%
        </span>
        <input
          type="range"
          className="range-slider"
          min={0}
          max={100}
          value={clientPct}
          onChange={(e) => setClientPct(Number(e.target.value))}
        />
        <button
          className="btn btn-sm"
          disabled={isLoading}
          onClick={() =>
            writeContract(
              {
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "resolveDispute",
                args: [BigInt(agreementId), BigInt(clientPct)],
                chainId: arcTestnet.id,
              },
              { onError: (err) => addToast(parseContractError(err), "error") }
            )
          }
        >
          {isLoading ? "Resolving..." : "Resolve"}
        </button>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const { addToast } = useToast();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess && hash) {
      addToast("Admin action confirmed", "success", hash);
    }
  }, [isSuccess, hash, addToast]);

  const [newFee, setNewFee] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState("");

  const { data: owner } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "owner",
    chainId: arcTestnet.id,
  });

  const { data: totalFees } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "totalFeesCollected",
    chainId: arcTestnet.id,
  });

  const { data: feeBps } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "feeBps",
    chainId: arcTestnet.id,
  });

  const { data: feeRecipient } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "feeRecipient",
    chainId: arcTestnet.id,
  });

  const { data: nextAgreementId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const agreementCount = Number(nextAgreementId ?? 0);
  const feeBpsNum = Number(feeBps ?? 0);

  return (
    <div>
      {/* Protocol Stats */}
      <div className="card">
        <h3>Protocol Administration</h3>
        <div className="admin-section">
          <div className="policy-stat">
            <span className="label">Owner</span>
            <span className="addr">{(owner as string) ?? "—"}</span>
          </div>
          <div className="policy-stat">
            <span className="label">Total Fees Collected</span>
            <span>{totalFees ? formatUnits(totalFees as bigint, 6) : "—"} USDC</span>
          </div>
          <div className="policy-stat">
            <span className="label">Fee</span>
            <span>{feeBpsNum} bps ({(feeBpsNum / 100).toFixed(2)}%)</span>
          </div>
          <div className="policy-stat">
            <span className="label">Fee Recipient</span>
            <span className="addr">{(feeRecipient as string) ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Set Fee */}
      <div className="card">
        <h3>Set Fee (max 100 bps)</h3>
        <div className="form-group">
          <label>New Fee (bps)</label>
          <input
            type="number"
            placeholder="e.g., 10"
            min={0}
            max={100}
            value={newFee}
            onChange={(e) => setNewFee(e.target.value)}
          />
        </div>
        <button
          className="btn btn-sm"
          disabled={isLoading || !newFee}
          onClick={() =>
            writeContract(
              {
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "setFee",
                args: [BigInt(newFee)],
                chainId: arcTestnet.id,
              },
              { onError: (err) => addToast(parseContractError(err), "error") }
            )
          }
        >
          {isLoading ? "Setting..." : "Set Fee"}
        </button>
      </div>

      {/* Set Fee Recipient */}
      <div className="card">
        <h3>Set Fee Recipient</h3>
        <div className="form-group">
          <label>Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={newRecipient}
            onChange={(e) => setNewRecipient(e.target.value)}
          />
        </div>
        <button
          className="btn btn-sm"
          disabled={isLoading || !newRecipient}
          onClick={() =>
            writeContract(
              {
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "setFeeRecipient",
                args: [newRecipient as `0x${string}`],
                chainId: arcTestnet.id,
              },
              { onError: (err) => addToast(parseContractError(err), "error") }
            )
          }
        >
          {isLoading ? "Setting..." : "Set Recipient"}
        </button>
      </div>

      {/* Transfer Ownership */}
      <div className="card">
        <h3>Transfer Ownership</h3>
        <div className="admin-warning">
          This action is irreversible. You will lose admin access.
        </div>
        <div className="form-group">
          <label>New Owner Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Type TRANSFER to confirm</label>
          <input
            type="text"
            placeholder="TRANSFER"
            value={confirmTransfer}
            onChange={(e) => setConfirmTransfer(e.target.value)}
          />
        </div>
        <button
          className="btn btn-sm"
          style={{ background: "var(--red)" }}
          disabled={isLoading || !newOwner || confirmTransfer !== "TRANSFER"}
          onClick={() =>
            writeContract(
              {
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "transferOwnership",
                args: [newOwner as `0x${string}`],
                chainId: arcTestnet.id,
              },
              { onError: (err) => addToast(parseContractError(err), "error") }
            )
          }
        >
          {isLoading ? "Transferring..." : "Transfer Ownership"}
        </button>
      </div>

      {/* Dispute Queue */}
      <div className="card">
        <h3>Dispute Queue</h3>
        {agreementCount === 0 ? (
          <div className="empty" style={{ padding: "1rem" }}>No agreements yet.</div>
        ) : (
          Array.from({ length: agreementCount }, (_, i) => (
            <DisputeQueueItem key={i} agreementId={i} />
          ))
        )}
      </div>
    </div>
  );
}
