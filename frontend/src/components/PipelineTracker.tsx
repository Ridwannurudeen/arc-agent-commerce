"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import CommerceHookABI from "@/abi/CommerceHook.json";
import { capabilityName } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";

const PIPELINE_STATUS = ["Active", "Completed", "Halted", "Cancelled"];
const STAGE_STATUS = ["Pending", "Active", "Completed", "Failed"];

const STATUS_COLORS: Record<string, string> = {
  Pending: "var(--text-dim)",
  Active: "var(--blue, #3b82f6)",
  Completed: "var(--green)",
  Failed: "var(--red)",
};

type Props = {
  pipelineId: number;
};

type PipelineData = {
  clientAgentId: bigint;
  client: string;
  currency: string;
  totalBudget: bigint;
  totalSpent: bigint;
  currentStage: bigint;
  stageCount: bigint;
  status: number;
  createdAt: bigint;
  deadline: bigint;
};

type StageData = {
  providerAgentId: bigint;
  providerAddress: string;
  capabilityHash: string;
  budget: bigint;
  jobId: bigint;
  status: number;
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
    query: { enabled: !!CONTRACTS.PIPELINE_ORCHESTRATOR },
  });

  // Fetch stages
  const { data: stagesRaw } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "getStages",
    args: [BigInt(pipelineId)],
    chainId: arcTestnet.id,
    query: { enabled: !!CONTRACTS.PIPELINE_ORCHESTRATOR },
  });

  // Toast on approve
  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      addToast("Stage approved", "success", approveHash);
    }
  }, [isApproveSuccess, approveHash, addToast]);

  // Toast on reject
  useEffect(() => {
    if (isRejectSuccess && rejectHash) {
      addToast("Stage rejected", "success", rejectHash);
    }
  }, [isRejectSuccess, rejectHash, addToast]);

  // Toast on cancel
  useEffect(() => {
    if (isCancelSuccess && cancelHash) {
      addToast("Pipeline cancelled", "success", cancelHash);
    }
  }, [isCancelSuccess, cancelHash, addToast]);

  // Parse pipeline data — useReadContract returns a tuple as an array
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

  // Find the active stage's jobId for approve/reject
  const activeStageIndex = pipeline ? Number(pipeline.currentStage) : -1;
  const activeStage = stages[activeStageIndex];
  const activeJobId = activeStage?.jobId;

  const handleApprove = () => {
    if (!activeJobId || !CONTRACTS.COMMERCE_HOOK) return;
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
    if (!activeJobId || !CONTRACTS.COMMERCE_HOOK) return;
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

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
        {stages.map((stage, i) => {
          const label = STAGE_STATUS[stage.status] ?? "Unknown";
          const color = STATUS_COLORS[label] ?? "var(--text-dim)";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "0.5rem 0.25rem",
                borderRadius: "0.25rem",
                fontSize: "0.7rem",
                background: stage.status === 2 ? "var(--green)" : stage.status === 1 ? "var(--blue, #3b82f6)" : "var(--surface)",
                color: stage.status >= 1 ? "#fff" : "var(--text)",
                opacity: stage.status === 0 ? 0.5 : 1,
              }}
            >
              <div style={{ fontWeight: 600 }}>Stage {i + 1}</div>
              <div>{capabilityName(stage.capabilityHash)}</div>
              <div style={{ marginTop: "0.15rem", color: stage.status >= 1 ? "#fff" : color }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Budget summary */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--text-dim)" }}>
        <span>
          Spent: {formatUnits(pipeline.totalSpent, 6)} / {formatUnits(pipeline.totalBudget, 6)}
        </span>
        <span>Status: <strong style={{ color: statusLabel === "Active" ? "var(--green)" : "var(--text)" }}>{statusLabel}</strong></span>
      </div>

      {/* Actions for client on active pipeline */}
      {isClient && isActive && activeStage && activeStage.status === 1 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", marginBottom: "0.5rem", color: "var(--text-dim)" }}>
            Stage {activeStageIndex + 1} is active (Job #{activeJobId?.toString()})
          </div>
          <div className="form-group" style={{ marginBottom: "0.5rem" }}>
            <input
              type="text"
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ fontSize: "0.8rem" }}
            />
          </div>
          <div className="actions" style={{ gap: "0.5rem" }}>
            <button className="btn btn-sm" onClick={handleApprove} disabled={isApproving}>
              {isApproving ? "Approving..." : "Approve Stage"}
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ borderColor: "var(--red)", color: "var(--red)" }}
              onClick={handleReject}
              disabled={isRejecting}
            >
              {isRejecting ? "Rejecting..." : "Reject Stage"}
            </button>
          </div>
        </div>
      )}

      {/* Cancel button */}
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
