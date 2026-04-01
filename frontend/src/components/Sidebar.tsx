"use client";

import type { Tab } from "@/lib/types";
import { useAccount } from "wagmi";
import { useIsOwner } from "@/hooks/useIsOwner";

type NavItem = { key: Tab; label: string };
type NavSection = { title: string; items: NavItem[]; requiresWallet?: boolean; adminOnly?: boolean };

const NAV: NavSection[] = [
  {
    title: "Marketplace",
    items: [
      { key: "marketplace", label: "Browse Agents" },
      { key: "activity", label: "Activity" },
    ],
  },
  {
    title: "Client",
    requiresWallet: true,
    items: [
      { key: "create-pipeline", label: "Create Pipeline" },
      { key: "my-pipelines", label: "My Pipelines" },
      { key: "spending-policy", label: "Spending Policy" },
    ],
  },
  {
    title: "Provider",
    requiresWallet: true,
    items: [
      { key: "register-agent", label: "Register Agent" },
      { key: "my-services", label: "My Services" },
      { key: "incoming-jobs", label: "Incoming Jobs" },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [
      { key: "admin", label: "Settings" },
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
            <div className="sidebar-section-title">{section.title}</div>
            {section.items.map((item) => (
              <button
                key={item.key}
                className={`sidebar-item${activeTab === item.key ? " active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
