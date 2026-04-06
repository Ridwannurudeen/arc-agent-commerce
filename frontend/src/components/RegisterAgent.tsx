"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { CAPABILITY_NAMES } from "@/lib/constants";
import { keccak256, toHex } from "viem";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import { motion } from "framer-motion";
import { UserPlus, ShoppingBag, CheckCircle2, Wallet, ArrowRight } from "lucide-react";

export function RegisterAgent() {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  const { data: agentBalance } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "balanceOf",
    args: [address!],
    chainId: arcTestnet.id,
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
      <div className="empty-state">
        <Wallet size={40} className="empty-icon" />
        <p>Connect your wallet to register an agent.</p>
      </div>
    );
  }

  const step1Done = registeredAgentId !== null || Number(agentBalance ?? 0) > 0;

  return (
    <div>
      <div className="section-header">
        <h2>Register Agent</h2>
        <p className="section-subtitle">Create an on-chain agent identity (ERC-8004) and list your services</p>
      </div>

      {/* Step Indicator */}
      <div className="step-bar" style={{ maxWidth: "360px", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className={`step-node ${step1Done ? "completed" : "active"}`}>
            {step1Done ? <CheckCircle2 size={16} /> : "1"}
          </div>
          <span className={`step-label ${step1Done ? "completed" : "active"}`}>Register Identity</span>
        </div>
        <div className={`step-connector ${step1Done ? "completed" : ""}`} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className={`step-node ${step1Done ? "active" : ""} ${listSuccess ? "completed" : ""}`}>
            {listSuccess ? <CheckCircle2 size={16} /> : "2"}
          </div>
          <span className={`step-label ${step1Done ? "active" : ""} ${listSuccess ? "completed" : ""}`}>List Service</span>
        </div>
      </div>

      {/* Step 1 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
        style={{ marginBottom: "1rem" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <UserPlus size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Step 1 -- Register Agent Identity</span>
        </div>

        {Number(agentBalance ?? 0) > 0 && (
          <div className="success-banner" style={{ marginBottom: "0.75rem" }}>
            You have {Number(agentBalance)} agent(s) registered. You can register more or skip to listing a service.
          </div>
        )}

        <div className="form-group">
          <label>Metadata URI (optional)</label>
          <input
            className="glass-input"
            type="text"
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            placeholder="https://example.com/agent-metadata.json"
          />
        </div>

        <button
          className="btn-primary"
          disabled={!!registerHash && !registerSuccess}
          onClick={() => {
            registerAgent({
              address: CONTRACTS.IDENTITY_REGISTRY,
              abi: IdentityRegistryABI,
              functionName: "register",
              args: [metadataURI || ""],
            });
          }}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <UserPlus size={14} />
          {registerHash && !registerSuccess ? "Registering..." : "Register Agent (ERC-8004)"}
        </button>

        {registeredAgentId !== null && (
          <div className="success-banner" style={{ marginTop: "0.75rem" }}>
            Agent #{registeredAgentId} registered successfully.
          </div>
        )}
      </motion.div>

      {/* Step 2 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <ShoppingBag size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Step 2 -- List a Service</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="form-group">
            <label>Agent ID</label>
            <input
              className="glass-input"
              type="number"
              value={registeredAgentId ?? ""}
              onChange={(e) => setRegisteredAgentId(Number(e.target.value) || null)}
              placeholder="Your agent ID from step 1"
            />
          </div>
          <div className="form-group">
            <label>Capability</label>
            <select className="glass-select" value={capability} onChange={(e) => setCapability(e.target.value)}>
              {CAPABILITY_NAMES.map(([raw, display]) => (
                <option key={raw} value={raw}>{display}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Price per task (USDC)</label>
            <input
              className="glass-input"
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
              className="glass-input"
              type="text"
              value={serviceMetadata}
              onChange={(e) => setServiceMetadata(e.target.value)}
              placeholder="What does your agent do?"
            />
          </div>
        </div>

        <button
          className="btn-primary"
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
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <ArrowRight size={14} />
          {listHash && !listSuccess ? "Listing..." : "List Service"}
        </button>

        {listSuccess && (
          <div className="success-banner" style={{ marginTop: "0.75rem" }}>
            Service listed! It will appear in the marketplace.
          </div>
        )}
      </motion.div>
    </div>
  );
}
