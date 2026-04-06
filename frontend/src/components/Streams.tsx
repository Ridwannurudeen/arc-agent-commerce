"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, isAddress } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import StreamEscrowABI from "@/abi/StreamEscrow.json";
import USDCABI from "@/abi/USDC.json";
import { STREAM_STATUS } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import { Skeleton } from "./Skeleton";
import { motion } from "framer-motion";
import { Wallet, Clock, Heart, ArrowRight, CheckCircle2, CircleDollarSign, Activity, Pause, XCircle, Plus, PackageSearch } from "lucide-react";

function statusPillClass(s: string) {
  if (s === "Active") return "pill-green";
  if (s === "Paused") return "pill-yellow";
  if (s === "Completed") return "pill-blue";
  return "pill-gray";
}

// ---- Create Stream Form ----

function CreateStreamForm() {
  const { addToast } = useToast();
  const { address } = useAccount();

  const [clientAgentId, setClientAgentId] = useState("0");
  const [providerAgentId, setProviderAgentId] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [durationHours, setDurationHours] = useState("24");
  const [heartbeatSeconds, setHeartbeatSeconds] = useState("3600");
  const [step, setStep] = useState<1 | 2>(1);

  const depositParsed = amount ? parseUnits(amount, 6) : BigInt(0);

  // Approve tx
  const { writeContract: approveWrite, data: approveHash } = useWriteContract();
  const { isLoading: isApproving, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Create stream tx
  const { writeContract, data: createHash } = useWriteContract();
  const { isLoading: isCreating, isSuccess: isCreateSuccess } =
    useWaitForTransactionReceipt({ hash: createHash });

  // Check allowance
  const { data: allowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: USDCABI,
    functionName: "allowance",
    args: address && CONTRACTS.STREAM_ESCROW
      ? [address, CONTRACTS.STREAM_ESCROW]
      : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.STREAM_ESCROW },
  });

  useEffect(() => {
    if (isApproveSuccess) setStep(2);
  }, [isApproveSuccess]);

  useEffect(() => {
    if (allowance !== undefined && depositParsed > BigInt(0) && (allowance as bigint) >= depositParsed) {
      setStep(2);
    }
  }, [allowance, depositParsed]);

  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      addToast("USDC approval confirmed", "success", approveHash);
    }
  }, [isApproveSuccess, approveHash, addToast]);

  useEffect(() => {
    if (isCreateSuccess && createHash) {
      addToast("Stream created successfully", "success", createHash);
    }
  }, [isCreateSuccess, createHash, addToast]);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (providerAddress && !isAddress(providerAddress)) errors.provider = "Invalid provider address";
    if (amount) { const num = Number(amount); if (isNaN(num) || num <= 0) errors.amount = "Amount must be > 0"; }
    const hrs = Number(durationHours);
    if (durationHours && (isNaN(hrs) || hrs < 0.01)) errors.duration = "Duration must be > 0";
    const hb = Number(heartbeatSeconds);
    if (heartbeatSeconds && (isNaN(hb) || hb < 1)) errors.heartbeat = "Heartbeat interval must be >= 1 second";
    if (!CONTRACTS.STREAM_ESCROW) errors.contract = "StreamEscrow address not configured";
    return errors;
  }, [providerAddress, amount, durationHours, heartbeatSeconds]);

  const hasErrors = Object.keys(validation).length > 0;
  const formComplete = !!providerAddress && !!providerAgentId && !!amount && !!durationHours && !!heartbeatSeconds;
  const canSubmit = formComplete && !hasErrors;

  const handleApprove = () => {
    approveWrite(
      {
        address: CONTRACTS.USDC,
        abi: USDCABI,
        functionName: "approve",
        args: [CONTRACTS.STREAM_ESCROW, depositParsed],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const durationSecs = BigInt(Math.floor(Number(durationHours) * 3600));
    writeContract(
      {
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI,
        functionName: "createStream",
        args: [
          BigInt(clientAgentId),
          BigInt(providerAgentId),
          providerAddress as `0x${string}`,
          CONTRACTS.USDC,
          depositParsed,
          durationSecs,
          BigInt(heartbeatSeconds),
        ],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  return (
    <div className="glass-card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <Activity size={18} style={{ color: "var(--accent)" }} />
        <span style={{ fontWeight: 700, fontSize: "1rem" }}>Create Stream</span>
      </div>

      {/* Step bar */}
      <div className="step-bar" style={{ maxWidth: "280px", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className={`step-node ${step >= 1 ? (step > 1 ? "completed" : "active") : ""}`} style={{ width: 28, height: 28, fontSize: "0.75rem" }}>
            {step > 1 ? <CheckCircle2 size={14} /> : "1"}
          </div>
          <span className={`step-label ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>Approve</span>
        </div>
        <div className={`step-connector ${step > 1 ? "completed" : ""}`} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className={`step-node ${step >= 2 ? "active" : ""}`} style={{ width: 28, height: 28, fontSize: "0.75rem" }}>
            {isCreateSuccess ? <CheckCircle2 size={14} /> : "2"}
          </div>
          <span className={`step-label ${step >= 2 ? "active" : ""}`}>Create</span>
        </div>
      </div>

      <form onSubmit={handleCreate}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="form-group">
            <label>Client Agent ID</label>
            <input className="glass-input" type="number" placeholder="0" value={clientAgentId} onChange={(e) => setClientAgentId(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Provider Agent ID</label>
            <input className="glass-input" type="number" placeholder="e.g., 2" value={providerAgentId} onChange={(e) => setProviderAgentId(e.target.value)} required />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Provider Address</label>
            <input className="glass-input" type="text" placeholder="0x..." value={providerAddress} onChange={(e) => setProviderAddress(e.target.value)} required />
            {validation.provider && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.provider}</span>}
          </div>
          <div className="form-group">
            <label>Amount (USDC)</label>
            <input className="glass-input" type="text" placeholder="e.g., 100" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            {validation.amount && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.amount}</span>}
          </div>
          <div className="form-group">
            <label>Duration (hours)</label>
            <input className="glass-input" type="number" placeholder="24" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} required />
            {validation.duration && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.duration}</span>}
          </div>
          <div className="form-group">
            <label>Heartbeat Interval (seconds)</label>
            <input className="glass-input" type="number" placeholder="3600" value={heartbeatSeconds} onChange={(e) => setHeartbeatSeconds(e.target.value)} required />
            {validation.heartbeat && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.heartbeat}</span>}
          </div>
        </div>

        <div className="budget-summary" style={{ marginTop: "1rem" }}>
          <CircleDollarSign size={18} style={{ color: "var(--green)", flexShrink: 0 }} />
          <div>
            <div className="budget-amount" style={{ color: "var(--green)" }}>{amount ? Number(amount).toFixed(2) : "0.00"} USDC</div>
            <div className="budget-meta">Streaming over {durationHours || "0"}h</div>
          </div>
        </div>

        {validation.contract && <div className="warning-banner" style={{ marginTop: "0.75rem" }}>{validation.contract}</div>}

        <div style={{ marginTop: "1rem" }}>
          {step === 1 ? (
            <button type="button" className="btn-primary" onClick={handleApprove} disabled={isApproving || !amount || Number(amount) <= 0 || !!validation.contract} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Wallet size={14} /> {isApproving ? "Approving..." : "Approve USDC"}
            </button>
          ) : (
            <button className="btn-primary" type="submit" disabled={isCreating || !canSubmit} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <ArrowRight size={14} /> {isCreating ? "Creating..." : "Create Stream"}
            </button>
          )}
        </div>

        {isCreateSuccess && (
          <div className="success-banner" style={{ marginTop: "0.75rem" }}>Stream created! It will appear in the list below.</div>
        )}
      </form>
    </div>
  );
}

// ---- Stream Card ----

function StreamCard({ streamId, address }: { streamId: number; address: `0x${string}` }) {
  const { addToast } = useToast();

  const { data: streamRaw, refetch: refetchStream } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "getStream",
    args: [BigInt(streamId)],
    chainId: arcTestnet.id,
  });

  const { data: claimable, refetch: refetchClaimable } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "balanceOf",
    args: [BigInt(streamId)],
    chainId: arcTestnet.id,
  });

  const { data: remaining, refetch: refetchRemaining } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "remainingBalance",
    args: [BigInt(streamId)],
    chainId: arcTestnet.id,
  });

  const { writeContract: heartbeatWrite, data: heartbeatHash } = useWriteContract();
  const { isLoading: isHeartbeating, isSuccess: heartbeatSuccess } = useWaitForTransactionReceipt({ hash: heartbeatHash });

  const { writeContract: withdrawWrite, data: withdrawHash } = useWriteContract();
  const { isLoading: isWithdrawing, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash });

  const { writeContract: resumeWrite, data: resumeHash } = useWriteContract();
  const { isLoading: isResuming, isSuccess: resumeSuccess } = useWaitForTransactionReceipt({ hash: resumeHash });

  const { writeContract: cancelWrite, data: cancelHash } = useWriteContract();
  const { isLoading: isCancelling, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash });

  const { writeContract: topUpWrite, data: topUpHash } = useWriteContract();
  const { isLoading: isToppingUp, isSuccess: topUpSuccess } = useWaitForTransactionReceipt({ hash: topUpHash });

  const { writeContract: approveTopUpWrite, data: approveTopUpHash } = useWriteContract();
  const { isLoading: isApprovingTopUp, isSuccess: approveTopUpSuccess } = useWaitForTransactionReceipt({ hash: approveTopUpHash });

  const [topUpAmount, setTopUpAmount] = useState("");
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpStep, setTopUpStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (heartbeatSuccess || withdrawSuccess || resumeSuccess || cancelSuccess || topUpSuccess) {
      refetchStream(); refetchClaimable(); refetchRemaining();
    }
  }, [heartbeatSuccess, withdrawSuccess, resumeSuccess, cancelSuccess, topUpSuccess, refetchStream, refetchClaimable, refetchRemaining]);

  useEffect(() => { if (heartbeatSuccess && heartbeatHash) addToast("Heartbeat sent", "success", heartbeatHash); }, [heartbeatSuccess, heartbeatHash, addToast]);
  useEffect(() => { if (withdrawSuccess && withdrawHash) addToast("Withdrawal successful", "success", withdrawHash); }, [withdrawSuccess, withdrawHash, addToast]);
  useEffect(() => { if (resumeSuccess && resumeHash) addToast("Stream resumed", "success", resumeHash); }, [resumeSuccess, resumeHash, addToast]);
  useEffect(() => { if (cancelSuccess && cancelHash) addToast("Stream cancelled", "success", cancelHash); }, [cancelSuccess, cancelHash, addToast]);
  useEffect(() => {
    if (topUpSuccess && topUpHash) { addToast("Top-up successful", "success", topUpHash); setShowTopUp(false); setTopUpAmount(""); setTopUpStep(1); }
  }, [topUpSuccess, topUpHash, addToast]);
  useEffect(() => { if (approveTopUpSuccess) setTopUpStep(2); }, [approveTopUpSuccess]);

  if (!streamRaw) return null;

  const s = streamRaw as {
    client: string; provider: string; clientAgentId: bigint; providerAgentId: bigint;
    currency: string; deposit: bigint; withdrawn: bigint; startTime: bigint; endTime: bigint;
    heartbeatInterval: bigint; lastHeartbeat: bigint; missedBeats: bigint; pausedAt: bigint;
    totalPausedTime: bigint; status: number;
  };

  const statusLabel = STREAM_STATUS[s.status] ?? "Unknown";
  const isClient = address?.toLowerCase() === (s.client ?? "").toLowerCase();
  const isProvider = address?.toLowerCase() === (s.provider ?? "").toLowerCase();

  const now = Math.floor(Date.now() / 1000);
  const startTime = Number(s.startTime);
  const endTime = Number(s.endTime);
  const totalDuration = endTime - startTime;
  const elapsed = Math.min(now - startTime, totalDuration);
  const progress = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)) : 0;

  // Heartbeat status
  const lastHB = Number(s.lastHeartbeat);
  const hbInterval = Number(s.heartbeatInterval);
  const timeSinceHB = now - lastHB;
  const hbHealthy = timeSinceHB < hbInterval * 1.5;

  const handleHeartbeat = () => {
    heartbeatWrite({ address: CONTRACTS.STREAM_ESCROW, abi: StreamEscrowABI, functionName: "heartbeat", args: [BigInt(streamId)], chainId: arcTestnet.id },
      { onError: (err) => addToast(parseContractError(err), "error") });
  };
  const handleWithdraw = () => {
    withdrawWrite({ address: CONTRACTS.STREAM_ESCROW, abi: StreamEscrowABI, functionName: "withdraw", args: [BigInt(streamId)], chainId: arcTestnet.id },
      { onError: (err) => addToast(parseContractError(err), "error") });
  };
  const handleResume = () => {
    resumeWrite({ address: CONTRACTS.STREAM_ESCROW, abi: StreamEscrowABI, functionName: "resume", args: [BigInt(streamId)], chainId: arcTestnet.id },
      { onError: (err) => addToast(parseContractError(err), "error") });
  };
  const handleCancel = () => {
    cancelWrite({ address: CONTRACTS.STREAM_ESCROW, abi: StreamEscrowABI, functionName: "cancel", args: [BigInt(streamId)], chainId: arcTestnet.id },
      { onError: (err) => addToast(parseContractError(err), "error") });
  };
  const handleTopUpApprove = () => {
    const parsed = parseUnits(topUpAmount, 6);
    approveTopUpWrite({ address: CONTRACTS.USDC, abi: USDCABI, functionName: "approve", args: [CONTRACTS.STREAM_ESCROW, parsed], chainId: arcTestnet.id },
      { onError: (err) => addToast(parseContractError(err), "error") });
  };
  const handleTopUp = () => {
    const parsed = parseUnits(topUpAmount, 6);
    topUpWrite({ address: CONTRACTS.STREAM_ESCROW, abi: StreamEscrowABI, functionName: "topUp", args: [BigInt(streamId), parsed], chainId: arcTestnet.id },
      { onError: (err) => addToast(parseContractError(err), "error") });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
      style={{ marginBottom: "0.75rem" }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.25rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Stream #{streamId}</span>
            <span className={`pill ${statusPillClass(statusLabel)}`}>{statusLabel}</span>
            {isClient && <span className="pill pill-purple">Client</span>}
            {isProvider && <span className="pill pill-blue">Provider</span>}
          </div>
          <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.78rem", color: "var(--text-dim)", flexWrap: "wrap" }}>
            <span>Deposit: {formatUnits(s.deposit, 6)} USDC</span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Clock size={12} /> {(totalDuration / 3600).toFixed(1)}h
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Heart size={12} /> {hbInterval}s
            </span>
          </div>
        </div>
        {/* Heartbeat status indicator */}
        {s.status === 0 && (
          <div
            style={{
              width: 10, height: 10, borderRadius: "50%",
              background: hbHealthy ? "var(--green)" : "var(--red)",
              boxShadow: hbHealthy ? "0 0 8px rgba(34,197,94,0.5)" : "0 0 8px rgba(239,68,68,0.5)",
            }}
            className={hbHealthy ? "heartbeat-active" : ""}
            title={hbHealthy ? "Heartbeat healthy" : "Heartbeat missed"}
          />
        )}
      </div>

      {/* Addresses */}
      <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem", flexWrap: "wrap" }}>
        <span>Client: {s.client.slice(0, 6)}...{s.client.slice(-4)} (Agent #{Number(s.clientAgentId)})</span>
        <span>Provider: {s.provider.slice(0, 6)}...{s.provider.slice(-4)} (Agent #{Number(s.providerAgentId)})</span>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
          <span>{progress.toFixed(1)}% elapsed</span>
          <span>{Math.max(0, Math.ceil((endTime - now) / 3600))}h remaining</span>
        </div>
        <div className="progress-track">
          <div
            className={`progress-fill ${s.status === 1 ? "yellow" : "green"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Balances */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginTop: "0.75rem" }}>
        <div style={{ background: "rgba(34,197,94,0.06)", borderRadius: "8px", padding: "0.5rem 0.65rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Claimable</div>
          <div style={{ fontWeight: 700, color: "var(--green)", fontSize: "0.9rem" }}>{claimable !== undefined ? formatUnits(claimable as bigint, 6) : "--"}</div>
        </div>
        <div style={{ background: "rgba(59,130,246,0.06)", borderRadius: "8px", padding: "0.5rem 0.65rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Remaining</div>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{remaining !== undefined ? formatUnits(remaining as bigint, 6) : "--"}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "0.5rem 0.65rem" }}>
          <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Withdrawn</div>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-dim)" }}>{formatUnits(s.withdrawn, 6)}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
        {isProvider && s.status === 0 && (
          <button className="btn-primary" style={{ fontSize: "0.78rem", padding: "0.4rem 0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }} onClick={handleHeartbeat} disabled={isHeartbeating}>
            <Heart size={13} /> {isHeartbeating ? "Sending..." : "Heartbeat"}
          </button>
        )}
        {isProvider && (s.status === 0 || s.status === 2) && (
          <button className="btn btn-sm" onClick={handleWithdraw} disabled={isWithdrawing}>
            {isWithdrawing ? "Withdrawing..." : "Withdraw"}
          </button>
        )}
        {isProvider && s.status === 1 && (
          <button className="btn btn-sm" onClick={handleResume} disabled={isResuming} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Activity size={13} /> {isResuming ? "Resuming..." : "Resume"}
          </button>
        )}
        {isClient && (s.status === 0 || s.status === 1) && (
          <button className="btn btn-outline btn-sm" onClick={() => setShowTopUp(!showTopUp)} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Plus size={13} /> Top Up
          </button>
        )}
        {isClient && (s.status === 0 || s.status === 1) && (
          <button className="btn-danger" onClick={handleCancel} disabled={isCancelling} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <XCircle size={13} /> {isCancelling ? "Cancelling..." : "Cancel"}
          </button>
        )}
      </div>

      {/* Top-up form */}
      {showTopUp && (
        <div style={{ marginTop: "0.75rem", padding: "0.85rem", border: "1px solid var(--border)", borderRadius: "10px", background: "rgba(18,18,26,0.3)" }}>
          <div className="form-group" style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem" }}>Top-up Amount (USDC)</label>
            <input className="glass-input" type="text" placeholder="e.g., 50" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} style={{ fontSize: "0.85rem" }} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div className="step-bar" style={{ flex: "none", gap: 0, marginBottom: 0 }}>
              <span className={`pill ${topUpStep >= 1 ? (topUpStep > 1 ? "pill-green" : "pill-blue") : "pill-gray"}`} style={{ fontSize: "0.7rem" }}>1. Approve</span>
              <ArrowRight size={12} style={{ color: "var(--text-dim)", margin: "0 0.25rem" }} />
              <span className={`pill ${topUpStep >= 2 ? "pill-blue" : "pill-gray"}`} style={{ fontSize: "0.7rem" }}>2. Top Up</span>
            </div>
            {topUpStep === 1 ? (
              <button className="btn btn-sm" onClick={handleTopUpApprove} disabled={isApprovingTopUp || !topUpAmount || Number(topUpAmount) <= 0}>
                {isApprovingTopUp ? "Approving..." : "Approve"}
              </button>
            ) : (
              <button className="btn btn-sm" onClick={handleTopUp} disabled={isToppingUp || !topUpAmount || Number(topUpAmount) <= 0}>
                {isToppingUp ? "Topping up..." : "Top Up"}
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---- Streams Tab ----

export function Streams() {
  const { address } = useAccount();

  const { data: clientIds, isLoading: isLoadingClient } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "getClientStreams",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.STREAM_ESCROW },
  });

  const { data: providerIds, isLoading: isLoadingProvider } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "getProviderStreams",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.STREAM_ESCROW },
  });

  const allIds = useMemo(() => {
    const cIds = ((clientIds as bigint[]) ?? []).map(Number);
    const pIds = ((providerIds as bigint[]) ?? []).map(Number);
    const merged = [...new Set([...cIds, ...pIds])];
    return merged.sort((a, b) => b - a);
  }, [clientIds, providerIds]);

  const isLoading = isLoadingClient || isLoadingProvider;

  if (!address) {
    return (
      <div>
        <div className="section-header">
          <h2>Streams</h2>
          <p className="section-subtitle">Continuous payment streams with heartbeat monitoring</p>
        </div>
        <CreateStreamForm />
        <div className="empty-state">
          <Wallet size={40} className="empty-icon" />
          <p>Connect wallet to view your streams.</p>
        </div>
      </div>
    );
  }

  if (!CONTRACTS.STREAM_ESCROW) {
    return (
      <div className="empty-state">
        <Activity size={40} className="empty-icon" />
        <p>StreamEscrow address not configured.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2>Streams</h2>
        <p className="section-subtitle">Continuous payment streams with heartbeat monitoring</p>
      </div>

      <CreateStreamForm />

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1.5rem 0 1rem" }}>
        <Activity size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>My Streams</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>({allIds.length})</span>
      </div>

      {isLoading ? (
        <Skeleton lines={4} />
      ) : allIds.length === 0 ? (
        <div className="empty-state">
          <PackageSearch size={40} className="empty-icon" />
          <p>No streams found</p>
          <p className="secondary">Create one above to get started</p>
        </div>
      ) : (
        allIds.map((id) => (
          <StreamCard key={id} streamId={id} address={address} />
        ))
      )}
    </div>
  );
}
