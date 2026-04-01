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
  const [pipelinePrefill, setPipelinePrefill] = useState<{
    agentId: number;
    provider: string;
    capability: string;
    price: bigint;
  } | null>(null);

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
            <PipelineBuilder
              prefill={pipelinePrefill}
              onClearPrefill={() => setPipelinePrefill(null)}
            />
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
          onHire={handleHire}
        />
      )}
    </>
  );
}
