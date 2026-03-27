"use client";

import { useState, useEffect, useMemo } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, keccak256, toHex, isAddress } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";
import SpendingPolicyABI from "@/abi/SpendingPolicy.json";
import USDCABI from "@/abi/USDC.json";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import type { Prefill } from "@/lib/types";

type Props = {
  prefill: Prefill | null;
};

export function CreateAgreement({ prefill }: Props) {
  const { addToast } = useToast();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { writeContract: approveWrite, data: approveHash } = useWriteContract();
  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const [provider, setProvider] = useState(prefill?.provider ?? "");
  const [providerAgentId, setProviderAgentId] = useState(prefill?.providerAgentId ?? "");
  const [clientAgentId, setClientAgentId] = useState("0");
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [taskDesc, setTaskDesc] = useState("");

  useEffect(() => {
    if (prefill) {
      setProvider(prefill.provider);
      setProviderAgentId(prefill.providerAgentId);
      setAmount(prefill.amount);
    }
  }, [prefill]);

  // Policy check: get the agent's owner address to check wouldPass
  const agentIdNum = Number(clientAgentId) || 0;

  const { data: agentOwner } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "ownerOf",
    args: agentIdNum > 0 ? [BigInt(agentIdNum)] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: agentIdNum > 0 },
  });

  const parsedAmount = amount ? parseUnits(amount, 6) : BigInt(0);
  const hasAmount = parsedAmount > BigInt(0);

  const { data: wouldPassResult } = useReadContract({
    address: CONTRACTS.SPENDING_POLICY,
    abi: SpendingPolicyABI,
    functionName: "wouldPass",
    args:
      agentOwner && hasAmount && provider
        ? [agentOwner as `0x${string}`, parsedAmount, provider as `0x${string}`]
        : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!agentOwner && hasAmount && !!provider },
  });

  const showPolicyCheck = agentIdNum > 0 && !!agentOwner && hasAmount && !!provider;
  const policyFailed = showPolicyCheck && wouldPassResult === false;

  // Validation
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    // Provider address
    if (provider && !isAddress(provider)) {
      errors.provider = "Invalid Ethereum address";
    }

    // Amount
    if (amount) {
      const num = Number(amount);
      if (isNaN(num) || num <= 0) {
        errors.amount = "Amount must be greater than zero";
      } else {
        const parts = amount.split(".");
        if (parts[1] && parts[1].length > 6) {
          errors.amount = "USDC supports max 6 decimal places";
        }
      }
    }

    // Deadline
    const hrs = Number(deadlineHours);
    if (deadlineHours) {
      if (isNaN(hrs) || hrs <= 0) {
        errors.deadline = "Deadline must be greater than zero";
      } else if (hrs < 1) {
        errors.deadline = "Deadline must be at least 1 hour in the future";
      } else if (hrs < 24) {
        errors.deadlineWarn = "Short deadline — consider at least 24 hours";
      }
    }

    // Policy check
    if (policyFailed) {
      errors.policy = "Spending policy limit would be exceeded";
    }

    return errors;
  }, [provider, amount, deadlineHours, policyFailed]);

  const hasValidationErrors = Object.keys(validation).some(
    (k) => k !== "deadlineWarn"
  );
  const formComplete = !!provider && !!providerAgentId && !!amount && !!deadlineHours && !!taskDesc;
  const canSubmit = formComplete && !hasValidationErrors;

  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      addToast("USDC approval confirmed", "success", approveHash);
    }
  }, [isApproveSuccess, approveHash, addToast]);

  useEffect(() => {
    if (isSuccess && hash) {
      addToast("Agreement created successfully", "success", hash);
    }
  }, [isSuccess, hash, addToast]);

  const handleApprove = () => {
    approveWrite(
      {
        address: CONTRACTS.USDC,
        abi: USDCABI,
        functionName: "approve",
        args: [CONTRACTS.SERVICE_ESCROW, parseUnits(amount || "0", 6)],
        chainId: arcTestnet.id,
      },
      {
        onError: (err) => addToast(parseContractError(err), "error"),
      }
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600
    );
    writeContract(
      {
        address: CONTRACTS.SERVICE_ESCROW,
        abi: ServiceEscrowABI,
        functionName: "createAgreement",
        args: [
          provider as `0x${string}`,
          BigInt(providerAgentId),
          BigInt(clientAgentId),
          parseUnits(amount, 6),
          deadline,
          keccak256(toHex(taskDesc)),
          BigInt(0),
        ],
        chainId: arcTestnet.id,
      },
      {
        onError: (err) => addToast(parseContractError(err), "error"),
      }
    );
  };

  return (
    <div className="card">
      <h3>Create Service Agreement</h3>
      <form onSubmit={handleCreate}>
        <div className="form-group">
          <label>Provider Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
          />
          {validation.provider && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.provider}</span>
          )}
        </div>
        <div className="form-group">
          <label>Provider Agent ID (ERC-8004)</label>
          <input
            type="number"
            placeholder="e.g., 2"
            value={providerAgentId}
            onChange={(e) => setProviderAgentId(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Client Agent ID (0 = human, no policy check)</label>
          <input
            type="number"
            placeholder="0"
            value={clientAgentId}
            onChange={(e) => setClientAgentId(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Amount (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {validation.amount && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.amount}</span>
          )}
        </div>
        <div className="form-group">
          <label>Deadline (hours from now)</label>
          <input
            type="number"
            placeholder="24"
            value={deadlineHours}
            onChange={(e) => setDeadlineHours(e.target.value)}
            required
          />
          {validation.deadline && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.deadline}</span>
          )}
          {validation.deadlineWarn && !validation.deadline && (
            <span style={{ color: "var(--yellow)", fontSize: "0.75rem" }}>{validation.deadlineWarn}</span>
          )}
        </div>
        <div className="form-group">
          <label>Task Description</label>
          <input
            type="text"
            placeholder="Audit my contract at 0x1234..."
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            required
          />
        </div>

        {showPolicyCheck && (
          <div className={wouldPassResult ? "success-banner" : "warning-banner"}>
            {wouldPassResult
              ? "Policy check: PASS — this transaction meets the agent's spending limits."
              : "Policy check: FAIL — this transaction would exceed the agent's spending policy limits."}
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleApprove}
            disabled={isApproving || !amount || !!validation.amount}
          >
            {isApproving ? "Approving..." : "1. Approve USDC"}
          </button>
          <button className="btn" type="submit" disabled={isLoading || !canSubmit}>
            {isLoading ? "Creating..." : "2. Create Agreement"}
          </button>
        </div>
        {isSuccess && (
          <div style={{ marginTop: "0.75rem", color: "var(--green)" }}>
            Agreement created! Check My Agreements tab.
          </div>
        )}
      </form>
    </div>
  );
}
