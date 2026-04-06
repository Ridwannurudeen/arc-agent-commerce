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

const STATUS_BADGE_STYLES: Record<string, React.CSSProperties> = {
  Active: { background: "var(--green)", color: "#fff" },
  Paused: { background: "var(--yellow, #e6a700)", color: "#fff" },
  Completed: { background: "var(--green)", color: "#fff", opacity: 0.7 },
  Cancelled: { background: "var(--text-dim)", color: "#fff" },
};

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

  // Auto-advance to step 2 when approval succeeds
  useEffect(() => {
    if (isApproveSuccess) setStep(2);
  }, [isApproveSuccess]);

  // Skip step 1 if allowance already sufficient
  useEffect(() => {
    if (allowance !== undefined && depositParsed > BigInt(0) && (allowance as bigint) >= depositParsed) {
      setStep(2);
    }
  }, [allowance, depositParsed]);

  // Toast on approve success
  useEffect(() => {
    if (isApproveSuccess && approveHash) {
      addToast("USDC approval confirmed", "success", approveHash);
    }
  }, [isApproveSuccess, approveHash, addToast]);

  // Toast on create success
  useEffect(() => {
    if (isCreateSuccess && createHash) {
      addToast("Stream created successfully", "success", createHash);
    }
  }, [isCreateSuccess, createHash, addToast]);

  // Validation
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (providerAddress && !isAddress(providerAddress)) {
      errors.provider = "Invalid provider address";
    }
    if (amount) {
      const num = Number(amount);
      if (isNaN(num) || num <= 0) errors.amount = "Amount must be > 0";
    }
    const hrs = Number(durationHours);
    if (durationHours && (isNaN(hrs) || hrs < 0.01)) {
      errors.duration = "Duration must be > 0";
    }
    const hb = Number(heartbeatSeconds);
    if (heartbeatSeconds && (isNaN(hb) || hb < 1)) {
      errors.heartbeat = "Heartbeat interval must be >= 1 second";
    }
    if (!CONTRACTS.STREAM_ESCROW) {
      errors.contract = "StreamEscrow address not configured";
    }

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
    <div className="card">
      <h3>Create Stream</h3>
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
          <label>Provider Agent ID</label>
          <input
            type="number"
            placeholder="e.g., 2"
            value={providerAgentId}
            onChange={(e) => setProviderAgentId(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Provider Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={providerAddress}
            onChange={(e) => setProviderAddress(e.target.value)}
            required
          />
          {validation.provider && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.provider}</span>
          )}
        </div>

        <div className="form-group">
          <label>Amount (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {validation.amount && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.amount}</span>
          )}
        </div>

        <div className="form-group">
          <label>Duration (hours)</label>
          <input
            type="number"
            placeholder="24"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            required
          />
          {validation.duration && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.duration}</span>
          )}
        </div>

        <div className="form-group">
          <label>Heartbeat Interval (seconds)</label>
          <input
            type="number"
            placeholder="3600"
            value={heartbeatSeconds}
            onChange={(e) => setHeartbeatSeconds(e.target.value)}
            required
          />
          {validation.heartbeat && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.heartbeat}</span>
          )}
        </div>

        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--surface)", borderRadius: "0.5rem" }}>
          <strong>Deposit: </strong>
          <span>{amount ? Number(amount).toFixed(2) : "0.00"} USDC</span>
          <span style={{ color: "var(--text-dim)", marginLeft: "0.5rem" }}>
            (streaming over {durationHours || "0"}h)
          </span>
        </div>

        {validation.contract && (
          <div className="warning-banner">{validation.contract}</div>
        )}

        <div className="actions">
          <div
            className="step-indicator"
            style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", fontSize: "0.85rem" }}
          >
            <span style={{ opacity: step >= 1 ? 1 : 0.4 }}>1. Approve</span>
            <span>&rarr;</span>
            <span style={{ opacity: step >= 2 ? 1 : 0.4 }}>2. Create</span>
          </div>
          {step === 1 ? (
            <button
              type="button"
              className="btn"
              onClick={handleApprove}
              disabled={isApproving || !amount || Number(amount) <= 0 || !!validation.contract}
            >
              {isApproving ? "Approving..." : "Approve USDC"}
            </button>
          ) : (
            <button className="btn" type="submit" disabled={isCreating || !canSubmit}>
              {isCreating ? "Creating..." : "Create Stream"}
            </button>
          )}
        </div>

        {isCreateSuccess && (
          <div style={{ marginTop: "0.75rem", color: "var(--green)" }}>
            Stream created! It will appear in the list below.
          </div>
        )}
      </form>
    </div>
  );
}

// ---- Stream Card ----

function StreamCard({ streamId, address }: { streamId: number; address: `0x${string}` }) {
  const { addToast } = useToast();

  // Fetch stream data
  const { data: streamRaw, refetch: refetchStream } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "getStream",
    args: [BigInt(streamId)],
    chainId: arcTestnet.id,
  });

  // Fetch claimable balance
  const { data: claimable, refetch: refetchClaimable } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "balanceOf",
    args: [BigInt(streamId)],
    chainId: arcTestnet.id,
  });

  // Fetch remaining balance
  const { data: remaining, refetch: refetchRemaining } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "remainingBalance",
    args: [BigInt(streamId)],
    chainId: arcTestnet.id,
  });

  // Action txs
  const { writeContract: heartbeatWrite, data: heartbeatHash } = useWriteContract();
  const { isLoading: isHeartbeating, isSuccess: heartbeatSuccess } =
    useWaitForTransactionReceipt({ hash: heartbeatHash });

  const { writeContract: withdrawWrite, data: withdrawHash } = useWriteContract();
  const { isLoading: isWithdrawing, isSuccess: withdrawSuccess } =
    useWaitForTransactionReceipt({ hash: withdrawHash });

  const { writeContract: resumeWrite, data: resumeHash } = useWriteContract();
  const { isLoading: isResuming, isSuccess: resumeSuccess } =
    useWaitForTransactionReceipt({ hash: resumeHash });

  const { writeContract: cancelWrite, data: cancelHash } = useWriteContract();
  const { isLoading: isCancelling, isSuccess: cancelSuccess } =
    useWaitForTransactionReceipt({ hash: cancelHash });

  const { writeContract: topUpWrite, data: topUpHash } = useWriteContract();
  const { isLoading: isToppingUp, isSuccess: topUpSuccess } =
    useWaitForTransactionReceipt({ hash: topUpHash });

  const { writeContract: approveTopUpWrite, data: approveTopUpHash } = useWriteContract();
  const { isLoading: isApprovingTopUp, isSuccess: approveTopUpSuccess } =
    useWaitForTransactionReceipt({ hash: approveTopUpHash });

  const [topUpAmount, setTopUpAmount] = useState("");
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpStep, setTopUpStep] = useState<1 | 2>(1);

  // Refetch after successful actions
  useEffect(() => {
    if (heartbeatSuccess || withdrawSuccess || resumeSuccess || cancelSuccess || topUpSuccess) {
      refetchStream();
      refetchClaimable();
      refetchRemaining();
    }
  }, [heartbeatSuccess, withdrawSuccess, resumeSuccess, cancelSuccess, topUpSuccess, refetchStream, refetchClaimable, refetchRemaining]);

  // Toasts
  useEffect(() => {
    if (heartbeatSuccess && heartbeatHash) addToast("Heartbeat sent", "success", heartbeatHash);
  }, [heartbeatSuccess, heartbeatHash, addToast]);

  useEffect(() => {
    if (withdrawSuccess && withdrawHash) addToast("Withdrawal successful", "success", withdrawHash);
  }, [withdrawSuccess, withdrawHash, addToast]);

  useEffect(() => {
    if (resumeSuccess && resumeHash) addToast("Stream resumed", "success", resumeHash);
  }, [resumeSuccess, resumeHash, addToast]);

  useEffect(() => {
    if (cancelSuccess && cancelHash) addToast("Stream cancelled", "success", cancelHash);
  }, [cancelSuccess, cancelHash, addToast]);

  useEffect(() => {
    if (topUpSuccess && topUpHash) {
      addToast("Top-up successful", "success", topUpHash);
      setShowTopUp(false);
      setTopUpAmount("");
      setTopUpStep(1);
    }
  }, [topUpSuccess, topUpHash, addToast]);

  useEffect(() => {
    if (approveTopUpSuccess) setTopUpStep(2);
  }, [approveTopUpSuccess]);

  if (!streamRaw) return null;

  const s = streamRaw as {
    client: string;
    provider: string;
    clientAgentId: bigint;
    providerAgentId: bigint;
    currency: string;
    deposit: bigint;
    withdrawn: bigint;
    startTime: bigint;
    endTime: bigint;
    heartbeatInterval: bigint;
    lastHeartbeat: bigint;
    missedBeats: bigint;
    pausedAt: bigint;
    totalPausedTime: bigint;
    status: number;
  };

  const statusLabel = STREAM_STATUS[s.status] ?? "Unknown";
  const isClient = address.toLowerCase() === s.client.toLowerCase();
  const isProvider = address.toLowerCase() === s.provider.toLowerCase();

  // Progress calculation
  const now = Math.floor(Date.now() / 1000);
  const startTime = Number(s.startTime);
  const endTime = Number(s.endTime);
  const totalDuration = endTime - startTime;
  const elapsed = Math.min(now - startTime, totalDuration);
  const progress = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)) : 0;

  const handleHeartbeat = () => {
    heartbeatWrite(
      {
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI,
        functionName: "heartbeat",
        args: [BigInt(streamId)],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleWithdraw = () => {
    withdrawWrite(
      {
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI,
        functionName: "withdraw",
        args: [BigInt(streamId)],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleResume = () => {
    resumeWrite(
      {
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI,
        functionName: "resume",
        args: [BigInt(streamId)],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleCancel = () => {
    cancelWrite(
      {
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI,
        functionName: "cancel",
        args: [BigInt(streamId)],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleTopUpApprove = () => {
    const parsed = parseUnits(topUpAmount, 6);
    approveTopUpWrite(
      {
        address: CONTRACTS.USDC,
        abi: USDCABI,
        functionName: "approve",
        args: [CONTRACTS.STREAM_ESCROW, parsed],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  const handleTopUp = () => {
    const parsed = parseUnits(topUpAmount, 6);
    topUpWrite(
      {
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI,
        functionName: "topUp",
        args: [BigInt(streamId), parsed],
        chainId: arcTestnet.id,
      },
      { onError: (err) => addToast(parseContractError(err), "error") }
    );
  };

  return (
    <div className="card" style={{ marginBottom: "0.75rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>Stream #{streamId}</strong>
          <span style={{ marginLeft: "0.75rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
            {isClient ? "You are client" : isProvider ? "You are provider" : ""}
          </span>
        </div>
        <span
          style={{
            padding: "0.15rem 0.5rem",
            borderRadius: "0.25rem",
            fontSize: "0.7rem",
            fontWeight: 600,
            ...(STATUS_BADGE_STYLES[statusLabel] ?? {}),
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Details row */}
      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.35rem", flexWrap: "wrap" }}>
        <span>Deposit: {formatUnits(s.deposit, 6)} USDC</span>
        <span>Duration: {(totalDuration / 3600).toFixed(1)}h</span>
        <span>HB: {Number(s.heartbeatInterval)}s</span>
      </div>

      {/* Addresses */}
      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.25rem", flexWrap: "wrap" }}>
        <span>Client: {s.client.slice(0, 6)}...{s.client.slice(-4)} (Agent #{Number(s.clientAgentId)})</span>
        <span>Provider: {s.provider.slice(0, 6)}...{s.provider.slice(-4)} (Agent #{Number(s.providerAgentId)})</span>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
          <span>{progress.toFixed(1)}% elapsed</span>
          <span>{Math.max(0, Math.ceil((endTime - now) / 3600))}h remaining</span>
        </div>
        <div
          style={{
            width: "100%",
            height: "6px",
            background: "var(--border)",
            borderRadius: "3px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: s.status === 1 ? "var(--yellow, #e6a700)" : "var(--green)",
              borderRadius: "3px",
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Balances */}
      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.8rem", marginTop: "0.5rem" }}>
        <span>
          Claimable: <strong style={{ color: "var(--green)" }}>
            {claimable !== undefined ? formatUnits(claimable as bigint, 6) : "--"} USDC
          </strong>
        </span>
        <span>
          Remaining: <strong>
            {remaining !== undefined ? formatUnits(remaining as bigint, 6) : "--"} USDC
          </strong>
        </span>
        <span style={{ color: "var(--text-dim)" }}>
          Withdrawn: {formatUnits(s.withdrawn, 6)} USDC
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
        {/* Provider actions */}
        {isProvider && s.status === 0 && (
          <button className="btn btn-sm" onClick={handleHeartbeat} disabled={isHeartbeating}>
            {isHeartbeating ? "Sending..." : "Heartbeat"}
          </button>
        )}
        {isProvider && (s.status === 0 || s.status === 2) && (
          <button className="btn btn-sm" onClick={handleWithdraw} disabled={isWithdrawing}>
            {isWithdrawing ? "Withdrawing..." : "Withdraw"}
          </button>
        )}
        {isProvider && s.status === 1 && (
          <button className="btn btn-sm" onClick={handleResume} disabled={isResuming}>
            {isResuming ? "Resuming..." : "Resume"}
          </button>
        )}

        {/* Client actions */}
        {isClient && (s.status === 0 || s.status === 1) && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowTopUp(!showTopUp)}
          >
            Top Up
          </button>
        )}
        {isClient && (s.status === 0 || s.status === 1) && (
          <button
            className="btn btn-outline btn-sm"
            style={{ borderColor: "var(--red)", color: "var(--red)" }}
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
          </button>
        )}
      </div>

      {/* Top-up form */}
      {showTopUp && (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
          <div className="form-group" style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem" }}>Top-up Amount (USDC)</label>
            <input
              type="text"
              placeholder="e.g., 50"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginRight: "0.5rem" }}>
              <span style={{ opacity: topUpStep >= 1 ? 1 : 0.4 }}>1. Approve</span>
              {" → "}
              <span style={{ opacity: topUpStep >= 2 ? 1 : 0.4 }}>2. Top Up</span>
            </div>
            {topUpStep === 1 ? (
              <button
                className="btn btn-sm"
                onClick={handleTopUpApprove}
                disabled={isApprovingTopUp || !topUpAmount || Number(topUpAmount) <= 0}
              >
                {isApprovingTopUp ? "Approving..." : "Approve"}
              </button>
            ) : (
              <button
                className="btn btn-sm"
                onClick={handleTopUp}
                disabled={isToppingUp || !topUpAmount || Number(topUpAmount) <= 0}
              >
                {isToppingUp ? "Topping up..." : "Top Up"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Streams Tab ----

export function Streams() {
  const { address } = useAccount();

  // Fetch client stream IDs
  const { data: clientIds, isLoading: isLoadingClient } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "getClientStreams",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.STREAM_ESCROW },
  });

  // Fetch provider stream IDs
  const { data: providerIds, isLoading: isLoadingProvider } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "getProviderStreams",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && !!CONTRACTS.STREAM_ESCROW },
  });

  // Merge and deduplicate IDs
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
        <CreateStreamForm />
        <div className="empty" style={{ marginTop: "1rem" }}>Connect wallet to view your streams.</div>
      </div>
    );
  }

  if (!CONTRACTS.STREAM_ESCROW) {
    return <div className="empty">StreamEscrow address not configured.</div>;
  }

  return (
    <div>
      <CreateStreamForm />

      <h3 style={{ margin: "1.5rem 0 0.75rem" }}>My Streams</h3>

      {isLoading ? (
        <Skeleton lines={4} />
      ) : allIds.length === 0 ? (
        <div className="empty">No streams found. Create one above to get started.</div>
      ) : (
        allIds.map((id) => (
          <StreamCard key={id} streamId={id} address={address} />
        ))
      )}
    </div>
  );
}
