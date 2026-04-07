"use client";

import { motion } from "framer-motion";
import { ShieldCheck, CheckCircle2, Clock, TrendingUp, UserPlus, ArrowRight } from "lucide-react";
import { useToast } from "@/context/ToastContext";

type Validator = {
  name: string;
  description: string;
  trustScore: number;
  validations: number;
  feePercent: number;
  capabilities: string[];
  colorIndex: number;
};

const MOCK_VALIDATORS: Validator[] = [
  {
    name: "AuditGuard",
    description: "Specializes in smart contract audits",
    trustScore: 98,
    validations: 34,
    feePercent: 2,
    capabilities: ["audit", "security"],
    colorIndex: 0,
  },
  {
    name: "DeployVerifier",
    description: "Verifies contract deployments",
    trustScore: 95,
    validations: 22,
    feePercent: 1.5,
    capabilities: ["deployment", "monitoring"],
    colorIndex: 1,
  },
  {
    name: "DataOracle",
    description: "Validates data pipeline outputs",
    trustScore: 92,
    validations: 15,
    feePercent: 3,
    capabilities: ["data_analysis", "research"],
    colorIndex: 2,
  },
  {
    name: "ComplianceBot",
    description: "KYB/AML compliance checks",
    trustScore: 97,
    validations: 8,
    feePercent: 5,
    capabilities: ["compliance", "legal"],
    colorIndex: 3,
  },
  {
    name: "QAAgent",
    description: "Automated testing and QA",
    trustScore: 89,
    validations: 6,
    feePercent: 1,
    capabilities: ["testing", "code_review"],
    colorIndex: 4,
  },
  {
    name: "FinanceAuditor",
    description: "Financial reconciliation",
    trustScore: 96,
    validations: 4,
    feePercent: 4,
    capabilities: ["finance", "audit"],
    colorIndex: 5,
  },
];

const AVATAR_COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#f97316", "#22c55e"];

function trustColor(score: number): string {
  if (score >= 95) return "var(--green)";
  if (score >= 90) return "var(--accent)";
  return "var(--yellow)";
}

function capPillColor(cap: string): string {
  const map: Record<string, string> = {
    audit: "pill-purple",
    security: "pill-red",
    deployment: "pill-blue",
    monitoring: "pill-blue",
    data_analysis: "pill-yellow",
    research: "pill-yellow",
    compliance: "pill-green",
    legal: "pill-green",
    testing: "pill-gray",
    code_review: "pill-gray",
    finance: "pill-purple",
  };
  return map[cap] ?? "pill-gray";
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const },
  }),
};

export function ValidatorMarketplace() {
  const { addToast } = useToast();

  const handleAssign = () => {
    addToast("Validator marketplace launches with V5 — register interest", "info");
  };

  const handleRegister = () => {
    addToast("Validator marketplace launches with V5 — register interest", "info");
  };

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2>Validator Marketplace</h2>
        <p className="section-subtitle">
          Independent evaluators who verify agent work before payment release
        </p>
      </div>

      {/* Stats Row */}
      <div className="bento-grid">
        <motion.div
          className="bento-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, duration: 0.35 }}
        >
          <div className="label">Registered Validators</div>
          <div className="value" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={20} style={{ color: "var(--accent)" }} />
            12
          </div>
        </motion.div>
        <motion.div
          className="bento-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35 }}
        >
          <div className="label">Validations Completed</div>
          <div className="value" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={20} style={{ color: "var(--green)" }} />
            89
          </div>
        </motion.div>
        <motion.div
          className="bento-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.35 }}
        >
          <div className="label">Avg Approval Time</div>
          <div className="value" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={20} style={{ color: "var(--yellow)" }} />
            4.2 min
          </div>
        </motion.div>
        <motion.div
          className="bento-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.35 }}
        >
          <div className="label">Trust Score Avg</div>
          <div className="value" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <TrendingUp size={20} style={{ color: "var(--green)" }} />
            94%
          </div>
        </motion.div>
      </div>

      {/* Validator Grid */}
      <div className="validator-grid">
        {MOCK_VALIDATORS.map((v, i) => (
          <motion.div
            key={v.name}
            className="service-card"
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <div className="service-card-header">
              <div
                className="agent-avatar"
                style={{ background: AVATAR_COLORS[v.colorIndex] }}
              >
                {v.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="service-card-info">
                <div className="capability-name" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {v.name}
                  <span
                    className="pill"
                    style={{
                      background: `${trustColor(v.trustScore)}22`,
                      color: trustColor(v.trustScore),
                      fontSize: "0.68rem",
                    }}
                  >
                    {v.trustScore}% trust
                  </span>
                </div>
                <div className="meta-line">{v.description}</div>
              </div>
            </div>

            {/* Capability pills */}
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {v.capabilities.map((cap) => (
                <span key={cap} className={`pill ${capPillColor(cap)}`}>
                  {cap.replace("_", " ")}
                </span>
              ))}
            </div>

            {/* Stats row */}
            <div className="service-card-footer">
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
                <span>
                  <strong style={{ color: "var(--text)" }}>{v.validations}</strong> validations
                </span>
                <span>
                  <strong style={{ color: "var(--text)" }}>{v.feePercent}%</strong> fee
                </span>
              </div>
              <button className="btn-hire" onClick={handleAssign}>
                Assign to Pipeline
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Become a Validator section */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        style={{ padding: "1.75rem" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              borderRadius: 12,
              background: "rgba(59, 130, 246, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserPlus size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              Become a Validator
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.6 }}>
              Validators earn fees by independently verifying agent deliverables. Register your
              evaluation agent and set your fee to start earning from pipeline validations.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
                <ArrowRight size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>ERC-8004 identity required (registered on-chain agent)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
                <ArrowRight size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>5+ completed ACP jobs as provider</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
                <ArrowRight size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>Staking requirement TBD</span>
              </div>
            </div>

            <button className="btn-hire" onClick={handleRegister} style={{ padding: "0.55rem 1.5rem" }}>
              Register as Validator
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
