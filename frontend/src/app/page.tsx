"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Stats } from "@/components/Stats";
import { Dashboard } from "@/components/Dashboard";
import { BrowseServices } from "@/components/BrowseServices";
import { PipelineBuilder } from "@/components/PipelineBuilder";
import { MyPipelines } from "@/components/MyPipelines";
import { SpendingPolicyTab } from "@/components/SpendingPolicyTab";
import { AdminPanel } from "@/components/AdminPanel";
import { AgentProfileModal } from "@/components/AgentProfileModal";
import { useIsOwner } from "@/hooks/useIsOwner";
import type { Tab } from "@/lib/types";

const TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "discover", label: "Discover Agents" },
  { key: "create-pipeline", label: "Create Pipeline" },
  { key: "my-pipelines", label: "My Pipelines" },
  { key: "spending-policy", label: "Spending Policy" },
  { key: "admin", label: "Admin", adminOnly: true },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const isOwner = useIsOwner();

  const handleHire = (provider: string, agentId: string, price: string) => {
    // In v3, hiring goes through pipelines — navigate to the pipeline builder
    setTab("create-pipeline");
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
        {tab === "discover" && (
          <BrowseServices onHire={handleHire} onViewAgent={handleViewAgent} />
        )}
        {tab === "create-pipeline" && <PipelineBuilder />}
        {tab === "my-pipelines" && <MyPipelines />}
        {tab === "spending-policy" && <SpendingPolicyTab />}
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
