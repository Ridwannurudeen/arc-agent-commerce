"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { capabilityName, JOB_STATUS } from "@/lib/constants";
import { formatUnits, keccak256, toHex } from "viem";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";

type IncomingJob = {
  pipelineId: number;
  stageIndex: number;
  jobId: number;
  capabilityHash: string;
  budget: bigint;
  jobStatus: number;
  jobBudget: bigint;
};

export function IncomingJobs() {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  // Step 1: Get total pipeline count
  const { data: nextPipelineId } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "nextPipelineId",
  });

  const pipelineCount = Number(nextPipelineId ?? 0);

  // Step 2: Batch-read all pipelines' stages
  const { data: stagesRaw, isLoading: loadingStages } = useReadContracts({
    contracts: Array.from({ length: pipelineCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR as `0x${string}`,
      abi: PipelineOrchestratorABI as any,
      functionName: "getStages",
      args: [BigInt(i)],
    })),
    query: { enabled: pipelineCount > 0 },
  });

  // Find stages where provider matches wallet
  const myStages = useMemo(() => {
    if (!stagesRaw || !address) return [];
    const result: { pipelineId: number; stageIndex: number; stage: any }[] = [];
    for (let p = 0; p < stagesRaw.length; p++) {
      const r = stagesRaw[p];
      if (r.status !== "success" || !r.result) continue;
      const stages = r.result as any[];
      for (let s = 0; s < stages.length; s++) {
        const stage = stages[s];
        const provAddr = (stage.providerAddress ?? stage[1]) as string;
        if (provAddr.toLowerCase() === address.toLowerCase()) {
          result.push({ pipelineId: p, stageIndex: s, stage });
        }
      }
    }
    return result;
  }, [stagesRaw, address]);

  // Step 3: Batch-read ACP jobs for matching stages
  const jobIds = myStages.map((s) => {
    const jobId = s.stage.jobId ?? s.stage[4];
    return Number(jobId);
  });

  const { data: jobsRaw, isLoading: loadingJobs, refetch: refetchJobs } = useReadContracts({
    contracts: jobIds.map((jobId) => ({
      address: CONTRACTS.AGENTIC_COMMERCE as `0x${string}`,
      abi: AgenticCommerceABI as any,
      functionName: "getJob",
      args: [BigInt(jobId)],
    })),
    query: { enabled: jobIds.length > 0 },
  });

  // Merge data
  const jobs: IncomingJob[] = useMemo(() => {
    if (!jobsRaw) return [];
    return myStages.map((s, i) => {
      const jobResult = jobsRaw[i];
      const job = jobResult?.status === "success" ? (jobResult.result as any) : null;
      return {
        pipelineId: s.pipelineId,
        stageIndex: s.stageIndex,
        jobId: jobIds[i],
        capabilityHash: (s.stage.capabilityHash ?? s.stage[2]) as string,
        budget: BigInt(s.stage.budget ?? s.stage[3]),
        jobStatus: job ? Number(job.status ?? job[7]) : -1,
        jobBudget: job ? BigInt(job.budget ?? job[5]) : BigInt(0),
      };
    });
  }, [myStages, jobsRaw, jobIds]);

  // setBudget action
  const [budgetJobId, setBudgetJobId] = useState<number | null>(null);
  const [budgetAmount, setBudgetAmount] = useState("");
  const { writeContract: callSetBudget, data: setBudgetHash, error: setBudgetError, reset: resetSetBudget } = useWriteContract();
  const { isSuccess: setBudgetSuccess } = useWaitForTransactionReceipt({ hash: setBudgetHash });

  useEffect(() => {
    if (setBudgetSuccess) {
      addToast("Budget set!", "success", setBudgetHash);
      setBudgetJobId(null);
      setBudgetAmount("");
      refetchJobs();
    }
  }, [setBudgetSuccess]);

  useEffect(() => {
    if (setBudgetError) {
      addToast(parseContractError(setBudgetError), "error");
      resetSetBudget();
    }
  }, [setBudgetError]);

  // submit action
  const [submitJobId, setSubmitJobId] = useState<number | null>(null);
  const [deliverableText, setDeliverableText] = useState("");
  const { writeContract: callSubmit, data: submitHash, error: submitError, reset: resetSubmit } = useWriteContract();
  const { isSuccess: submitSuccess } = useWaitForTransactionReceipt({ hash: submitHash });

  useEffect(() => {
    if (submitSuccess) {
      addToast("Deliverable submitted!", "success", submitHash);
      setSubmitJobId(null);
      setDeliverableText("");
      refetchJobs();
    }
  }, [submitSuccess]);

  useEffect(() => {
    if (submitError) {
      addToast(parseContractError(submitError), "error");
      resetSubmit();
    }
  }, [submitError]);

  if (!isConnected) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
        <p style={{ color: "var(--text-dim)" }}>Connect your wallet to view incoming jobs.</p>
      </div>
    );
  }

  const isLoading = loadingStages || loadingJobs;

  return (
    <div>
      <h2 style={{ marginBottom: "1.5rem" }}>Incoming Jobs</h2>

      {isLoading && <Skeleton />}

      {!isLoading && jobs.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-dim)" }}>No incoming jobs. List a service to start receiving work.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {jobs.map((j) => (
          <div key={`${j.pipelineId}-${j.stageIndex}`} className="card" style={{ padding: "1rem 1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                  Pipeline #{j.pipelineId} &mdash; Stage {j.stageIndex}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  {capabilityName(j.capabilityHash)} &middot; Job #{j.jobId} &middot; Stage budget: {formatUnits(j.budget, 6)} USDC
                </div>
              </div>
              <span
                className={`status ${
                  j.jobStatus === 3 ? "completed" : j.jobStatus === 4 ? "expired" : "active"
                }`}
              >
                {j.jobStatus >= 0 ? JOB_STATUS[j.jobStatus] : "Unknown"}
              </span>
            </div>

            {/* Open + no budget set yet — provider sets budget */}
            {j.jobStatus === 0 && j.jobBudget === BigInt(0) && (
              <div style={{ marginTop: "0.5rem" }}>
                {budgetJobId === j.jobId ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="number"
                      step="0.01"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      placeholder={formatUnits(j.budget, 6)}
                      style={{
                        padding: "0.4rem 0.6rem",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        color: "var(--text)",
                        fontSize: "0.85rem",
                        width: "120px",
                      }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>USDC</span>
                    <button
                      className="btn-sm"
                      disabled={!!setBudgetHash && !setBudgetSuccess}
                      onClick={() => {
                        const amt = budgetAmount ? BigInt(Math.round(Number(budgetAmount) * 1_000_000)) : j.budget;
                        callSetBudget({
                          address: CONTRACTS.AGENTIC_COMMERCE,
                          abi: AgenticCommerceABI,
                          functionName: "setBudget",
                          args: [BigInt(j.jobId), amt, "0x"],
                        });
                      }}
                    >
                      {setBudgetHash && !setBudgetSuccess ? "Setting..." : "Confirm"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-sm"
                    onClick={() => {
                      setBudgetJobId(j.jobId);
                      setBudgetAmount(formatUnits(j.budget, 6));
                    }}
                  >
                    Set Budget
                  </button>
                )}
              </div>
            )}

            {/* Open + budget set — waiting for client to fund */}
            {j.jobStatus === 0 && j.jobBudget > BigInt(0) && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Budget set at {formatUnits(j.jobBudget, 6)} USDC. Waiting for client to fund.
              </div>
            )}

            {/* Funded — provider can submit deliverable */}
            {j.jobStatus === 1 && (
              <div style={{ marginTop: "0.5rem" }}>
                {submitJobId === j.jobId ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="text"
                      value={deliverableText}
                      onChange={(e) => setDeliverableText(e.target.value)}
                      placeholder="Deliverable description"
                      style={{
                        padding: "0.4rem 0.6rem",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        color: "var(--text)",
                        fontSize: "0.85rem",
                        flex: 1,
                      }}
                    />
                    <button
                      className="btn-sm"
                      disabled={!deliverableText || (!!submitHash && !submitSuccess)}
                      onClick={() => {
                        const hash = keccak256(toHex(deliverableText));
                        callSubmit({
                          address: CONTRACTS.AGENTIC_COMMERCE,
                          abi: AgenticCommerceABI,
                          functionName: "submit",
                          args: [BigInt(j.jobId), hash, "0x"],
                        });
                      }}
                    >
                      {submitHash && !submitSuccess ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                ) : (
                  <button className="btn-sm" onClick={() => setSubmitJobId(j.jobId)}>
                    Submit Deliverable
                  </button>
                )}
              </div>
            )}

            {/* Submitted — waiting for approval */}
            {j.jobStatus === 2 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--yellow)" }}>
                Deliverable submitted. Waiting for client approval.
              </div>
            )}

            {/* Completed — paid */}
            {j.jobStatus === 3 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--green)" }}>
                Paid {formatUnits(j.jobBudget, 6)} USDC
              </div>
            )}

            {/* Rejected */}
            {j.jobStatus === 4 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--red)" }}>
                Rejected by evaluator
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
