"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, keccak256, toHex } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";

export function ListService() {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [agentId, setAgentId] = useState("");
  const [capability, setCapability] = useState("");
  const [price, setPrice] = useState("");
  const [metadataURI, setMetadataURI] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    writeContract({
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
    });
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
        </div>
        <button className="btn" type="submit" disabled={isLoading}>
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
