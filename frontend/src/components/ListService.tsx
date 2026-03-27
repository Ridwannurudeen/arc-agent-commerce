"use client";

import { useState, useEffect, useMemo } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, keccak256, toHex } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";

export function ListService() {
  const { addToast } = useToast();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [agentId, setAgentId] = useState("");
  const [capability, setCapability] = useState("");
  const [price, setPrice] = useState("");
  const [metadataURI, setMetadataURI] = useState("");

  useEffect(() => {
    if (isSuccess && hash) {
      addToast("Service listed successfully", "success", hash);
    }
  }, [isSuccess, hash, addToast]);

  // Validation
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (price) {
      const num = Number(price);
      if (isNaN(num) || num <= 0) {
        errors.price = "Price must be greater than zero";
      } else {
        const parts = price.split(".");
        if (parts[1] && parts[1].length > 6) {
          errors.price = "USDC supports max 6 decimal places";
        }
      }
    }
    if (metadataURI !== undefined && metadataURI.trim() === "" && metadataURI.length > 0) {
      errors.metadata = "Metadata URI cannot be empty whitespace";
    }
    return errors;
  }, [price, metadataURI]);

  const hasErrors = Object.keys(validation).length > 0;
  const canSubmit = !!agentId && !!capability && !!price && !!metadataURI && !hasErrors;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    writeContract(
      {
        address: CONTRACTS.SERVICE_MARKET,
        abi: ServiceMarketABI,
        functionName: "listService",
        args: [
          BigInt(agentId),
          keccak256(toHex(capability)),
          parseUnits(price, 6),
          metadataURI,
        ],
        chainId: arcTestnet.id,
      },
      {
        onError: (err) => addToast(parseContractError(err), "error"),
      }
    );
  };

  return (
    <div className="card">
      <h3>List a New Service</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Your Agent ID (ERC-8004)</label>
          <input
            type="number"
            placeholder="e.g., 1"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Capability</label>
          <input
            type="text"
            placeholder="e.g., smart_contract_audit"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Price per Task (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 50"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          {validation.price && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.price}</span>
          )}
        </div>
        <div className="form-group">
          <label>Metadata URI</label>
          <input
            type="text"
            placeholder="ipfs://..."
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            required
          />
          {validation.metadata && (
            <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{validation.metadata}</span>
          )}
        </div>
        <button className="btn" type="submit" disabled={isLoading || !canSubmit}>
          {isLoading ? "Listing..." : "List Service"}
        </button>
        {isSuccess && (
          <span style={{ marginLeft: "1rem", color: "var(--green)" }}>
            Service listed!
          </span>
        )}
      </form>
    </div>
  );
}
