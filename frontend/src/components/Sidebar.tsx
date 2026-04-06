"use client";

import type { Tab } from "@/lib/types";
import { useAccount } from "wagmi";
import { useIsOwner } from "@/hooks/useIsOwner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Activity,
  Briefcase,
  Users,
  Shield,
  Settings,
  Zap,
  Radio,
  BarChart3,
  Plus,
  GitBranch,
  Menu,
  X,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { key: Tab; label: string; icon: LucideIcon };
type NavSection = {
  title: string;
  items: NavItem[];
  requiresWallet?: boolean;
  adminOnly?: boolean;
};

const NAV: NavSection[] = [
  {
    title: "Marketplace",
    items: [
      { key: "marketplace", label: "Browse Services", icon: Store },
      { key: "activity", label: "Activity", icon: Activity },
    ],
  },
  {
    title: "Ecosystem",
    items: [
      { key: "acp-jobs", label: "ACP Jobs", icon: Briefcase },
      { key: "agent-directory", label: "Agent Directory", icon: Users },
    ],
  },
  {
    title: "Client",
    requiresWallet: true,
    items: [
      { key: "create-pipeline", label: "Create Pipeline", icon: Plus },
      { key: "my-pipelines", label: "My Pipelines", icon: GitBranch },
      { key: "streams", label: "Streams", icon: Radio },
      { key: "spending-policy", label: "Spending Policy", icon: Shield },
    ],
  },
  {
    title: "Provider",
    requiresWallet: true,
    items: [
      { key: "register-agent", label: "Register Agent", icon: Zap },
      { key: "my-services", label: "My Services", icon: Layers },
      { key: "incoming-jobs", label: "Incoming Jobs", icon: BarChart3 },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [{ key: "admin", label: "Settings", icon: Settings }],
  },
];

function SidebarContent({
  activeTab,
  onNavigate,
  onItemClick,
}: {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  onItemClick?: () => void;
}) {
  const { isConnected } = useAccount();
  const isOwner = useIsOwner();

  return (
    <>
      {NAV.map((section) => {
        if (section.adminOnly && !isOwner) return null;
        if (section.requiresWallet && !isConnected) return null;
        return (
          <div key={section.title} className="sidebar-section">
            <div className="sidebar-section-title">{section.title}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  className={`sidebar-item${isActive ? " active" : ""}`}
                  onClick={() => {
                    onNavigate(item.key);
                    onItemClick?.();
                  }}
                >
                  <Icon
                    size={16}
                    className={`sidebar-icon ${isActive ? "sidebar-icon-active" : ""}`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export function Sidebar({
  activeTab,
  onNavigate,
  mobileOpen,
  onMobileClose,
}: {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar sidebar-desktop">
        <SidebarContent activeTab={activeTab} onNavigate={onNavigate} />
      </nav>

      {/* Mobile overlay sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onMobileClose}
            />
            <motion.nav
              className="sidebar sidebar-mobile"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="sidebar-mobile-header">
                <span className="sidebar-mobile-title">Navigation</span>
                <button
                  className="sidebar-mobile-close"
                  onClick={onMobileClose}
                >
                  <X size={20} />
                </button>
              </div>
              <SidebarContent
                activeTab={activeTab}
                onNavigate={onNavigate}
                onItemClick={onMobileClose}
              />
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function MobileSidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button className="mobile-menu-toggle" onClick={onClick}>
      <Menu size={22} />
    </button>
  );
}
