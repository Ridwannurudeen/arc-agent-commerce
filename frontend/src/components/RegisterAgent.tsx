"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/config";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { CAPABILITY_NAMES } from "@/lib/constants";
import { keccak256, toHex } from "viem";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";

export function RegisterAgent() {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  const { data: agentBalance } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  // Step 1: Register agent
  const [metadataURI, setMetadataURI] = useState("");
  const { writeContract: registerAgent, data: registerHash, error: registerError, reset: resetRegister } = useWriteContract();
  const { isSuccess: registerSuccess, data: registerReceipt } = useWaitForTransactionReceipt({ hash: registerHash });

  const [registeredAgentId, setRegisteredAgentId] = useState<number | null>(null);

  useEffect(() => {
    if (registerSuccess && registerReceipt) {
      const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
      const transferLog = registerReceipt.logs.find(
        (log) => log.topics[0] === TRANSFER_TOPIC
      );
      if (transferLog && transferLog.topics[3]) {
        const agentId = Number(BigInt(transferLog.topics[3]));
        setRegisteredAgentId(agentId);
        addToast(`Agent #${agentId} registered!`, "success", registerHash);
      }
    }
  }, [registerSuccess, registerReceipt]);

  useEffect(() => {
    if (registerError) {
      addToast(parseContractError(registerError), "error");
      resetRegister();
    }
  }, [registerError]);

  // Step 2: List service
  const [capability, setCapability] = useState(CAPABILITY_NAMES[0][0]);
  const [price, setPrice] = useState("");
  const [serviceMetadata, setServiceMetadata] = useState("");
  const { writeContract: listService, data: listHash, error: listError, reset: resetList } = useWriteContract();
  const { isSuccess: listSuccess } = useWaitForTransactionReceipt({ hash: listHash });

  useEffect(() => {
    if (listSuccess) addToast("Service listed on marketplace!", "success", listHash);
  }, [listSuccess]);

  useEffect(() => {
    if (listError) {
      addToast(parseContractError(listError), "error");
      resetList();
    }
  }, [listError]);

  if (!isConnected) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
        <p style={{ color: "var(--text-dim)" }}>Connect your wallet to register an agent.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Register Agent</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Create an on-chain agent identity (ERC-8004) and list your services on the marketplace.
      </p>

      {/* Step 1 */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Step 1 &mdash; Register Agent Identity</h3>
        {Number(agentBalance ?? 0) > 0 && (
          <p style={{ color: "var(--green)", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
            You have {Number(agentBalance)} agent(s) registered. You can register more or skip to listing a service.
          </p>
        )}
        <div className="form-group">
          <label>Metadata URI (optional)</label>
          <input
            type="text"
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            placeholder="https://example.com/agent-metadata.json"
          />
        </div>
        <button
          className="btn"
          disabled={!!registerHash && !registerSuccess}
          onClick={() => {
            registerAgent({
              address: CONTRACTS.IDENTITY_REGISTRY,
              abi: IdentityRegistryABI,
              functionName: "register",
              args: [metadataURI || ""],
            });
          }}
        >
          {registerHash && !registerSuccess ? "Registering..." : "Register Agent (ERC-8004)"}
        </button>
        {registeredAgentId !== null && (
          <p style={{ marginTop: "0.75rem", color: "var(--green)", fontSize: "0.85rem" }}>
            Agent #{registeredAgentId} registered successfully.
          </p>
        )}
      </div>

      {/* Step 2 */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Step 2 &mdash; List a Service</h3>
        <div className="form-group">
          <label>Agent ID</label>
          <input
            type="number"
            value={registeredAgentId ?? ""}
            onChange={(e) => setRegisteredAgentId(Number(e.target.value) || null)}
            placeholder="Your agent ID from step 1"
          />
        </div>
        <div className="form-group">
          <label>Capability</label>
          <select value={capability} onChange={(e) => setCapability(e.target.value)}>
            {CAPABILITY_NAMES.map(([raw, display]) => (
              <option key={raw} value={raw}>
                {display}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Price per task (USDC)</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 50"
          />
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <input
            type="text"
            value={serviceMetadata}
            onChange={(e) => setServiceMetadata(e.target.value)}
            placeholder="What does your agent do?"
          />
        </div>
        <button
          className="btn"
          disabled={!registeredAgentId || !price || Number(price) <= 0 || (!!listHash && !listSuccess)}
          onClick={() => {
            listService({
              address: CONTRACTS.SERVICE_MARKET,
              abi: ServiceMarketABI,
              functionName: "listService",
              args: [
                BigInt(registeredAgentId!),
                keccak256(toHex(capability)),
                BigInt(Math.round(Number(price) * 1_000_000)),
                serviceMetadata,
              ],
            });
          }}
        >
          {listHash && !listSuccess ? "Listing..." : "List Service"}
        </button>
        {listSuccess && (
          <p style={{ marginTop: "0.75rem", color: "var(--green)", fontSize: "0.85rem" }}>
            Service listed! It will appear in the marketplace.
          </p>
        )}
      </div>
    </div>
  );
}
