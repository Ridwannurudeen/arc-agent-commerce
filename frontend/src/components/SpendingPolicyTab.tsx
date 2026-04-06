"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import SpendingPolicyABI from "@/abi/SpendingPolicy.json";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import type { PolicyData } from "@/lib/types";
import { motion } from "framer-motion";
import { Shield, CircleDollarSign, Users, CheckCircle2, XCircle, Wallet, ArrowRight, Eye } from "lucide-react";

export function SpendingPolicyTab() {
  const { address } = useAccount();
  const { addToast } = useToast();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess && hash) {
      addToast("Spending policy updated", "success", hash);
    }
  }, [isSuccess, hash, addToast]);

  // Set Policy form
  const [agentAddr, setAgentAddr] = useState("");
  const [maxPerTx, setMaxPerTx] = useState("");
  const [maxDaily, setMaxDaily] = useState("");

  // Counterparty form
  const [cpAgentAddr, setCpAgentAddr] = useState("");
  const [counterparty, setCounterparty] = useState("");

  // Check form
  const [checkAddr, setCheckAddr] = useState("");
  const [checkAmount, setCheckAmount] = useState("");
  const [checkCounterparty, setCheckCounterparty] = useState("");

  // View policy
  const [viewAddr, setViewAddr] = useState("");
  const queryAddr = viewAddr || address || "";

  const { data: policyData } = useReadContract({
    address: CONTRACTS.SPENDING_POLICY,
    abi: SpendingPolicyABI,
    functionName: "policies",
    args: queryAddr ? [queryAddr as `0x${string}`] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!queryAddr },
  });

  const { data: remaining } = useReadContract({
    address: CONTRACTS.SPENDING_POLICY,
    abi: SpendingPolicyABI,
    functionName: "dailyRemaining",
    args: queryAddr ? [queryAddr as `0x${string}`] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!queryAddr },
  });

  const { data: restricted } = useReadContract({
    address: CONTRACTS.SPENDING_POLICY,
    abi: SpendingPolicyABI,
    functionName: "counterpartyRestricted",
    args: queryAddr ? [queryAddr as `0x${string}`] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!queryAddr },
  });

  const policy = policyData as unknown as PolicyData | undefined;

  // wouldPass check
  const checkParsed = checkAmount ? parseUnits(checkAmount, 6) : BigInt(0);
  const hasCheckAmount = checkParsed > BigInt(0);
  const { data: wouldPassResult } = useReadContract({
    address: CONTRACTS.SPENDING_POLICY,
    abi: SpendingPolicyABI,
    functionName: "wouldPass",
    args:
      checkAddr && hasCheckAmount && checkCounterparty
        ? [checkAddr as `0x${string}`, checkParsed, checkCounterparty as `0x${string}`]
        : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!checkAddr && hasCheckAmount && !!checkCounterparty },
  });

  // Counterparty check
  const { data: cpAllowed } = useReadContract({
    address: CONTRACTS.SPENDING_POLICY,
    abi: SpendingPolicyABI,
    functionName: "allowedCounterparties",
    args:
      cpAgentAddr && counterparty
        ? [cpAgentAddr as `0x${string}`, counterparty as `0x${string}`]
        : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!cpAgentAddr && !!counterparty },
  });

  if (!address) {
    return (
      <div className="empty-state">
        <Wallet size={40} className="empty-icon" />
        <p>Connect wallet to manage spending policies.</p>
      </div>
    );
  }

  // Calculate spending progress
  const dailySpent = policy?.exists ? Number(formatUnits(policy.dailySpent, 6)) : 0;
  const dailyMax = policy?.exists ? Number(formatUnits(policy.maxDaily, 6)) : 0;
  const spendingPct = dailyMax > 0 ? Math.min(100, (dailySpent / dailyMax) * 100) : 0;

  return (
    <div>
      <div className="section-header">
        <h2>Spending Policies</h2>
        <p className="section-subtitle">Configure agent spending limits and counterparty restrictions</p>
      </div>

      {/* Current Policy Display */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Eye size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Current Policy</span>
        </div>

        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label>Agent Address (leave empty for your wallet)</label>
          <input className="glass-input" type="text" placeholder={address} value={viewAddr} onChange={(e) => setViewAddr(e.target.value)} />
        </div>

        {policy?.exists ? (
          <>
            {/* Dashboard cards */}
            <div className="policy-dashboard">
              <div className="policy-dash-card">
                <div className="dash-label">Max Per Transaction</div>
                <div className="dash-value">{formatUnits(policy.maxPerTx, 6)} <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>USDC</span></div>
              </div>
              <div className="policy-dash-card">
                <div className="dash-label">Max Daily</div>
                <div className="dash-value">{formatUnits(policy.maxDaily, 6)} <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>USDC</span></div>
              </div>
              <div className="policy-dash-card">
                <div className="dash-label">Spent Today</div>
                <div className="dash-value" style={{ color: spendingPct > 80 ? "var(--red)" : spendingPct > 50 ? "var(--yellow)" : "var(--green)" }}>
                  {formatUnits(policy.dailySpent, 6)} <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>USDC</span>
                </div>
              </div>
              <div className="policy-dash-card">
                <div className="dash-label">Counterparty Restricted</div>
                <div className="dash-value">
                  {restricted ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--yellow)" }}>
                      <Shield size={16} /> Yes
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-dim)" }}>No</span>
                  )}
                </div>
              </div>
            </div>

            {/* Spending progress bar */}
            <div style={{ marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                <span>Daily spending: {dailySpent.toFixed(2)} / {dailyMax.toFixed(2)} USDC</span>
                <span>{remaining ? formatUnits(remaining as bigint, 6) : "--"} remaining</span>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${spendingPct > 80 ? "" : "green"}`}
                  style={{
                    width: `${spendingPct}%`,
                    background: spendingPct > 80 ? "var(--red)" : spendingPct > 50 ? "var(--yellow)" : undefined,
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: "1.5rem" }}>
            <Shield size={32} className="empty-icon" />
            <p>No policy set for this address</p>
          </div>
        )}
      </motion.div>

      {/* Set Policy */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Shield size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Set Spending Policy</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          <div className="form-group">
            <label>Agent Address</label>
            <input className="glass-input" type="text" placeholder="0x..." value={agentAddr} onChange={(e) => setAgentAddr(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Max Per Transaction (USDC)</label>
            <input className="glass-input" type="text" placeholder="e.g., 100" value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Max Daily (USDC)</label>
            <input className="glass-input" type="text" placeholder="e.g., 500" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)} required />
          </div>
        </div>

        {maxPerTx && maxDaily && Number(maxPerTx) > Number(maxDaily) && (
          <div className="warning-banner" style={{ marginBottom: "0.75rem" }}>Max Per Transaction cannot exceed Max Daily limit.</div>
        )}
        {maxPerTx && Number(maxPerTx) <= 0 && (
          <div className="warning-banner" style={{ marginBottom: "0.75rem" }}>Max Per Transaction must be greater than 0.</div>
        )}

        <button
          className="btn-primary"
          disabled={
            isLoading || !agentAddr || !maxPerTx || !maxDaily ||
            Number(maxPerTx) <= 0 || Number(maxDaily) <= 0 ||
            Number(maxPerTx) > Number(maxDaily)
          }
          onClick={() =>
            writeContract(
              {
                address: CONTRACTS.SPENDING_POLICY,
                abi: SpendingPolicyABI,
                functionName: "setPolicy",
                args: [agentAddr as `0x${string}`, parseUnits(maxPerTx, 6), parseUnits(maxDaily, 6)],
                chainId: arcTestnet.id,
              },
              { onError: (err) => addToast(parseContractError(err), "error") }
            )
          }
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <ArrowRight size={14} /> {isLoading ? "Setting..." : "Set Policy"}
        </button>
      </motion.div>

      {/* Counterparty Restrictions */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Users size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Counterparty Restrictions</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="form-group">
            <label>Agent Address</label>
            <input className="glass-input" type="text" placeholder="0x..." value={cpAgentAddr} onChange={(e) => setCpAgentAddr(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Counterparty Address</label>
            <input className="glass-input" type="text" placeholder="0x..." value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>
        </div>

        {cpAgentAddr && counterparty && (
          <div style={{ marginBottom: "0.75rem" }}>
            <span className={`pill ${cpAllowed ? "pill-green" : "pill-red"}`}>
              {cpAllowed ? <><CheckCircle2 size={12} /> Allowed</> : <><XCircle size={12} /> Not allowed</>}
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            className="btn-primary"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
            disabled={isLoading || !cpAgentAddr}
            onClick={() =>
              writeContract(
                { address: CONTRACTS.SPENDING_POLICY, abi: SpendingPolicyABI, functionName: "setCounterpartyRestriction", args: [cpAgentAddr as `0x${string}`, true], chainId: arcTestnet.id },
                { onError: (err) => addToast(parseContractError(err), "error") }
              )
            }
          >
            Enable Restriction
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoading || !cpAgentAddr}
            onClick={() =>
              writeContract(
                { address: CONTRACTS.SPENDING_POLICY, abi: SpendingPolicyABI, functionName: "setCounterpartyRestriction", args: [cpAgentAddr as `0x${string}`, false], chainId: arcTestnet.id },
                { onError: (err) => addToast(parseContractError(err), "error") }
              )
            }
          >
            Disable Restriction
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-primary"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
            disabled={isLoading || !cpAgentAddr || !counterparty}
            onClick={() =>
              writeContract(
                { address: CONTRACTS.SPENDING_POLICY, abi: SpendingPolicyABI, functionName: "setAllowedCounterparty", args: [cpAgentAddr as `0x${string}`, counterparty as `0x${string}`, true], chainId: arcTestnet.id },
                { onError: (err) => addToast(parseContractError(err), "error") }
              )
            }
          >
            Allow Counterparty
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoading || !cpAgentAddr || !counterparty}
            onClick={() =>
              writeContract(
                { address: CONTRACTS.SPENDING_POLICY, abi: SpendingPolicyABI, functionName: "setAllowedCounterparty", args: [cpAgentAddr as `0x${string}`, counterparty as `0x${string}`, false], chainId: arcTestnet.id },
                { onError: (err) => addToast(parseContractError(err), "error") }
              )
            }
          >
            Revoke
          </button>
        </div>
      </motion.div>

      {/* Policy Check Preview */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <CheckCircle2 size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Policy Check Preview</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          <div className="form-group">
            <label>Agent Address</label>
            <input className="glass-input" type="text" placeholder="0x..." value={checkAddr} onChange={(e) => setCheckAddr(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Amount (USDC)</label>
            <input className="glass-input" type="text" placeholder="e.g., 50" value={checkAmount} onChange={(e) => setCheckAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Counterparty Address</label>
            <input className="glass-input" type="text" placeholder="0x..." value={checkCounterparty} onChange={(e) => setCheckCounterparty(e.target.value)} />
          </div>
        </div>

        {checkAddr && hasCheckAmount && checkCounterparty && (
          <div className={wouldPassResult ? "success-banner" : "warning-banner"}>
            {wouldPassResult ? (
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <CheckCircle2 size={16} /> PASS -- This transaction would be allowed by the policy.
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <XCircle size={16} /> FAIL -- This transaction would be blocked by the policy.
              </span>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
