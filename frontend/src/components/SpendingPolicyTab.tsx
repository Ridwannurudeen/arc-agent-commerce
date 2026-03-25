"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import SpendingPolicyABI from "@/abi/SpendingPolicy.json";
import type { PolicyData } from "@/lib/types";

export function SpendingPolicyTab() {
  const { address } = useAccount();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });

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
    return <div className="empty">Connect wallet to manage spending policies.</div>;
  }

  return (
    <div>
      {/* Current Policy Display */}
      <div className="card">
        <h3>Current Policy</h3>
        <div className="form-group">
          <label>Agent Address (leave empty for your wallet)</label>
          <input
            type="text"
            placeholder={address}
            value={viewAddr}
            onChange={(e) => setViewAddr(e.target.value)}
          />
        </div>
        {policy?.exists ? (
          <div className="policy-card">
            <div className="policy-stat">
              <span className="label">Max Per Transaction</span>
              <span>{formatUnits(policy.maxPerTx, 6)} USDC</span>
            </div>
            <div className="policy-stat">
              <span className="label">Max Daily</span>
              <span>{formatUnits(policy.maxDaily, 6)} USDC</span>
            </div>
            <div className="policy-stat">
              <span className="label">Spent Today</span>
              <span>{formatUnits(policy.dailySpent, 6)} USDC</span>
            </div>
            <div className="policy-stat">
              <span className="label">Remaining Today</span>
              <span>{remaining ? formatUnits(remaining as bigint, 6) : "—"} USDC</span>
            </div>
            <div className="policy-stat">
              <span className="label">Counterparty Restricted</span>
              <span>{restricted ? "Yes" : "No"}</span>
            </div>
          </div>
        ) : (
          <div className="empty" style={{ padding: "1rem" }}>No policy set for this address.</div>
        )}
      </div>

      {/* Set Policy */}
      <div className="card">
        <h3>Set Spending Policy</h3>
        <div className="form-group">
          <label>Agent Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={agentAddr}
            onChange={(e) => setAgentAddr(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Max Per Transaction (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 100"
            value={maxPerTx}
            onChange={(e) => setMaxPerTx(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Max Daily (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 500"
            value={maxDaily}
            onChange={(e) => setMaxDaily(e.target.value)}
            required
          />
        </div>
        <button
          className="btn"
          disabled={isLoading || !agentAddr || !maxPerTx || !maxDaily}
          onClick={() =>
            writeContract({
              address: CONTRACTS.SPENDING_POLICY,
              abi: SpendingPolicyABI,
              functionName: "setPolicy",
              args: [
                agentAddr as `0x${string}`,
                parseUnits(maxPerTx, 6),
                parseUnits(maxDaily, 6),
              ],
              chainId: arcTestnet.id,
            })
          }
        >
          {isLoading ? "Setting..." : "Set Policy"}
        </button>
      </div>

      {/* Counterparty Restrictions */}
      <div className="card">
        <h3>Counterparty Restrictions</h3>
        <div className="form-group">
          <label>Agent Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={cpAgentAddr}
            onChange={(e) => setCpAgentAddr(e.target.value)}
          />
        </div>
        <div className="actions" style={{ marginBottom: "1rem" }}>
          <button
            className="btn btn-sm"
            disabled={isLoading || !cpAgentAddr}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SPENDING_POLICY,
                abi: SpendingPolicyABI,
                functionName: "setCounterpartyRestriction",
                args: [cpAgentAddr as `0x${string}`, true],
                chainId: arcTestnet.id,
              })
            }
          >
            Enable Restriction
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoading || !cpAgentAddr}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SPENDING_POLICY,
                abi: SpendingPolicyABI,
                functionName: "setCounterpartyRestriction",
                args: [cpAgentAddr as `0x${string}`, false],
                chainId: arcTestnet.id,
              })
            }
          >
            Disable Restriction
          </button>
        </div>
        <div className="form-group">
          <label>Counterparty Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
          />
        </div>
        {cpAgentAddr && counterparty && (
          <div style={{ fontSize: "0.8rem", marginBottom: "0.75rem", color: cpAllowed ? "var(--green)" : "var(--text-dim)" }}>
            {cpAllowed ? "Allowed" : "Not allowed"}
          </div>
        )}
        <div className="actions">
          <button
            className="btn btn-sm"
            disabled={isLoading || !cpAgentAddr || !counterparty}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SPENDING_POLICY,
                abi: SpendingPolicyABI,
                functionName: "setAllowedCounterparty",
                args: [cpAgentAddr as `0x${string}`, counterparty as `0x${string}`, true],
                chainId: arcTestnet.id,
              })
            }
          >
            Allow
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoading || !cpAgentAddr || !counterparty}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SPENDING_POLICY,
                abi: SpendingPolicyABI,
                functionName: "setAllowedCounterparty",
                args: [cpAgentAddr as `0x${string}`, counterparty as `0x${string}`, false],
                chainId: arcTestnet.id,
              })
            }
          >
            Revoke
          </button>
        </div>
      </div>

      {/* Policy Check Preview */}
      <div className="card">
        <h3>Policy Check Preview</h3>
        <div className="form-group">
          <label>Agent Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={checkAddr}
            onChange={(e) => setCheckAddr(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Amount (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 50"
            value={checkAmount}
            onChange={(e) => setCheckAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Counterparty Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={checkCounterparty}
            onChange={(e) => setCheckCounterparty(e.target.value)}
          />
        </div>
        {checkAddr && hasCheckAmount && checkCounterparty && (
          <div className={wouldPassResult ? "success-banner" : "warning-banner"}>
            {wouldPassResult
              ? "PASS — This transaction would be allowed by the policy."
              : "FAIL — This transaction would be blocked by the policy."}
          </div>
        )}
      </div>
    </div>
  );
}
