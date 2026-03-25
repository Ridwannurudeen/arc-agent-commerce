"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, keccak256, toHex } from "viem";
import { injected } from "wagmi/connectors";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";

const CAPABILITY_NAMES: [string, string][] = [
  ["smart_contract_audit", "Smart Contract Audit"],
  ["data_analysis", "Data Analysis"],
  ["code_review", "Code Review"],
  ["price_monitoring", "Price Monitoring"],
];
const KNOWN_CAPABILITIES = Object.fromEntries(
  CAPABILITY_NAMES.map(([raw, display]) => [keccak256(toHex(raw)), display])
);
function capabilityName(hash: string): string {
  return KNOWN_CAPABILITIES[hash.toLowerCase()] ?? `${hash.slice(0, 10)}...`;
}

type Tab = "services" | "agreements" | "list-service" | "create-agreement" | "activity";

type Prefill = {
  provider: string;
  providerAgentId: string;
  amount: string;
};

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [tab, setTab] = useState<Tab>("services");
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  const handleHire = (provider: string, agentId: string, price: string) => {
    setPrefill({ provider, providerAgentId: agentId, amount: price });
    setTab("create-agreement");
  };

  return (
    <>
      <header>
        <h1>
          Agent Commerce <span>Protocol</span>
        </h1>
        <div className="flex-row">
          <span className="addr" style={{ fontSize: "0.7rem" }}>
            Arc Testnet
          </span>
          {isConnected ? (
            <div className="flex-row">
              <span className="addr">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="connect-btn"
              onClick={() => connect({ connector: injected() })}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <div className="container">
        <Stats />

        <div className="tabs">
          {(
            [
              ["services", "Browse Services"],
              ["agreements", "My Agreements"],
              ["list-service", "List Service"],
              ["create-agreement", "Create Agreement"],
              ["activity", "Activity Feed"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "services" && <BrowseServices onHire={handleHire} />}
        {tab === "agreements" && <MyAgreements />}
        {tab === "list-service" && <ListService />}
        {tab === "create-agreement" && <CreateAgreement prefill={prefill} />}
        {tab === "activity" && <ActivityFeed />}
      </div>
    </>
  );
}

function Stats() {
  const { data: nextServiceId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const { data: nextAgreementId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const { data: totalFees } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "totalFeesCollected",
    chainId: arcTestnet.id,
  });

  return (
    <div className="stats">
      <div className="stat-card">
        <div className="label">Services Listed</div>
        <div className="value">{nextServiceId?.toString() ?? "—"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Agreements Created</div>
        <div className="value">{nextAgreementId?.toString() ?? "—"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Protocol Fees (USDC)</div>
        <div className="value">
          {totalFees ? formatUnits(totalFees as bigint, 6) : "—"}
        </div>
      </div>
      <div className="stat-card">
        <div className="label">Network</div>
        <div className="value" style={{ fontSize: "1rem" }}>
          Arc Testnet
        </div>
      </div>
    </div>
  );
}

function BrowseServices({ onHire }: { onHire: (provider: string, agentId: string, price: string) => void }) {
  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const count = Number(nextId ?? 0);

  if (count === 0) {
    return <div className="empty">No services listed yet. Be the first to list one.</div>;
  }

  return (
    <div className="service-list">
      {Array.from({ length: count }, (_, i) => (
        <ServiceCard key={i} serviceId={i} onHire={onHire} />
      ))}
    </div>
  );
}

function ServiceCard({ serviceId, onHire }: { serviceId: number; onHire: (provider: string, agentId: string, price: string) => void }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as {
    agentId: bigint;
    provider: string;
    capabilityHash: string;
    pricePerTask: bigint;
    metadataURI: string;
    active: boolean;
  };

  if (!svc.active) return null;

  const priceStr = formatUnits(svc.pricePerTask, 6);

  return (
    <div className="service-item">
      <div className="info">
        <h4>{capabilityName(svc.capabilityHash)}</h4>
        <div className="meta">
          Service #{serviceId} &middot; Agent #{svc.agentId.toString()} &middot;{" "}
          <span className="addr">
            {svc.provider.slice(0, 6)}...{svc.provider.slice(-4)}
          </span>
        </div>
        <div className="meta" style={{ marginTop: "0.25rem" }}>
          {svc.metadataURI}
        </div>
      </div>
      <div className="flex-row">
        <div className="price">{priceStr} USDC</div>
        <button
          className="btn btn-sm"
          onClick={() => onHire(svc.provider, svc.agentId.toString(), priceStr)}
        >
          Hire
        </button>
      </div>
    </div>
  );
}

function MyAgreements() {
  const { address } = useAccount();
  const [view, setView] = useState<"client" | "provider">("client");

  const { data: clientIds } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getClientAgreements",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
  });

  const { data: providerIds } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getProviderAgreements",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
  });

  const cIds = (clientIds as bigint[]) ?? [];
  const pIds = (providerIds as bigint[]) ?? [];
  const ids = view === "client" ? cIds : pIds;

  if (!address) {
    return <div className="empty">Connect wallet to view your agreements.</div>;
  }

  return (
    <div>
      <div className="toggle-row">
        <button
          className={`toggle-btn ${view === "client" ? "active" : ""}`}
          onClick={() => setView("client")}
        >
          As Client ({cIds.length})
        </button>
        <button
          className={`toggle-btn ${view === "provider" ? "active" : ""}`}
          onClick={() => setView("provider")}
        >
          As Provider ({pIds.length})
        </button>
      </div>
      {ids.length === 0 ? (
        <div className="empty">No agreements as {view}.</div>
      ) : (
        ids.map((id) => (
          <AgreementCard key={id.toString()} agreementId={Number(id)} />
        ))
      )}
    </div>
  );
}

function AgreementCard({ agreementId }: { agreementId: number }) {
  const { address } = useAccount();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash });

  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const agr = data as {
    client: string;
    provider: string;
    providerAgentId: bigint;
    clientAgentId: bigint;
    amount: bigint;
    deadline: bigint;
    taskHash: string;
    serviceId: bigint;
    status: number;
  };

  const statusLabels = ["active", "completed", "disputed", "expired", "resolved"];
  const statusLabel = statusLabels[agr.status] ?? "unknown";
  const isClient = address?.toLowerCase() === agr.client.toLowerCase();
  const isActive = agr.status === 0;

  return (
    <div className="agreement-item">
      <div className="row">
        <span className="label">Agreement #{agreementId}</span>
        <span className={`status ${statusLabel}`}>{statusLabel.toUpperCase()}</span>
      </div>
      <div className="row">
        <span className="label">Amount</span>
        <span>{formatUnits(agr.amount, 6)} USDC</span>
      </div>
      <div className="row">
        <span className="label">Provider</span>
        <span className="addr">
          {agr.provider.slice(0, 6)}...{agr.provider.slice(-4)}
        </span>
      </div>
      <div className="row">
        <span className="label">Client Agent</span>
        <span>#{agr.clientAgentId.toString()}</span>
      </div>
      <div className="row">
        <span className="label">Provider Agent</span>
        <span>#{agr.providerAgentId.toString()}</span>
      </div>
      <div className="row">
        <span className="label">Deadline</span>
        <span>{new Date(Number(agr.deadline) * 1000).toLocaleString()}</span>
      </div>
      {isActive && isClient && (
        <div className="actions">
          <button
            className="btn btn-sm"
            disabled={isLoading}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "confirmCompletion",
                args: [BigInt(agreementId)],
                chainId: arcTestnet.id,
              })
            }
          >
            {isLoading ? "Confirming..." : "Confirm Complete"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoading}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SERVICE_ESCROW,
                abi: ServiceEscrowABI,
                functionName: "dispute",
                args: [BigInt(agreementId)],
                chainId: arcTestnet.id,
              })
            }
          >
            Dispute
          </button>
        </div>
      )}
    </div>
  );
}

function ListService() {
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

function CreateAgreement({ prefill }: { prefill: Prefill | null }) {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { writeContract: approveWrite, data: approveHash } = useWriteContract();
  const { isLoading: isApproving } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const [provider, setProvider] = useState(prefill?.provider ?? "");
  const [providerAgentId, setProviderAgentId] = useState(prefill?.providerAgentId ?? "");
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [taskDesc, setTaskDesc] = useState("");

  // Update fields when prefill changes
  useEffect(() => {
    if (prefill) {
      setProvider(prefill.provider);
      setProviderAgentId(prefill.providerAgentId);
      setAmount(prefill.amount);
    }
  }, [prefill]);

  const handleApprove = () => {
    approveWrite({
      address: CONTRACTS.USDC,
      abi: [
        {
          name: "approve",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "approve",
      args: [CONTRACTS.SERVICE_ESCROW, parseUnits(amount || "0", 6)],
      chainId: arcTestnet.id,
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600
    );
    writeContract({
      address: CONTRACTS.SERVICE_ESCROW,
      abi: ServiceEscrowABI,
      functionName: "createAgreement",
      args: [
        provider as `0x${string}`,
        BigInt(providerAgentId),
        BigInt(0), // human client
        parseUnits(amount, 6),
        deadline,
        keccak256(toHex(taskDesc)),
        BigInt(0), // direct agreement
      ],
      chainId: arcTestnet.id,
    });
  };

  return (
    <div className="card">
      <h3>Create Service Agreement</h3>
      <form onSubmit={handleCreate}>
        <div className="form-group">
          <label>Provider Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Provider Agent ID (ERC-8004)</label>
          <input
            type="number"
            placeholder="e.g., 2"
            value={providerAgentId}
            onChange={(e) => setProviderAgentId(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Amount (USDC)</label>
          <input
            type="text"
            placeholder="e.g., 50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Deadline (hours from now)</label>
          <input
            type="number"
            placeholder="24"
            value={deadlineHours}
            onChange={(e) => setDeadlineHours(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Task Description</label>
          <input
            type="text"
            placeholder="Audit my contract at 0x1234..."
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            required
          />
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleApprove}
            disabled={isApproving || !amount}
          >
            {isApproving ? "Approving..." : "1. Approve USDC"}
          </button>
          <button className="btn" type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "2. Create Agreement"}
          </button>
        </div>
        {isSuccess && (
          <div style={{ marginTop: "0.75rem", color: "var(--green)" }}>
            Agreement created! Check My Agreements tab.
          </div>
        )}
      </form>
    </div>
  );
}

function ActivityFeedItem({ agreementId }: { agreementId: number }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const agr = data as {
    client: string;
    provider: string;
    providerAgentId: bigint;
    clientAgentId: bigint;
    amount: bigint;
    deadline: bigint;
    taskHash: string;
    serviceId: bigint;
    status: number;
  };

  const statusLabels = ["active", "completed", "disputed", "expired", "resolved"];
  const statusLabel = statusLabels[agr.status] ?? "unknown";

  return (
    <div className="agreement-item">
      <div className="row">
        <span className="label">Agreement #{agreementId}</span>
        <span className={`status ${statusLabel}`}>{statusLabel.toUpperCase()}</span>
      </div>
      <div className="row">
        <span className="label">Amount</span>
        <span>{formatUnits(agr.amount, 6)} USDC</span>
      </div>
      <div className="row">
        <span className="label">Client</span>
        <span>
          <span className="addr">{agr.client.slice(0, 6)}...{agr.client.slice(-4)}</span>
          {" "}(Agent #{agr.clientAgentId.toString()})
        </span>
      </div>
      <div className="row">
        <span className="label">Provider</span>
        <span>
          <span className="addr">{agr.provider.slice(0, 6)}...{agr.provider.slice(-4)}</span>
          {" "}(Agent #{agr.providerAgentId.toString()})
        </span>
      </div>
    </div>
  );
}

function ActivityFeed() {
  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const count = Number(nextId ?? 0);

  if (count === 0) {
    return <div className="empty">No protocol activity yet.</div>;
  }

  // Show newest first
  const ids = Array.from({ length: count }, (_, i) => count - 1 - i);

  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "1rem" }}>
        All protocol agreements (newest first)
      </div>
      {ids.map((id) => (
        <ActivityFeedItem key={id} agreementId={id} />
      ))}
    </div>
  );
}
