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

  // Parse pipeline data
  const pipelineArr = pipelineRaw as unknown[] | undefined;
  const pipeline: PipelineData | undefined = pipelineArr
    ? {
        clientAgentId: pipelineArr[0] as bigint,
        client: pipelineArr[1] as string,
        currency: pipelineArr[2] as string,
        totalBudget: pipelineArr[3] as bigint,
        totalSpent: pipelineArr[4] as bigint,
        currentStage: pipelineArr[5] as bigint,
        stageCount: pipelineArr[6] as bigint,
        status: Number(pipelineArr[7]),
        createdAt: pipelineArr[8] as bigint,
        deadline: pipelineArr[9] as bigint,
      }
    : undefined;

  const stages = (stagesRaw as StageData[] | undefined) ?? [];
  const isClient = pipeline && address && pipeline.client.toLowerCase() === address.toLowerCase();
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
          status: Number(job.status ?? job[7]),
          budget: BigInt(job.budget ?? job[5]),
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
    if (stage.status !== 1) return null; // Only active stages have actions
    const jobId = Number(stage.jobId);
    const jobInfo = jobStatusMap.get(jobId);
    if (!jobInfo) return <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Loading job...</span>;

    const jobStatus = jobInfo.status;
    const jobBudget = jobInfo.budget;

    // Open + no budget
    if (jobStatus === 0 && jobBudget === BigInt(0)) {
      return <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Waiting for provider to set budget</span>;
    }
    // Open + budget set → fund
    if (jobStatus === 0 && jobBudget > BigInt(0)) {
      return (
        <button className="btn-sm" onClick={handleFundStage} disabled={isFunding} style={{ background: "var(--accent)", color: "#fff" }}>
          {isFunding ? "Funding..." : `Fund Stage (${formatUnits(jobBudget, 6)} USDC)`}
        </button>
      );
    }
    // Funded
    if (jobStatus === 1) {
      return <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Waiting for provider to submit deliverable</span>;
    }
    // Submitted → approve/reject
    if (jobStatus === 2) {
      return (
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--yellow)", marginBottom: "0.35rem" }}>
            Deliverable submitted — review and approve or reject
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button className="btn-sm" onClick={handleApprove} disabled={isApproving}>
              {isApproving ? "Approving..." : "Approve"}
            </button>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ padding: "0.3rem 0.5rem", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text)", fontSize: "0.8rem", width: "150px" }}
            />
            <button
              className="btn-sm"
              style={{ background: "var(--red)", color: "#fff" }}
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
    <div style={{ marginTop: "0.75rem" }}>
      {/* Stage progress */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
        {stages.map((stage, i) => {
          const label = STAGE_STATUS[stage.status] ?? "Unknown";
          const jobInfo = jobStatusMap.get(Number(stage.jobId));
          const jobLabel = jobInfo ? JOB_STATUS[jobInfo.status] : "";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "0.5rem 0.25rem",
                borderRadius: "0.25rem",
                fontSize: "0.7rem",
                background:
                  stage.status === 2 ? "rgba(34, 197, 94, 0.2)" :
                  stage.status === 3 ? "rgba(239, 68, 68, 0.2)" :
                  stage.status === 1 ? "rgba(59, 130, 246, 0.15)" :
                  "rgba(255,255,255,0.03)",
                border: stage.status === 1 ? "1px solid var(--accent)" : "1px solid transparent",
              }}
            >
              <div style={{ fontWeight: 600 }}>Stage {i + 1}</div>
              <div>{capabilityName(stage.capabilityHash)}</div>
              <div style={{ color: stage.status === 2 ? "var(--green)" : stage.status === 3 ? "var(--red)" : "var(--text-dim)" }}>
                {label}{jobLabel ? ` (${jobLabel})` : ""}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
                {formatUnits(stage.budget, 6)} USDC
              </div>
            </div>
          );
        })}
      </div>

      {/* Budget summary */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--text-dim)" }}>
        <span>Spent: {formatUnits(pipeline.totalSpent, 6)} / {formatUnits(pipeline.totalBudget, 6)} USDC</span>
        <span>Status: <strong style={{ color: statusLabel === "Active" ? "var(--green)" : "var(--text)" }}>{statusLabel}</strong></span>
      </div>

      {/* Active stage action for client */}
      {isClient && isActive && activeStage && activeStage.status === 1 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", marginBottom: "0.5rem", color: "var(--text-dim)" }}>
            Stage {activeStageIndex + 1} — Job #{activeJobId?.toString()}
          </div>
          {getStageAction(activeStage, activeStageIndex)}
        </div>
      )}

      {/* Cancel */}
      {isClient && isActive && (
        <button
          className="btn btn-outline btn-sm"
          style={{ borderColor: "var(--red)", color: "var(--red)" }}
          onClick={handleCancel}
          disabled={isCancelling}
        >
          {isCancelling ? "Cancelling..." : "Cancel Pipeline"}
        </button>
      )}
    </div>
  );
}
