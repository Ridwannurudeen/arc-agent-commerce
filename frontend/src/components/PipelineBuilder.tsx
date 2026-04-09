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
import { useOwnedAgents } from "@/hooks/useOwnedAgents";
import type { Tab } from "@/lib/types";
import { motion } from "framer-motion";
import { Layers, Plus, Trash2, ArrowRight, CheckCircle2, Wallet, CircleDollarSign, Clock, UserPlus } from "lucide-react";

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

type TemplateStagePrefill = {
  capability: string;
  label: string;
  budgetRange: [number, number];
  description: string;
};

type Props = {
  prefill?: { agentId: number; provider: string; capability: string; price: bigint } | null;
  onClearPrefill?: () => void;
  templatePrefill?: TemplateStagePrefill[] | null;
  onClearTemplatePrefill?: () => void;
  onNavigate?: (tab: Tab) => void;
};

export function PipelineBuilder({ prefill, onClearPrefill, templatePrefill, onClearTemplatePrefill, onNavigate }: Props = {}) {
  const { addToast } = useToast();
  const { address } = useAccount();
  const { agentIds: ownedAgents, isLoading: loadingAgents } = useOwnedAgents(address);

  const [stages, setStages] = useState<StageInput[]>([emptyStage()]);

  // Apply prefill from marketplace hire
  useEffect(() => {
    if (prefill) {
      const matchedCap = CAPABILITY_NAMES.find(
        ([raw]) => keccak256(toHex(raw)) === prefill.capability.toLowerCase()
      );
      const prefilled: StageInput = {
        providerAddress: prefill.provider,
        providerAgentId: String(prefill.agentId),
        capability: matchedCap?.[0] ?? CAPABILITY_NAMES[0][0],
        budget: formatUnits(prefill.price, 6),
      };
      setStages((prev) => {
        if (prev.length === 1 && !prev[0].providerAddress) return [prefilled];
        return [...prev, prefilled];
      });
      onClearPrefill?.();
    }
  }, [prefill]);

  // Apply template prefill
  useEffect(() => {
    if (templatePrefill && templatePrefill.length > 0) {
      const templateStages: StageInput[] = templatePrefill.map((ts) => ({
        providerAddress: "",
        providerAgentId: "",
        capability: ts.capability,
        budget: String(Math.round((ts.budgetRange[0] + ts.budgetRange[1]) / 2)),
      }));
      setStages(templateStages);
      onClearTemplatePrefill?.();
    }
  }, [templatePrefill]);

  const [clientAgentId, setClientAgentId] = useState("");
  const [currency, setCurrency] = useState<"usdc" | "eurc">("usdc");

  // Auto-select the first owned agent once the list loads (or when
  // the connected wallet changes and we have no selection yet).
  useEffect(() => {
    if (ownedAgents.length === 0) {
      if (clientAgentId !== "") setClientAgentId("");
      return;
    }
    if (!clientAgentId || !ownedAgents.includes(Number(clientAgentId))) {
      setClientAgentId(String(ownedAgents[0]));
    }
  }, [ownedAgents]);
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

  // Check allowance — polls every 3s so the UI auto-advances to step 2
  // as soon as the approve tx lands on-chain, even if useWaitForTransactionReceipt hangs.
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: currencyAddress,
    abi: USDCABI,
    functionName: "allowance",
    args: address && CONTRACTS.PIPELINE_ORCHESTRATOR
      ? [address, CONTRACTS.PIPELINE_ORCHESTRATOR]
      : undefined,
    chainId: arcTestnet.id,
    query: {
      enabled: !!address && !!CONTRACTS.PIPELINE_ORCHESTRATOR,
      refetchInterval: 3000,
    },
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

  // Toast on approve success + force refetch allowance so step 2 unlocks immediately
  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      addToast(`${currencyLabel} approval confirmed`, "success", approveHash);
      refetchAllowance();
    }
  }, [isApproveSuccess, approveHash, addToast, currencyLabel, refetchAllowance]);

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
  const hasOwnedAgent = ownedAgents.length > 0 && !!clientAgentId && ownedAgents.includes(Number(clientAgentId));
  const formComplete = stages.every(
    (s) => s.providerAddress && s.providerAgentId && s.capability && s.budget
  ) && !!deadlineHours && totalBudget > 0 && hasOwnedAgent;
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
    return (
      <div className="empty-state">
        <Wallet size={40} className="empty-icon" />
        <p>Connect wallet to create a pipeline.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2>Create Pipeline</h2>
        <p className="section-subtitle">Build a multi-stage workflow with on-chain escrow</p>
      </div>

      {/* Step Indicator */}
      <div className="step-bar">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className={`step-node ${step >= 1 ? (step > 1 ? "completed" : "active") : ""}`}>
            {step > 1 ? <CheckCircle2 size={16} /> : "1"}
          </div>
          <span className={`step-label ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>Configure</span>
        </div>
        <div className={`step-connector ${step > 1 ? "completed" : ""}`} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className={`step-node ${step >= 2 ? "active" : ""}`}>
            {isCreateSuccess ? <CheckCircle2 size={16} /> : "2"}
          </div>
          <span className={`step-label ${step >= 2 ? "active" : ""}`}>Approve & Create</span>
        </div>
      </div>

      {/* No-agent empty state — blocks the form entirely */}
      {!loadingAgents && ownedAgents.length === 0 && (
        <div className="warning-banner" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <UserPlus size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: "200px" }}>
            <strong>You don't own any agents yet.</strong>{" "}
            Pipelines are created on behalf of an agent identity (ERC-8004). Register one first, then come back here.
          </div>
          {onNavigate && (
            <button
              type="button"
              className="btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              onClick={() => onNavigate("register-agent")}
            >
              <UserPlus size={14} /> Register Agent
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleCreate}>
        <div className="glass-card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Layers size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Pipeline Settings</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label>
                Client Agent ID
                {ownedAgents.length > 0 && (
                  <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 400 }}>
                    ({ownedAgents.length} owned)
                  </span>
                )}
              </label>
              {loadingAgents ? (
                <input className="glass-input" disabled placeholder="Loading your agents..." />
              ) : ownedAgents.length > 0 ? (
                <select
                  className="glass-select"
                  value={clientAgentId}
                  onChange={(e) => setClientAgentId(e.target.value)}
                >
                  {ownedAgents.map((id) => (
                    <option key={id} value={id}>#{id}</option>
                  ))}
                </select>
              ) : (
                <input className="glass-input" disabled placeholder="No agents owned" />
              )}
            </div>

            <div className="form-group">
              <label>Currency</label>
              <select
                className="glass-select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "usdc" | "eurc")}
              >
                <option value="usdc">USDC</option>
                <option value="eurc">EURC</option>
              </select>
            </div>

            <div className="form-group">
              <label>Deadline (hours)</label>
              <input
                className="glass-input"
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
          </div>
        </div>

        {/* Stages */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1.5rem 0 1rem" }}>
          <Layers size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Pipeline Stages</span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>({stages.length})</span>
        </div>

        {stages.map((stage, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="stage-card"
          >
            <div className="stage-card-header">
              <div style={{ display: "flex", alignItems: "center" }}>
                <span className="stage-number">{i + 1}</span>
                <strong style={{ fontSize: "0.85rem" }}>Stage {i + 1}</strong>
              </div>
              {stages.length > 1 && (
                <button
                  type="button"
                  className="btn-danger"
                  style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  onClick={() => removeStage(i)}
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="form-group">
                <label>Provider Address</label>
                <input
                  className="glass-input"
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
                  className="glass-input"
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
                  className="glass-select"
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
                  className="glass-input"
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
          </motion.div>
        ))}

        <button
          type="button"
          className="btn btn-outline"
          style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          onClick={() => setStages((prev) => [...prev, emptyStage()])}
        >
          <Plus size={14} /> Add Stage
        </button>

        {/* Budget Summary */}
        <div className="budget-summary">
          <CircleDollarSign size={20} style={{ color: "var(--green)", flexShrink: 0 }} />
          <div>
            <div className="budget-amount" style={{ color: "var(--green)" }}>
              {totalBudget.toFixed(2)} {currencyLabel}
            </div>
            <div className="budget-meta">
              Total budget across {stages.length} stage{stages.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {validation.contract && (
          <div className="warning-banner">{validation.contract}</div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {step === 1 ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleApprove}
              disabled={isApproving || totalBudget <= 0 || !!validation.contract}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              {isApproving ? "Approving..." : <><Wallet size={14} /> Approve {currencyLabel}</>}
            </button>
          ) : (
            <button
              className="btn-primary"
              type="submit"
              disabled={isCreating || !canSubmit}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              {isCreating ? "Creating..." : <><ArrowRight size={14} /> Create Pipeline</>}
            </button>
          )}
        </div>

        {isCreateSuccess && (
          <div className="success-banner" style={{ marginTop: "1rem" }}>
            Pipeline created! Check My Pipelines tab.
          </div>
        )}
      </form>
    </div>
  );
}
