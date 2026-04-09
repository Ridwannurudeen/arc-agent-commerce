"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import CommerceHookABI from "@/abi/CommerceHook.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { capabilityName, PIPELINE_STATUS, STAGE_STATUS, JOB_STATUS } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import type { PipelineData, StageData } from "@/lib/types";
import { CheckCircle2, Circle, XCircle, Clock, CircleDollarSign, AlertCircle } from "lucide-react";

type Props = {
  pipelineId: number;
};

export function PipelineTracker({ pipelineId }: Props) {
  const { address } = useAccount();
  const { addToast } = useToast();

  // Approve stage tx
  const { writeContract: approveWrite, data: approveHash } = useWriteContract();
  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  // Reject stage tx
  const { writeContract: rejectWrite, data: rejectHash } = useWriteContract();
  const { isLoading: isRejecting, isSuccess: isRejectSuccess } = useWaitForTransactionReceipt({ hash: rejectHash });

  // Fund stage tx
  const { writeContract: fundWrite, data: fundHash } = useWriteContract();
  const { isLoading: isFunding, isSuccess: isFundSuccess } = useWaitForTransactionReceipt({ hash: fundHash });

  // Cancel pipeline tx
  const { writeContract: cancelWrite, data: cancelHash } = useWriteContract();
  const { isLoading: isCancelling, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash });

  const [rejectReason, setRejectReason] = useState("");

  // Fetch pipeline data
  const { data: pipelineRaw } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "pipelines",
    args: [BigInt(pipelineId)],
    chainId: arcTestnet.id,
  });

  // Fetch stages
  const { data: stagesRaw } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "getStages",
    args: [BigInt(pipelineId)],
    chainId: arcTestnet.id,
  });

  // Parse pipeline data — pipelines() returns 10 NAMED outputs, which viem
  // decodes as an object with named keys (NOT a positional array). Read by
  // name first, fall back to indexed access for older viem behavior.
  const pipelineAny = pipelineRaw as any;
  const pipeline: PipelineData | undefined = pipelineAny
    ? {
        clientAgentId: BigInt(pipelineAny.clientAgentId ?? pipelineAny[0] ?? 0),
        client: (pipelineAny.client ?? pipelineAny[1] ?? "") as string,
        currency: (pipelineAny.currency ?? pipelineAny[2] ?? "") as string,
        totalBudget: BigInt(pipelineAny.totalBudget ?? pipelineAny[3] ?? 0),
        totalSpent: BigInt(pipelineAny.totalSpent ?? pipelineAny[4] ?? 0),
        currentStage: BigInt(pipelineAny.currentStage ?? pipelineAny[5] ?? 0),
        stageCount: BigInt(pipelineAny.stageCount ?? pipelineAny[6] ?? 0),
        status: Number(pipelineAny.status ?? pipelineAny[7] ?? 0),
        createdAt: BigInt(pipelineAny.createdAt ?? pipelineAny[8] ?? 0),
        deadline: BigInt(pipelineAny.deadline ?? pipelineAny[9] ?? 0),
      }
    : undefined;

  // Normalize stages — viem returns each stage as a named object where
  // numeric fields (uint256/uint8) come back as bigint. Coerce to the
  // shapes the rest of the component expects.
  const stages: StageData[] = (stagesRaw as any[] | undefined)?.map((s: any) => ({
    providerAgentId: BigInt(s.providerAgentId ?? s[0] ?? 0),
    providerAddress: (s.providerAddress ?? s[1] ?? "") as string,
    capabilityHash: (s.capabilityHash ?? s[2] ?? "") as string,
    budget: BigInt(s.budget ?? s[3] ?? 0),
    jobId: BigInt(s.jobId ?? s[4] ?? 0),
    status: Number(s.status ?? s[5] ?? 0),
  })) ?? [];
  const isClient = pipeline && address && (pipeline.client || "").toLowerCase() === address.toLowerCase();
  const isActive = pipeline?.status === 0;
  const activeStageIndex = pipeline ? Number(pipeline.currentStage) : -1;
  const activeStage = stages[activeStageIndex];
  const activeJobId = activeStage?.jobId;

  // Fetch ACP job status for each stage with a jobId
  const jobIds = stages.map((s) => Number(s.jobId)).filter((id) => id > 0);
  const { data: jobsRaw } = useReadContracts({
    contracts: stages
      .filter((s) => Number(s.jobId) > 0)
      .map((s) => ({
        address: CONTRACTS.AGENTIC_COMMERCE as `0x${string}`,
        abi: AgenticCommerceABI as any,
        functionName: "getJob",
        args: [s.jobId],
        chainId: arcTestnet.id,
      })),
    query: { enabled: jobIds.length > 0 },
  });

  // Map jobId -> job status
  const jobStatusMap = new Map<number, { status: number; budget: bigint }>();
  if (jobsRaw) {
    const stagesWithJobs = stages.filter((s) => Number(s.jobId) > 0);
    stagesWithJobs.forEach((s, i) => {
      const r = jobsRaw[i];
      if (r?.status === "success" && r.result) {
        const job = r.result as any;
        jobStatusMap.set(Number(s.jobId), {
          status: Number(job.status ?? job[7] ?? 0),
          budget: BigInt(job.budget ?? job[5] ?? 0),
        });
      }
    });
  }

  // Toasts
  useEffect(() => {
    if (isApproveSuccess && approveHash) addToast("Stage approved", "success", approveHash);
  }, [isApproveSuccess, approveHash]);
  useEffect(() => {
    if (isRejectSuccess && rejectHash) addToast("Stage rejected", "success", rejectHash);
  }, [isRejectSuccess, rejectHash]);
  useEffect(() => {
    if (isFundSuccess && fundHash) addToast("Stage funded", "success", fundHash);
  }, [isFundSuccess, fundHash]);
  useEffect(() => {
    if (isCancelSuccess && cancelHash) addToast("Pipeline cancelled", "success", cancelHash);
  }, [isCancelSuccess, cancelHash]);

  const handleApprove = () => {
    if (!activeJobId) return;
    approveWrite(
      {
        address: CONTRACTS.COMMERCE_HOOK,
        abi: CommerceHookABI,
        functionName: "approveStage",
        args: [activeJobId],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleReject = () => {
    if (!activeJobId) return;
    rejectWrite(
      {
        address: CONTRACTS.COMMERCE_HOOK,
        abi: CommerceHookABI,
        functionName: "rejectStage",
        args: [activeJobId, rejectReason || "Rejected by client"],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleFundStage = () => {
    fundWrite(
      {
        address: CONTRACTS.PIPELINE_ORCHESTRATOR,
        abi: PipelineOrchestratorABI,
        functionName: "fundStage",
        args: [BigInt(pipelineId)],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleCancel = () => {
    cancelWrite(
      {
        address: CONTRACTS.PIPELINE_ORCHESTRATOR,
        abi: PipelineOrchestratorABI,
        functionName: "cancelPipeline",
        args: [BigInt(pipelineId)],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  if (!pipeline) {
    return <div className="empty" style={{ padding: "0.5rem" }}>Loading pipeline...</div>;
  }

  const statusLabel = PIPELINE_STATUS[pipeline.status] ?? "Unknown";

  // Determine what action is needed per stage
  function getStageAction(stage: StageData, stageIndex: number) {
    if (stage.status !== 1) return null;
    const jobId = Number(stage.jobId);
    const jobInfo = jobStatusMap.get(jobId);
    if (!jobInfo) return <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Loading job...</span>;

    const jobStatus = jobInfo.status;
    const jobBudget = jobInfo.budget;

    if (jobStatus === 0 && jobBudget === BigInt(0)) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
          <Clock size={14} /> Waiting for provider to set budget
        </div>
      );
    }
    if (jobStatus === 0 && jobBudget > BigInt(0)) {
      return (
        <button
          className="btn-primary"
          onClick={handleFundStage}
          disabled={isFunding}
          style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <CircleDollarSign size={14} />
          {isFunding ? "Funding..." : `Fund Stage (${formatUnits(jobBudget, 6)} USDC)`}
        </button>
      );
    }
    if (jobStatus === 1) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
          <Clock size={14} /> Waiting for provider to submit deliverable
        </div>
      );
    }
    if (jobStatus === 2) {
      return (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--yellow)", marginBottom: "0.5rem" }}>
            <AlertCircle size={14} /> Deliverable submitted -- review and approve or reject
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              className="btn-primary"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
              onClick={handleApprove}
              disabled={isApproving}
            >
              {isApproving ? "Approving..." : "Approve"}
            </button>
            <input
              className="glass-input"
              type="text"
              placeholder="Reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: "160px", padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}
            />
            <button
              className="btn-danger"
              onClick={handleReject}
              disabled={isRejecting}
            >
              {isRejecting ? "..." : "Reject"}
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* Budget summary */}
      <div className="budget-summary" style={{ marginBottom: "1rem" }}>
        <CircleDollarSign size={18} style={{ color: "var(--green)", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem" }}>
            Spent: <strong>{formatUnits(pipeline.totalSpent, 6)}</strong> / {formatUnits(pipeline.totalBudget, 6)} USDC
          </span>
          <span className={`pill ${statusLabel === "Active" ? "pill-blue" : statusLabel === "Completed" ? "pill-green" : statusLabel === "Cancelled" ? "pill-gray" : "pill-red"}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Visual timeline stepper */}
      <div className="pipeline-stepper">
        {stages.map((stage, i) => {
          const label = STAGE_STATUS[stage.status] ?? "Unknown";
          const jobInfo = jobStatusMap.get(Number(stage.jobId));
          const jobLabel = jobInfo ? JOB_STATUS[jobInfo.status] : "";
          const isCompleted = stage.status === 2;
          const isFailed = stage.status === 3;
          const isActiveStage = stage.status === 1;
          const isLast = i === stages.length - 1;

          return (
            <div key={i} className="pipeline-step">
              <div className="pipeline-step-line">
                <div className={`pipeline-step-circle ${isCompleted ? "completed" : isFailed ? "failed" : isActiveStage ? "active" : ""}`}>
                  {isCompleted ? <CheckCircle2 size={14} /> : isFailed ? <XCircle size={14} /> : i + 1}
                </div>
                {!isLast && (
                  <div className={`pipeline-step-connector ${isCompleted ? "completed" : ""}`} />
                )}
              </div>
              <div className="pipeline-step-content">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Stage {i + 1}</span>
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      {capabilityName(stage.capabilityHash)}
                    </span>
                  </div>
                  <span className={`pill ${isCompleted ? "pill-green" : isFailed ? "pill-red" : isActiveStage ? "pill-blue" : "pill-gray"}`}>
                    {label}{jobLabel ? ` / ${jobLabel}` : ""}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                  Budget: {formatUnits(stage.budget, 6)} USDC
                </div>

                {/* Active stage action for client */}
                {isClient && isActive && isActiveStage && i === activeStageIndex && (
                  <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(59, 130, 246, 0.05)", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.15)" }}>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
                      Job #{activeJobId?.toString()}
                    </div>
                    {getStageAction(stage, i)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel */}
      {isClient && isActive && (
        <button
          className="btn-danger"
          onClick={handleCancel}
          disabled={isCancelling}
          style={{ marginTop: "0.5rem" }}
        >
          {isCancelling ? "Cancelling..." : "Cancel Pipeline"}
        </button>
      )}
    </div>
  );
}
