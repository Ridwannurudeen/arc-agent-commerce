"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Stats } from "@/components/Stats";
import { Dashboard } from "@/components/Dashboard";
import { BrowseServices } from "@/components/BrowseServices";
import { MyAgreements } from "@/components/MyAgreements";
import { ListService } from "@/components/ListService";
import { CreateAgreement } from "@/components/CreateAgreement";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SpendingPolicyTab } from "@/components/SpendingPolicyTab";
import { MyServices } from "@/components/MyServices";
import { AdminPanel } from "@/components/AdminPanel";
import { AgentProfileModal } from "@/components/AgentProfileModal";
import { useIsOwner } from "@/hooks/useIsOwner";
import type { Tab, Prefill } from "@/lib/types";

const TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "services", label: "Browse Services" },
  { key: "agreements", label: "My Agreements" },
  { key: "my-services", label: "My Services" },
  { key: "list-service", label: "List Service" },
  { key: "create-agreement", label: "Create Agreement" },
  { key: "spending-policy", label: "Spending Policy" },
  { key: "activity", label: "Activity Feed" },
  { key: "admin", label: "Admin", adminOnly: true },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const isOwner = useIsOwner();

  const handleHire = (provider: string, agentId: string, price: string) => {
    setPrefill({ provider, providerAgentId: agentId, amount: price });
    setTab("create-agreement");
    setSelectedAgentId(null);
  };

  const handleViewAgent = (agentId: number) => {
    setSelectedAgentId(agentId);
  };

  return (
    <>
      <Header />

      <div className="container">
        <Stats />

        <div className="tabs">
          {TABS.filter((t) => !t.adminOnly || isOwner).map(({ key, label }) => (
            <button
              key={key}
              className={`tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "dashboard" && (
          <Dashboard onNavigate={setTab} onViewAgent={handleViewAgent} />
        )}
        {tab === "services" && (
          <BrowseServices onHire={handleHire} onViewAgent={handleViewAgent} />
        )}
        {tab === "agreements" && <MyAgreements onViewAgent={handleViewAgent} />}
        {tab === "my-services" && <MyServices />}
        {tab === "list-service" && <ListService />}
        {tab === "create-agreement" && <CreateAgreement prefill={prefill} />}
        {tab === "spending-policy" && <SpendingPolicyTab />}
        {tab === "activity" && <ActivityFeed onViewAgent={handleViewAgent} />}
        {tab === "admin" && isOwner && <AdminPanel />}
      </div>

      {selectedAgentId !== null && (
        <AgentProfileModal
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onHire={handleHire}
        />
      )}
    </>
  );
}
