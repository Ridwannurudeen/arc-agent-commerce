"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, keccak256, toHex, isAddress } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import USDCABI from "@/abi/USDC.json";
import { CAPABILITY_NAMES } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";

type StageInput = {
  providerAddress: string;
  providerAgentId: string;
  capability: string;
  budget: string;
};

const emptyStage = (): StageInput => ({
  providerAddress: "",
  providerAgentId: "",
  capability: CAPABILITY_NAMES[0]?.[0] ?? "",
  budget: "",
});

export function PipelineBuilder() {
  const { addToast } = useToast();
  const { address } = useAccount();

  const [stages, setStages] = useState<StageInput[]>([emptyStage()]);
  const [clientAgentId, setClientAgentId] = useState("0");
  const [currency, setCurrency] = useState<"usdc" | "eurc">("usdc");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [step, setStep] = useState<1 | 2>(1);

  const currencyAddress = currency === "usdc" ? CONTRACTS.USDC : CONTRACTS.EURC;
  const currencyLabel = currency === "usdc" ? "USDC" : "EURC";

  // Approve tx
  const { writeContract: approveWrite, data: approveHash } = useWriteContract();
  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  // Create pipeline tx
  const { writeContract, data: createHash } = useWriteContract();
  const { isLoading: isCreating, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({ hash: createHash });

  // Calculate total budget
  const totalBudget = useMemo(() => {
    return stages.reduce((sum, s) => {
      const val = Number(s.budget);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [stages]);

  const totalBudgetParsed = totalBudget > 0 ? parseUnits(totalBudget.toString(), 6) : BigInt(0);

  // Check allowance
  const { data: allowance } = useReadContract({
    address: currencyAddress,
    abi: USDCABI,
    functionName: "allowance",
    args: address && CONTRACTS.PIPELINE_ORCHESTRATOR
      ? [address, CONTRACTS.PIPELINE_ORCHESTRATOR]
      : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.PIPELINE_ORCHESTRATOR },
  });

  // Auto-advance to step 2 when approval succeeds
  useEffect(() => {
    if (isApproveSuccess) setStep(2);
  }, [isApproveSuccess]);

  // Skip step 1 if allowance already sufficient
  useEffect(() => {
    if (allowance !== undefined && totalBudgetParsed > BigInt(0) && (allowance as bigint) >= totalBudgetParsed) {
      setStep(2);
    }
  }, [allowance, totalBudgetParsed]);

  // Toast on approve success
  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      addToast(`${currencyLabel} approval confirmed`, "success", approveHash);
    }
  }, [isApproveSuccess, approveHash, addToast, currencyLabel]);

  // Toast on create success
  useEffect(() => {
    if (isCreateSuccess && createHash) {
      addToast("Pipeline created successfully", "success", createHash);
    }
  }, [isCreateSuccess, createHash, addToast]);

  // Validation
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    stages.forEach((s, i) => {
      if (s.providerAddress && !isAddress(s.providerAddress)) {
        errors[`stage-${i}-addr`] = `Stage ${i + 1}: Invalid address`;
      }
      if (s.budget) {
        const num = Number(s.budget);
        if (isNaN(num) || num <= 0) {
          errors[`stage-${i}-budget`] = `Stage ${i + 1}: Budget must be > 0`;
        }
      }
    });

    const hrs = Number(deadlineHours);
    if (deadlineHours && (isNaN(hrs) || hrs < 1)) {
      errors.deadline = "Deadline must be at least 1 hour";
    }

    if (!CONTRACTS.PIPELINE_ORCHESTRATOR) {
      errors.contract = "Pipeline Orchestrator address not configured";
    }

    return errors;
  }, [stages, deadlineHours]);

  const hasErrors = Object.keys(validation).length > 0;
  const formComplete = stages.every(
    (s) => s.providerAddress && s.providerAgentId && s.capability && s.budget
  ) && !!deadlineHours && totalBudget > 0;
  const canSubmit = formComplete && !hasErrors;

  const updateStage = (index: number, field: keyof StageInput, value: string) => {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeStage = (index: number) => {
    if (stages.length <= 1) return;
    setStages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApprove = () => {
    approveWrite(
      {
        address: currencyAddress,
        abi: USDCABI,
        functionName: "approve",
        args: [CONTRACTS.PIPELINE_ORCHESTRATOR, totalBudgetParsed],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    const stageParams = stages.map((s) => ({
      providerAgentId: BigInt(s.providerAgentId),
      providerAddress: s.providerAddress as `0x${string}`,
      capabilityHash: keccak256(toHex(s.capability)),
      budget: parseUnits(s.budget, 6),
    }));

    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600
    );

    writeContract(
      {
        address: CONTRACTS.PIPELINE_ORCHESTRATOR,
        abi: PipelineOrchestratorABI,
        functionName: "createPipeline",
        args: [BigInt(clientAgentId), stageParams, currencyAddress, deadline],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  if (!address) {
    return <div className="empty">Connect wallet to create a pipeline.</div>;
  }

  return (
    <div className="card">
      <h3>Create Pipeline</h3>
      <form onSubmit={handleCreate}>
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
          <label>Currency</label>
          <select
            className="search-bar"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "usdc" | "eurc")}
          >
            <option value="usdc">USDC</option>
            <option value="eurc">EURC</option>
          </select>
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
        </div>

        <h4 style={{ margin: "1.5rem 0 0.75rem", color: "var(--text-dim)" }}>Stages</h4>

        {stages.map((stage, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              padding: "1rem",
              marginBottom: "1rem",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Stage {i + 1}</strong>
              {stages.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                  onClick={() => removeStage(i)}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="form-group">
              <label>Provider Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={stage.providerAddress}
                onChange={(e) => updateStage(i, "providerAddress", e.target.value)}
                required
              />
              {validation[`stage-${i}-addr`] && (
                <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation[`stage-${i}-addr`]}</span>
              )}
            </div>
            <div className="form-group">
              <label>Provider Agent ID</label>
              <input
                type="number"
                placeholder="e.g., 2"
                value={stage.providerAgentId}
                onChange={(e) => updateStage(i, "providerAgentId", e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Capability</label>
              <select
                className="search-bar"
                value={stage.capability}
                onChange={(e) => updateStage(i, "capability", e.target.value)}
              >
                {CAPABILITY_NAMES.map(([raw, display]) => (
                  <option key={raw} value={raw}>{display}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Budget ({currencyLabel})</label>
              <input
                type="text"
                placeholder="e.g., 50"
                value={stage.budget}
                onChange={(e) => updateStage(i, "budget", e.target.value)}
                required
              />
              {validation[`stage-${i}-budget`] && (
                <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation[`stage-${i}-budget`]}</span>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          className="btn btn-outline"
          style={{ marginBottom: "1.5rem" }}
          onClick={() => setStages((prev) => [...prev, emptyStage()])}
        >
          + Add Stage
        </button>

        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--surface)", borderRadius: "0.5rem" }}>
          <strong>Total Budget: </strong>
          <span>{totalBudget.toFixed(2)} {currencyLabel}</span>
          <span style={{ color: "var(--text-dim)", marginLeft: "0.5rem" }}>
            ({stages.length} stage{stages.length !== 1 ? "s" : ""})
          </span>
        </div>

        {validation.contract && (
          <div className="warning-banner">{validation.contract}</div>
        )}

        <div className="actions">
          <div className="step-indicator" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
            <span style={{ opacity: step >= 1 ? 1 : 0.4 }}>1. Approve</span>
            <span>&rarr;</span>
            <span style={{ opacity: step >= 2 ? 1 : 0.4 }}>2. Create</span>
          </div>
          {step === 1 ? (
            <button
              type="button"
              className="btn"
              onClick={handleApprove}
              disabled={isApproving || totalBudget <= 0 || !!validation.contract}
            >
              {isApproving ? "Approving..." : `Approve ${currencyLabel}`}
            </button>
          ) : (
            <button className="btn" type="submit" disabled={isCreating || !canSubmit}>
              {isCreating ? "Creating..." : "Create Pipeline"}
            </button>
          )}
        </div>

        {isCreateSuccess && (
          <div style={{ marginTop: "0.75rem", color: "var(--green)" }}>
            Pipeline created! Check My Pipelines tab.
          </div>
        )}
      </form>
    </div>
  );
}
