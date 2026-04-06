"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import { capabilityName, JOB_STATUS } from "@/lib/constants";
import { formatUnits, keccak256, toHex } from "viem";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import { motion } from "framer-motion";
import { Inbox, CircleDollarSign, Send, Clock, CheckCircle2, XCircle, Wallet, PackageSearch } from "lucide-react";

type IncomingJob = {
  pipelineId: number;
  stageIndex: number;
  jobId: number;
  capabilityHash: string;
  budget: bigint;
  jobStatus: number;
  jobBudget: bigint;
};

function jobPillClass(status: number) {
  if (status === 3) return "pill-green";
  if (status === 4) return "pill-red";
  if (status === 1) return "pill-blue";
  if (status === 2) return "pill-yellow";
  return "pill-gray";
}

export function IncomingJobs() {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  const { data: nextPipelineId } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "nextPipelineId",
    chainId: arcTestnet.id,
  });

  const pipelineCount = Number(nextPipelineId ?? 0);

  const { data: stagesRaw, isLoading: loadingStages } = useReadContracts({
    contracts: Array.from({ length: pipelineCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR as `0x${string}`,
      abi: PipelineOrchestratorABI as any,
      functionName: "getStages",
      args: [BigInt(i)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: pipelineCount > 0 },
  });

  const myStages = useMemo(() => {
    if (!stagesRaw || !address) return [];
    const result: { pipelineId: number; stageIndex: number; stage: any }[] = [];
    for (let p = 0; p < stagesRaw.length; p++) {
      const r = stagesRaw[p];
      if (r.status !== "success" || !r.result) continue;
      const stages = r.result as any[];
      for (let s = 0; s < stages.length; s++) {
        const stage = stages[s];
        const provAddr = (stage.providerAddress ?? stage[1] ?? "") as string;
        if (provAddr && provAddr.toLowerCase() === address.toLowerCase()) {
          result.push({ pipelineId: p, stageIndex: s, stage });
        }
      }
    }
    return result;
  }, [stagesRaw, address]);

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
      chainId: arcTestnet.id,
    })),
    query: { enabled: jobIds.length > 0 },
  });

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
        budget: BigInt(s.stage.budget ?? s.stage[3] ?? 0),
        jobStatus: job ? Number(job.status ?? job[7]) : -1,
        jobBudget: job ? BigInt(job.budget ?? job[5] ?? 0) : BigInt(0),
      };
    });
  }, [myStages, jobsRaw, jobIds]);

  // setBudget action
  const [budgetJobId, setBudgetJobId] = useState<number | null>(null);
  const [budgetAmount, setBudgetAmount] = useState("");
  const { writeContract: callSetBudget, data: setBudgetHash, error: setBudgetError, reset: resetSetBudget } = useWriteContract();
  const { isSuccess: setBudgetSuccess } = useWaitForTransactionReceipt({ hash: setBudgetHash });

  useEffect(() => {
    if (setBudgetSuccess) { addToast("Budget set!", "success", setBudgetHash); setBudgetJobId(null); setBudgetAmount(""); refetchJobs(); }
  }, [setBudgetSuccess]);
  useEffect(() => { if (setBudgetError) { addToast(parseContractError(setBudgetError), "error"); resetSetBudget(); } }, [setBudgetError]);

  // submit action
  const [submitJobId, setSubmitJobId] = useState<number | null>(null);
  const [deliverableText, setDeliverableText] = useState("");
  const { writeContract: callSubmit, data: submitHash, error: submitError, reset: resetSubmit } = useWriteContract();
  const { isSuccess: submitSuccess } = useWaitForTransactionReceipt({ hash: submitHash });

  useEffect(() => {
    if (submitSuccess) { addToast("Deliverable submitted!", "success", submitHash); setSubmitJobId(null); setDeliverableText(""); refetchJobs(); }
  }, [submitSuccess]);
  useEffect(() => { if (submitError) { addToast(parseContractError(submitError), "error"); resetSubmit(); } }, [submitError]);

  if (!isConnected) {
    return (
      <div className="empty-state">
        <Wallet size={40} className="empty-icon" />
        <p>Connect your wallet to view incoming jobs.</p>
      </div>
    );
  }

  const isLoading = loadingStages || loadingJobs;

  return (
    <div>
      <div className="section-header">
        <h2>Incoming Jobs</h2>
        <p className="section-subtitle">{jobs.length} job{jobs.length !== 1 ? "s" : ""} assigned to your wallet</p>
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && jobs.length === 0 && (
        <div className="empty-state">
          <PackageSearch size={40} className="empty-icon" />
          <p>No incoming jobs</p>
          <p className="secondary">List a service to start receiving work</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {jobs.map((j, idx) => (
          <motion.div
            key={`${j.pipelineId}-${j.stageIndex}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: idx * 0.03 }}
            className="glass-card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <Inbox size={15} style={{ color: "var(--accent)" }} />
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                    Pipeline #{j.pipelineId} -- Stage {j.stageIndex}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.78rem", color: "var(--text-dim)", flexWrap: "wrap" }}>
                  <span className="pill pill-blue" style={{ fontSize: "0.7rem" }}>{capabilityName(j.capabilityHash)}</span>
                  <span>Job #{j.jobId}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <CircleDollarSign size={12} /> {formatUnits(j.budget, 6)} USDC
                  </span>
                </div>
              </div>
              <span className={`pill ${jobPillClass(j.jobStatus)}`}>
                {j.jobStatus >= 0 ? JOB_STATUS[j.jobStatus] : "Unknown"}
              </span>
            </div>

            {/* Open + no budget set */}
            {j.jobStatus === 0 && j.jobBudget === BigInt(0) && (
              <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "rgba(59,130,246,0.05)", borderRadius: "8px", border: "1px solid rgba(59,130,246,0.15)" }}>
                {budgetJobId === j.jobId ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      className="glass-input"
                      type="number"
                      step="0.01"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      placeholder={formatUnits(j.budget, 6)}
                      style={{ width: "130px", padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>USDC</span>
                    <button
                      className="btn-primary"
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
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
                    className="btn-primary"
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                    onClick={() => { setBudgetJobId(j.jobId); setBudgetAmount(formatUnits(j.budget, 6)); }}
                  >
                    <CircleDollarSign size={14} /> Set Budget
                  </button>
                )}
              </div>
            )}

            {/* Open + budget set */}
            {j.jobStatus === 0 && j.jobBudget > BigInt(0) && (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--text-dim)" }}>
                <Clock size={14} /> Budget set at {formatUnits(j.jobBudget, 6)} USDC. Waiting for client to fund.
              </div>
            )}

            {/* Funded */}
            {j.jobStatus === 1 && (
              <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "rgba(59,130,246,0.05)", borderRadius: "8px", border: "1px solid rgba(59,130,246,0.15)" }}>
                {submitJobId === j.jobId ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      className="glass-input"
                      type="text"
                      value={deliverableText}
                      onChange={(e) => setDeliverableText(e.target.value)}
                      placeholder="Deliverable description"
                      style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                    />
                    <button
                      className="btn-primary"
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
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
                      <Send size={12} /> {submitHash && !submitSuccess ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-primary"
                    style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                    onClick={() => setSubmitJobId(j.jobId)}
                  >
                    <Send size={14} /> Submit Deliverable
                  </button>
                )}
              </div>
            )}

            {/* Submitted */}
            {j.jobStatus === 2 && (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--yellow)" }}>
                <Clock size={14} /> Deliverable submitted. Waiting for client approval.
              </div>
            )}

            {/* Completed */}
            {j.jobStatus === 3 && (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--green)" }}>
                <CheckCircle2 size={14} /> Paid {formatUnits(j.jobBudget, 6)} USDC
              </div>
            )}

            {/* Rejected */}
            {j.jobStatus === 4 && (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--red)" }}>
                <XCircle size={14} /> Rejected by evaluator
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
