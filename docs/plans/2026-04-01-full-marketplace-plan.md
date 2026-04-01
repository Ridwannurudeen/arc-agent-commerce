# Full Two-Sided Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Arc Agent Commerce into a working two-sided marketplace where providers register agents, list services, and fulfill jobs — and clients discover agents, build pipelines, and approve work — all on-chain.

**Architecture:** Frontend-only (no backend). All state from on-chain contracts via wagmi hooks. Sidebar navigation replaces tab system. New screens for provider flow (Register Agent, My Services, Incoming Jobs). ACP ABI added for provider interactions (setBudget, submit). Existing components refactored into new layout.

**Tech Stack:** Next.js 16, React 19, wagmi 3, viem, custom CSS (dark-first design system in globals.css)

---

## Context for implementers

**Project root:** `C:\Users\GUDMAN\Desktop\Github files\arc-agent-commerce\frontend`

**Key files to understand before starting:**
- `src/config.ts` — Contract addresses + wagmi config (CONTRACTS object with all addresses)
- `src/app/page.tsx` — Current tab-based routing (will be replaced with sidebar)
- `src/lib/types.ts` — TypeScript types (Tab, ServiceData, etc.)
- `src/lib/constants.ts` — Capability names + hash mapping
- `src/lib/errors.ts` — Contract error parsing (parseContractError)
- `src/context/ToastContext.tsx` — Toast notifications via `useToast()` → `addToast(msg, type, txHash?)`
- `src/context/ThemeContext.tsx` — Dark/light theme via `useTheme()`

**Contract interaction pattern used everywhere:**
```tsx
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import ABI from "@/abi/ContractName.json";
import { CONTRACTS } from "@/config";

// Read
const { data } = useReadContract({
  address: CONTRACTS.SOME_CONTRACT,
  abi: ABI,
  functionName: "someFunction",
  args: [arg1],
});

// Write
const { writeContract, data: hash } = useWriteContract();
const { isSuccess } = useWaitForTransactionReceipt({ hash });
writeContract({ address: CONTRACTS.X, abi: ABI, functionName: "fn", args: [...] });
```

**Design system:** Custom CSS variables in `src/app/globals.css`. Key classes: `.card`, `.btn`, `.btn-outline`, `.btn-sm`, `.form-group`, `.status.active/completed/failed`. Colors: `var(--accent)` blue, `var(--green)`, `var(--red)`, `var(--bg-card)`, `var(--text)`, `var(--text-dim)`, `var(--border)`.

**No Tailwind. No component library. Raw CSS + CSS variables.**

**Testing:** No frontend test framework currently. Verify by running `npm run build` (must compile with zero errors) and manual testing in browser.

**Build/verify command:** `cd frontend && npm run build`

---

### Task 1: Add ACP ABI and update types

**Files:**
- Create: `frontend/src/abi/AgenticCommerce.json`
- Modify: `frontend/src/config.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/constants.ts`
- Modify: `frontend/src/lib/errors.ts`

**Why:** The provider needs to call `setBudget()`, `submit()`, and `getJob()` on the ERC-8183 ACP contract. The frontend doesn't have the ACP ABI yet. We also need new types for the sidebar navigation and extended capabilities.

**Step 1: Create ACP ABI**

Create `frontend/src/abi/AgenticCommerce.json` with a minimal ABI containing only the functions the frontend needs:

```json
[
  {
    "type": "function",
    "name": "getJob",
    "inputs": [{"name": "jobId", "type": "uint256"}],
    "outputs": [{"name": "", "type": "tuple", "components": [
      {"name": "id", "type": "uint256"},
      {"name": "client", "type": "address"},
      {"name": "provider", "type": "address"},
      {"name": "evaluator", "type": "address"},
      {"name": "description", "type": "string"},
      {"name": "budget", "type": "uint256"},
      {"name": "expiredAt", "type": "uint256"},
      {"name": "status", "type": "uint8"},
      {"name": "hook", "type": "address"}
    ]}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "jobCounter",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setBudget",
    "inputs": [
      {"name": "jobId", "type": "uint256"},
      {"name": "amount", "type": "uint256"},
      {"name": "optParams", "type": "bytes"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fund",
    "inputs": [
      {"name": "jobId", "type": "uint256"},
      {"name": "optParams", "type": "bytes"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submit",
    "inputs": [
      {"name": "jobId", "type": "uint256"},
      {"name": "deliverable", "type": "bytes32"},
      {"name": "optParams", "type": "bytes"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paymentToken",
    "inputs": [],
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view"
  }
]
```

**Step 2: Update types.ts**

Replace the Tab type and add new types:

```typescript
export type Tab =
  | "marketplace"
  | "agent-profile"
  | "register-agent"
  | "my-services"
  | "incoming-jobs"
  | "create-pipeline"
  | "my-pipelines"
  | "spending-policy"
  | "activity"
  | "admin";

// Keep Prefill, ServiceData, AgreementData, PolicyData as-is. Add:

export type PipelineData = {
  clientAgentId: bigint;
  client: string;
  currency: string;
  totalBudget: bigint;
  totalSpent: bigint;
  currentStage: bigint;
  stageCount: bigint;
  status: number; // 0=Active, 1=Completed, 2=Halted, 3=Cancelled
  createdAt: bigint;
  deadline: bigint;
};

export type StageData = {
  providerAgentId: bigint;
  providerAddress: string;
  capabilityHash: string;
  budget: bigint;
  jobId: bigint;
  status: number; // 0=Pending, 1=Active, 2=Completed, 3=Failed
};

export type JobData = {
  id: bigint;
  client: string;
  provider: string;
  evaluator: string;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: number; // 0=Open, 1=Funded, 2=Submitted, 3=Completed, 4=Rejected, 5=Expired
  hook: string;
};
```

**Step 3: Update constants.ts**

Add more capabilities and pipeline/job status labels:

```typescript
export const CAPABILITY_NAMES: [string, string][] = [
  ["smart_contract_audit", "Smart Contract Audit"],
  ["code_review", "Code Review"],
  ["deployment", "Deployment"],
  ["monitoring", "Monitoring"],
  ["data_analysis", "Data Analysis"],
  ["price_monitoring", "Price Monitoring"],
  ["security_audit", "Security Audit"],
  ["testing", "Testing"],
];

// ... keep existing KNOWN_CAPABILITIES and capabilityName ...

export const PIPELINE_STATUS = ["Active", "Completed", "Halted", "Cancelled"];
export const STAGE_STATUS = ["Pending", "Active", "Completed", "Failed"];
export const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];
```

**Step 4: Update errors.ts**

Add V3 + ACP revert reasons to REVERT_REASONS:

```typescript
// Add these to REVERT_REASONS:
NoStages: "Pipeline must have at least one stage",
DeadlineInPast: "Deadline must be in the future",
PipelineNotActive: "Pipeline is not active",
WrongStage: "Cannot operate on this stage",
UnsupportedCurrency: "This currency is not supported",
NotCommerceHook: "Only the commerce hook can call this",
OnlyOrchestrator: "Only the orchestrator can call this",
OnlyPipelineClient: "Only the pipeline client can call this",
OnlyACP: "Only the ACP contract can call this",
JobNotRegistered: "This job is not registered in the pipeline",
JobNotSubmitted: "Job must be in submitted status",
HookNotWhitelisted: "Hook is not whitelisted on ACP",
Unauthorized: "Not authorized to perform this action",
```

**Step 5: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds. (Some components will have type errors from the Tab change — that's OK, they get replaced in later tasks.)

**Step 6: Commit**

```bash
git add frontend/src/abi/AgenticCommerce.json frontend/src/config.ts frontend/src/lib/types.ts frontend/src/lib/constants.ts frontend/src/lib/errors.ts
git commit -m "feat: add ACP ABI, update types for full marketplace"
```

---

### Task 2: Sidebar layout and new navigation

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/globals.css`

**Why:** Replace the horizontal tab bar with a sidebar that organizes screens into Marketplace / Client / Provider / Admin sections.

**Step 1: Create Sidebar component**

Create `frontend/src/components/Sidebar.tsx`:

```tsx
"use client";

import type { Tab } from "@/lib/types";
import { useAccount } from "wagmi";
import { useIsOwner } from "@/hooks/useIsOwner";

type NavItem = { key: Tab; label: string; icon: string };
type NavSection = { title: string; items: NavItem[]; requiresWallet?: boolean; adminOnly?: boolean };

const NAV: NavSection[] = [
  {
    title: "Marketplace",
    items: [
      { key: "marketplace", label: "Browse Agents", icon: "🔍" },
      { key: "activity", label: "Activity", icon: "📡" },
    ],
  },
  {
    title: "Client",
    requiresWallet: true,
    items: [
      { key: "create-pipeline", label: "Create Pipeline", icon: "+" },
      { key: "my-pipelines", label: "My Pipelines", icon: "📋" },
      { key: "spending-policy", label: "Spending Policy", icon: "🛡" },
    ],
  },
  {
    title: "Provider",
    requiresWallet: true,
    items: [
      { key: "register-agent", label: "Register Agent", icon: "🤖" },
      { key: "my-services", label: "My Services", icon: "⚙" },
      { key: "incoming-jobs", label: "Incoming Jobs", icon: "📥" },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [
      { key: "admin", label: "Settings", icon: "⚡" },
    ],
  },
];

export function Sidebar({
  activeTab,
  onNavigate,
}: {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
}) {
  const { isConnected } = useAccount();
  const isOwner = useIsOwner();

  return (
    <nav className="sidebar">
      {NAV.map((section) => {
        if (section.adminOnly && !isOwner) return null;
        if (section.requiresWallet && !isConnected) return null;
        return (
          <div key={section.title} className="sidebar-section">
            <h4 className="sidebar-section-title">{section.title}</h4>
            {section.items.map((item) => (
              <button
                key={item.key}
                className={`sidebar-item ${activeTab === item.key ? "active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
```

**Step 2: Add sidebar styles to globals.css**

Append to `frontend/src/app/globals.css`:

```css
/* ── Sidebar Layout ── */
.app-layout {
  display: flex;
  min-height: calc(100vh - 64px);
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  padding: 1rem 0;
  position: sticky;
  top: 64px;
  height: calc(100vh - 64px);
  overflow-y: auto;
}

.sidebar-section {
  margin-bottom: 1.5rem;
}

.sidebar-section-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  padding: 0 1.25rem;
  margin-bottom: 0.5rem;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 1.25rem;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.sidebar-item:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.03);
}

.sidebar-item.active {
  color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
  border-right: 2px solid var(--accent);
}

.sidebar-icon {
  width: 1.25rem;
  text-align: center;
  font-size: 1rem;
}

.main-content {
  flex: 1;
  min-width: 0;
  padding: 1.5rem 2rem;
  max-width: 960px;
}

@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    height: auto;
    position: static;
    display: flex;
    overflow-x: auto;
    padding: 0.5rem;
    gap: 0.25rem;
  }
  .sidebar-section {
    display: flex;
    gap: 0.25rem;
    margin: 0;
  }
  .sidebar-section-title {
    display: none;
  }
  .sidebar-item {
    white-space: nowrap;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .sidebar-item.active {
    border-right: none;
    background: rgba(59, 130, 246, 0.15);
  }
  .main-content {
    padding: 1rem;
  }
}
```

**Step 3: Rewrite page.tsx with sidebar layout**

Replace `frontend/src/app/page.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Marketplace } from "@/components/Marketplace";
import { RegisterAgent } from "@/components/RegisterAgent";
import { MyServicesProvider } from "@/components/MyServicesProvider";
import { IncomingJobs } from "@/components/IncomingJobs";
import { PipelineBuilder } from "@/components/PipelineBuilder";
import { MyPipelines } from "@/components/MyPipelines";
import { SpendingPolicyTab } from "@/components/SpendingPolicyTab";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AdminPanel } from "@/components/AdminPanel";
import { AgentProfileModal } from "@/components/AgentProfileModal";
import type { Tab } from "@/lib/types";

export default function Home() {
  const [tab, setTab] = useState<Tab>("marketplace");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [pipelinePrefill, setPipelinePrefill] = useState<
    { agentId: number; provider: string; capability: string; price: bigint } | null
  >(null);

  const handleHire = (agentId: number, provider: string, capability: string, price: bigint) => {
    setPipelinePrefill({ agentId, provider, capability, price });
    setTab("create-pipeline");
    setSelectedAgentId(null);
  };

  const handleViewAgent = (agentId: number) => {
    setSelectedAgentId(agentId);
  };

  return (
    <>
      <Header />
      <div className="app-layout">
        <Sidebar activeTab={tab} onNavigate={setTab} />
        <main className="main-content">
          {tab === "marketplace" && (
            <Marketplace onViewAgent={handleViewAgent} onHire={handleHire} />
          )}
          {tab === "register-agent" && <RegisterAgent />}
          {tab === "my-services" && <MyServicesProvider onViewAgent={handleViewAgent} />}
          {tab === "incoming-jobs" && <IncomingJobs />}
          {tab === "create-pipeline" && (
            <PipelineBuilder prefill={pipelinePrefill} onClearPrefill={() => setPipelinePrefill(null)} />
          )}
          {tab === "my-pipelines" && <MyPipelines />}
          {tab === "spending-policy" && <SpendingPolicyTab />}
          {tab === "activity" && <ActivityFeed onViewAgent={handleViewAgent} />}
          {tab === "admin" && <AdminPanel />}
        </main>
      </div>

      {selectedAgentId !== null && (
        <AgentProfileModal
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onHire={(agentId, provider, capability, price) => handleHire(agentId, provider, capability, price)}
        />
      )}
    </>
  );
}
```

Note: This references components that don't exist yet (Marketplace, RegisterAgent, MyServicesProvider, IncomingJobs). The build will fail until subsequent tasks create them. That's expected — commit with a WIP message.

**Step 4: Remove old .tabs CSS**

In `globals.css`, find and remove the `.tabs` and `.tab` CSS rules (the old horizontal tab bar). They're replaced by the sidebar.

**Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/app/page.tsx frontend/src/app/globals.css
git commit -m "feat: sidebar navigation layout replacing tab system"
```

---

### Task 3: Marketplace screen (agent discovery)

**Files:**
- Create: `frontend/src/components/Marketplace.tsx`

**Why:** The main discovery screen. Reads all services from ServiceMarket, groups by capability, shows agent cards with prices. Replaces BrowseServices.

**Step 1: Create Marketplace.tsx**

```tsx
"use client";

import { useState, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import { CAPABILITY_NAMES, capabilityName } from "@/lib/constants";
import { keccak256, toHex, formatUnits } from "viem";
import { Skeleton } from "@/components/Skeleton";

type Props = {
  onViewAgent: (agentId: number) => void;
  onHire: (agentId: number, provider: string, capability: string, price: bigint) => void;
};

export function Marketplace({ onViewAgent, onHire }: Props) {
  const [selectedCapability, setSelectedCapability] = useState<string>("all");

  // Get total service count
  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
  });

  const serviceCount = Number(nextId ?? 0);

  // Batch-read all services
  const { data: servicesRaw, isLoading } = useReadContracts({
    contracts: Array.from({ length: serviceCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_MARKET,
      abi: ServiceMarketABI,
      functionName: "getService",
      args: [BigInt(i)],
    })),
  });

  // Parse + filter active services
  const services = useMemo(() => {
    if (!servicesRaw) return [];
    return servicesRaw
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const d = r.result as any;
        return {
          serviceId: i,
          agentId: Number(d[0] ?? d.agentId),
          provider: (d[1] ?? d.provider) as string,
          capabilityHash: (d[2] ?? d.capabilityHash) as string,
          pricePerTask: d[3] ?? d.pricePerTask,
          metadataURI: (d[4] ?? d.metadataURI) as string,
          active: d[5] ?? d.active,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.active);
  }, [servicesRaw]);

  // Group by capability
  const grouped = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const s of services) {
      const hash = s.capabilityHash.toLowerCase();
      if (!map.has(hash)) map.set(hash, []);
      map.get(hash)!.push(s);
    }
    return map;
  }, [services]);

  // Filter
  const filtered = selectedCapability === "all"
    ? services
    : services.filter((s) => s.capabilityHash.toLowerCase() === selectedCapability);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2>Agent Marketplace</h2>
        <div className="marketplace-stats" style={{ display: "flex", gap: "1.5rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
          <span>{services.length} active services</span>
          <span>{grouped.size} capabilities</span>
        </div>
      </div>

      {/* Capability filter */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button
          className={`btn-sm ${selectedCapability === "all" ? "" : "btn-outline"}`}
          onClick={() => setSelectedCapability("all")}
          style={selectedCapability === "all" ? { background: "var(--accent)", color: "#fff" } : {}}
        >
          All ({services.length})
        </button>
        {Array.from(grouped.entries()).map(([hash, svcs]) => (
          <button
            key={hash}
            className={`btn-sm ${selectedCapability === hash ? "" : "btn-outline"}`}
            onClick={() => setSelectedCapability(hash)}
            style={selectedCapability === hash ? { background: "var(--accent)", color: "#fff" } : {}}
          >
            {capabilityName(hash)} ({svcs.length})
          </button>
        ))}
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && filtered.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-dim)", marginBottom: "0.5rem" }}>No agents available yet.</p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Be the first — register your agent in the Provider section.</p>
        </div>
      )}

      {/* Agent cards */}
      <div style={{ display: "grid", gap: "1rem" }}>
        {filtered.map((s) => (
          <div key={s.serviceId} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 600 }}>Agent #{s.agentId}</span>
                <span className="status active" style={{ fontSize: "0.75rem" }}>{capabilityName(s.capabilityHash)}</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                {s.provider.slice(0, 6)}...{s.provider.slice(-4)}
                {s.metadataURI && <> &middot; {s.metadataURI.length > 40 ? s.metadataURI.slice(0, 40) + "..." : s.metadataURI}</>}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                {formatUnits(BigInt(s.pricePerTask), 6)} USDC
              </span>
              <button className="btn-sm" onClick={() => onViewAgent(s.agentId)}>Profile</button>
              <button
                className="btn-sm"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => onHire(s.agentId, s.provider, s.capabilityHash, BigInt(s.pricePerTask))}
              >
                Hire
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/Marketplace.tsx
git commit -m "feat: marketplace screen with agent discovery by capability"
```

---

### Task 4: Register Agent screen (provider onboarding)

**Files:**
- Create: `frontend/src/components/RegisterAgent.tsx`

**Why:** Providers register an ERC-8004 agent identity, then list services on ServiceMarket. Two-step flow.

**Step 1: Create RegisterAgent.tsx**

```tsx
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

  // Check if user already has agents
  const { data: agentBalance } = useReadContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: IdentityRegistryABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  // Step 1: Register agent
  const [metadataURI, setMetadataURI] = useState("");
  const { writeContract: registerAgent, data: registerHash, error: registerError } = useWriteContract();
  const { isSuccess: registerSuccess, data: registerReceipt } = useWaitForTransactionReceipt({ hash: registerHash });

  const [registeredAgentId, setRegisteredAgentId] = useState<number | null>(null);

  useEffect(() => {
    if (registerSuccess && registerReceipt) {
      // Parse Transfer event to get agent ID
      // Transfer(address,address,uint256) event topic
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
    if (registerError) addToast(parseContractError(registerError), "error");
  }, [registerError]);

  // Step 2: List service
  const [capability, setCapability] = useState(CAPABILITY_NAMES[0][0]);
  const [price, setPrice] = useState("");
  const [serviceMetadata, setServiceMetadata] = useState("");
  const { writeContract: listService, data: listHash, error: listError } = useWriteContract();
  const { isSuccess: listSuccess } = useWaitForTransactionReceipt({ hash: listHash });

  useEffect(() => {
    if (listSuccess) addToast("Service listed on marketplace!", "success", listHash);
  }, [listSuccess]);

  useEffect(() => {
    if (listError) addToast(parseContractError(listError), "error");
  }, [listError]);

  if (!isConnected) {
    return <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
      <p>Connect your wallet to register an agent.</p>
    </div>;
  }

  return (
    <div>
      <h2>Register Agent</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: "1.5rem" }}>
        Create an on-chain agent identity (ERC-8004) and list services on the marketplace.
      </p>

      {/* Step 1: Register */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Step 1: Register Agent Identity</h3>
        {Number(agentBalance ?? 0) > 0 && (
          <p style={{ color: "var(--green)", marginBottom: "0.75rem" }}>
            You already have {Number(agentBalance)} agent(s) registered. You can register more or skip to listing a service.
          </p>
        )}
        <div className="form-group">
          <label>Metadata URI (optional — name, description, avatar URL)</label>
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
          <p style={{ marginTop: "0.75rem", color: "var(--green)" }}>
            Agent #{registeredAgentId} registered successfully.
          </p>
        )}
      </div>

      {/* Step 2: List Service */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Step 2: List a Service</h3>
        <div className="form-group">
          <label>Agent ID</label>
          <input
            type="number"
            value={registeredAgentId ?? ""}
            onChange={(e) => setRegisteredAgentId(Number(e.target.value))}
            placeholder="Your agent ID (from step 1)"
          />
        </div>
        <div className="form-group">
          <label>Capability</label>
          <select value={capability} onChange={(e) => setCapability(e.target.value)}>
            {CAPABILITY_NAMES.map(([raw, display]) => (
              <option key={raw} value={raw}>{display}</option>
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
          disabled={!registeredAgentId || !price || Number(price) <= 0}
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
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/RegisterAgent.tsx
git commit -m "feat: register agent screen with ERC-8004 identity + service listing"
```

---

### Task 5: My Services screen (provider management)

**Files:**
- Create: `frontend/src/components/MyServicesProvider.tsx`

**Why:** Providers manage their listed services — see active services, update prices, delist. Named differently from old unused MyServices.tsx.

This component iterates all services (via `nextServiceId`), filters where `provider == connected wallet`, and displays with edit/delist actions.

**Step 1: Create MyServicesProvider.tsx**

Reuse the pattern from the existing `MyServices.tsx` (which is currently dead code) but with a cleaner interface. The component should:

1. Read `nextServiceId` from ServiceMarket
2. Batch-read all services via `useReadContracts`
3. Filter where `provider === address`
4. For each service show: capability name, price, active status
5. Buttons: "Update Price" (opens inline edit), "Delist" (calls `delistService`)

The implementation follows the exact same batch-read + filter pattern as the Marketplace component, but filtered by `s.provider.toLowerCase() === address?.toLowerCase()` and with write actions.

Write actions use `useWriteContract` with `ServiceMarketABI.updateService(serviceId, newPrice, newMetadataURI)` and `ServiceMarketABI.delistService(serviceId)`.

**Step 2: Commit**

```bash
git add frontend/src/components/MyServicesProvider.tsx
git commit -m "feat: provider services management screen"
```

---

### Task 6: Incoming Jobs screen (provider work queue)

**Files:**
- Create: `frontend/src/components/IncomingJobs.tsx`

**Why:** The critical provider screen. Shows ACP jobs where the connected wallet is the provider, with action buttons for each job status.

**Step 1: Create IncomingJobs.tsx**

This is the most complex new component. It needs to:

1. Read `nextPipelineId` from PipelineOrchestrator
2. For each pipeline, read stages via `getStages(pipelineId)`
3. Filter stages where `providerAddress === connected wallet`
4. For each matching stage, read the ACP job via `getJob(jobId)`
5. Display each job with status-appropriate action buttons:
   - **Open** (budget=0): "Set Budget" button → calls `ACP.setBudget(jobId, amount, 0x)`
   - **Open** (budget>0): "Waiting for client to fund"
   - **Funded**: "Submit Deliverable" button → input for hash, calls `ACP.submit(jobId, hash, 0x)`
   - **Submitted**: "Waiting for client approval"
   - **Completed**: "Paid ✓" with USDC amount
   - **Rejected**: "Rejected"

The ABI for ACP calls is `AgenticCommerce.json` created in Task 1. Contract address is `CONTRACTS.AGENTIC_COMMERCE`.

Key implementation detail: use `useReadContracts` to batch-fetch pipeline data, then a second `useReadContracts` for stages of matching pipelines, then a third for ACP job data. Chain these with `enabled: !!previousData`.

For setBudget, the amount should match the stage's budget (pre-filled from `stage.budget`).

For submit, the provider enters a deliverable description, which gets hashed via `keccak256(toHex(description))` and sent as the `deliverable` bytes32 parameter.

**Step 2: Commit**

```bash
git add frontend/src/components/IncomingJobs.tsx
git commit -m "feat: incoming jobs screen for providers with setBudget/submit actions"
```

---

### Task 7: Update PipelineBuilder with marketplace integration

**Files:**
- Modify: `frontend/src/components/PipelineBuilder.tsx`

**Why:** Currently the pipeline builder is a raw form where you type addresses. It needs to accept pre-filled agent data from the Marketplace "Hire" flow, and include the `fundStage` step.

**Step 1: Update PipelineBuilder**

Changes to the existing component:

1. Accept new props: `prefill` and `onClearPrefill` (from page.tsx)
2. When `prefill` is set, auto-add the agent as the first stage with their capability and price pre-filled
3. Add an "Add from Marketplace" button that explains users can browse agents and click "Hire"
4. Keep the manual "Add Stage" for custom provider addresses
5. Show a visual stage flow: numbered stages with arrows between them

The existing PipelineBuilder already handles USDC approval + `createPipeline()`. Keep all that logic. Just improve the stage input UX.

**Step 2: Commit**

```bash
git add frontend/src/components/PipelineBuilder.tsx
git commit -m "feat: pipeline builder with marketplace integration and prefill"
```

---

### Task 8: Update MyPipelines with full stage lifecycle

**Files:**
- Modify: `frontend/src/components/MyPipelines.tsx`
- Modify: `frontend/src/components/PipelineTracker.tsx`

**Why:** The pipeline tracker needs to show the full ACP job lifecycle per stage (not just approve/reject) and include the "Fund Stage" button.

**Step 1: Update PipelineTracker**

For each stage, read the ACP job status via `getJob(stage.jobId)` and show:

- **Active + Job Open (budget=0):** "Waiting for provider to set budget"
- **Active + Job Open (budget>0):** "Ready to fund" → **[Fund Stage]** button calling `PipelineOrchestrator.fundStage(pipelineId)`
- **Active + Job Funded:** "Waiting for provider to submit deliverable"
- **Active + Job Submitted:** "Deliverable submitted — review it" → **[Approve]** / **[Reject]** buttons (existing)
- **Completed:** Green checkmark + USDC amount
- **Failed:** Red X

This requires importing `AgenticCommerce.json` ABI and `PipelineOrchestrator.json` ABI. The fundStage call goes to `CONTRACTS.PIPELINE_ORCHESTRATOR` with `functionName: "fundStage"` and `args: [pipelineId]`.

**Step 2: Commit**

```bash
git add frontend/src/components/MyPipelines.tsx frontend/src/components/PipelineTracker.tsx
git commit -m "feat: pipeline tracker with full ACP job lifecycle and fundStage"
```

---

### Task 9: Update AgentProfileModal

**Files:**
- Modify: `frontend/src/components/AgentProfileModal.tsx`

**Why:** The modal needs to show real on-chain data and have a working "Hire for Pipeline" button that passes full agent info.

**Step 1: Update AgentProfileModal**

Changes:
1. Update `onHire` prop signature to `(agentId: number, provider: string, capability: string, price: bigint) => void`
2. Show: agent ID, owner address, metadata URI, registered services with prices
3. For each service, show a "Hire" button that calls `onHire(agentId, provider, capabilityHash, pricePerTask)`
4. Compute reputation from pipeline data (iterate pipelines, find completed stages by this agent → positive score, failed → negative)
5. Remove O(n) agreement iteration (old V1 reputation). Replace with pipeline-based reputation.

**Step 2: Commit**

```bash
git add frontend/src/components/AgentProfileModal.tsx
git commit -m "feat: update agent profile with pipeline reputation and hire flow"
```

---

### Task 10: Update ActivityFeed

**Files:**
- Modify: `frontend/src/components/ActivityFeed.tsx`

**Why:** Currently only shows V1 agreements. Should show pipeline activity too.

**Step 1: Update ActivityFeed**

Add pipeline events alongside agreement events:
1. Read `nextPipelineId` from PipelineOrchestrator
2. Batch-read pipeline data (clientAgentId, status, stageCount, totalBudget, createdAt)
3. Merge with existing agreement data, sort by timestamp (createdAt / deadline)
4. Display: "Pipeline #X created — Y stages, Z USDC" or "Pipeline #X completed"
5. Keep existing agreement display

**Step 2: Commit**

```bash
git add frontend/src/components/ActivityFeed.tsx
git commit -m "feat: activity feed with pipeline events"
```

---

### Task 11: Delete dead code and fix Dashboard

**Files:**
- Delete: `frontend/src/components/CreateAgreement.tsx`
- Delete: `frontend/src/components/ListService.tsx`
- Delete: `frontend/src/components/MyAgreements.tsx`
- Delete: `frontend/src/components/MyServices.tsx`
- Delete: `frontend/src/components/BrowseServices.tsx`
- Delete: `frontend/src/components/Dashboard.tsx`
- Delete: `frontend/src/components/Stats.tsx`

**Why:** These are all V1 components that are either unused or replaced by new screens. The marketplace replaces BrowseServices. RegisterAgent replaces ListService. MyServicesProvider replaces MyServices. IncomingJobs is new. Dashboard and Stats were V1 overview screens — the sidebar nav removes the need for a dashboard.

**Step 1: Delete files**

```bash
cd frontend/src/components
rm CreateAgreement.tsx ListService.tsx MyAgreements.tsx MyServices.tsx BrowseServices.tsx Dashboard.tsx Stats.tsx
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

Must compile cleanly. If any imports reference deleted files, fix them.

**Step 3: Commit**

```bash
git add -u frontend/src/components/
git commit -m "chore: remove dead V1 components replaced by marketplace screens"
```

---

### Task 12: Final build verification and polish

**Files:**
- Modify: various (fix any build errors)

**Step 1: Build**

```bash
cd frontend && npm run build
```

Fix any TypeScript errors, missing imports, prop mismatches.

**Step 2: Manual testing checklist**

Run `npm run dev` and verify:

- [ ] Sidebar renders with all sections
- [ ] Marketplace shows services grouped by capability
- [ ] Register Agent: can register (ERC-8004 tx) and list service
- [ ] My Services: shows services owned by connected wallet
- [ ] Pipeline Builder: can add agents from marketplace via Hire flow
- [ ] Pipeline Builder: can manually add stages
- [ ] My Pipelines: shows pipeline list with expandable tracker
- [ ] Pipeline Tracker: shows correct stage states from ACP job data
- [ ] Pipeline Tracker: Fund Stage button works
- [ ] Incoming Jobs: shows jobs where wallet is provider
- [ ] Incoming Jobs: Set Budget and Submit Deliverable work
- [ ] Agent Profile Modal: shows services, reputation, hire buttons
- [ ] Spending Policy: all CRUD operations work
- [ ] Activity Feed: shows pipeline + agreement events
- [ ] Mobile: sidebar collapses to horizontal scroll

**Step 3: Deploy to VPS**

```bash
cd /opt/arc-commerce-repo && git pull && cd frontend && npm run build && cp -r .next/standalone/* /opt/arc-commerce/ && cp -r .next/static /opt/arc-commerce/.next/static && systemctl restart arc-commerce
```

**Step 4: Commit**

```bash
git add -A frontend/
git commit -m "feat: complete two-sided marketplace — all screens functional"
```

---

## Summary

| Task | Screen | Side |
|------|--------|------|
| 1 | ACP ABI + types | Foundation |
| 2 | Sidebar layout | Navigation |
| 3 | Marketplace | Client (discovery) |
| 4 | Register Agent | Provider (onboarding) |
| 5 | My Services | Provider (management) |
| 6 | Incoming Jobs | Provider (work queue) |
| 7 | Pipeline Builder update | Client (hiring) |
| 8 | Pipeline Tracker update | Client (lifecycle) |
| 9 | Agent Profile update | Shared (due diligence) |
| 10 | Activity Feed update | Shared (ecosystem pulse) |
| 11 | Delete dead code | Cleanup |
| 12 | Build + deploy | Polish |
