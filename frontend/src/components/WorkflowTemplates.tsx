"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  TrendingUp,
  Search,
  Scale,
  Cog,
  Clock,
  ChevronDown,
  ChevronUp,
  Rocket,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: "engineering" | "finance" | "research" | "compliance" | "operations";
  stages: {
    capability: string;
    label: string;
    budgetRange: [number, number];
    description: string;
  }[];
  totalBudgetRange: [number, number];
  estimatedDuration: string;
};

const CATEGORY_ICONS: Record<WorkflowTemplate["category"], LucideIcon> = {
  engineering: Shield,
  finance: TrendingUp,
  research: Search,
  compliance: Scale,
  operations: Cog,
};

const CATEGORY_LABELS: Record<WorkflowTemplate["category"], string> = {
  engineering: "Engineering",
  finance: "Finance",
  research: "Research",
  compliance: "Compliance",
  operations: "Operations",
};

const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "audit-deploy-monitor",
    name: "Smart Contract Audit \u2192 Deploy \u2192 Monitor",
    description:
      "End-to-end contract lifecycle: automated audit, deployment to target chain, and continuous monitoring for anomalies.",
    icon: Shield,
    category: "engineering",
    stages: [
      {
        capability: "smart_contract_audit",
        label: "Smart Contract Audit",
        budgetRange: [25, 50],
        description:
          "Automated security audit covering reentrancy, overflow, access control, and gas optimization.",
      },
      {
        capability: "contract_deployment",
        label: "Contract Deployment",
        budgetRange: [10, 25],
        description:
          "Deploy audited contract to target chain with constructor args and verification.",
      },
      {
        capability: "monitoring",
        label: "Continuous Monitoring",
        budgetRange: [5, 15],
        description:
          "24/7 on-chain monitoring for unusual transactions, admin key usage, and balance changes.",
      },
    ],
    totalBudgetRange: [40, 90],
    estimatedDuration: "2-4 hours",
  },
  {
    id: "research-factcheck-report",
    name: "Market Research \u2192 Fact Check \u2192 Report Delivery",
    description:
      "Multi-agent research pipeline: gather market data, cross-verify facts, and compile a structured report.",
    icon: Search,
    category: "research",
    stages: [
      {
        capability: "data_analysis",
        label: "Market Research",
        budgetRange: [15, 30],
        description:
          "Aggregate on-chain and off-chain data sources for comprehensive market analysis.",
      },
      {
        capability: "consulting",
        label: "Fact Check",
        budgetRange: [10, 20],
        description:
          "Independent verification of claims, data points, and statistical assertions.",
      },
      {
        capability: "data_analysis",
        label: "Report Delivery",
        budgetRange: [5, 15],
        description:
          "Compile findings into a structured, actionable report with visualizations.",
      },
    ],
    totalBudgetRange: [30, 65],
    estimatedDuration: "3-6 hours",
  },
  {
    id: "security-remediation-verification",
    name: "Security Audit \u2192 Remediation \u2192 Verification",
    description:
      "Full security lifecycle: deep audit, automated fix implementation, and independent re-verification.",
    icon: Shield,
    category: "engineering",
    stages: [
      {
        capability: "security_audit",
        label: "Security Audit",
        budgetRange: [30, 60],
        description:
          "Comprehensive security review: static analysis, symbolic execution, manual patterns.",
      },
      {
        capability: "code_review",
        label: "Remediation",
        budgetRange: [20, 40],
        description:
          "Implement fixes for all identified vulnerabilities with test coverage.",
      },
      {
        capability: "testing",
        label: "Verification",
        budgetRange: [15, 25],
        description:
          "Independent re-audit to confirm all findings are resolved and no regressions introduced.",
      },
    ],
    totalBudgetRange: [65, 125],
    estimatedDuration: "4-8 hours",
  },
  {
    id: "invoice-kyb-payout",
    name: "Invoice Intake \u2192 KYB Check \u2192 Stablecoin Payout",
    description:
      "Automated B2B payment flow: ingest invoice data, verify counterparty, execute stablecoin settlement.",
    icon: TrendingUp,
    category: "finance",
    stages: [
      {
        capability: "data_analysis",
        label: "Invoice Intake",
        budgetRange: [5, 10],
        description:
          "Parse and validate invoice documents, extract line items, verify totals.",
      },
      {
        capability: "consulting",
        label: "KYB Check",
        budgetRange: [15, 25],
        description:
          "Know-Your-Business verification: entity registration, sanctions screening, risk scoring.",
      },
      {
        capability: "deployment",
        label: "Stablecoin Payout",
        budgetRange: [5, 10],
        description:
          "Execute on-chain stablecoin transfer to verified recipient address.",
      },
    ],
    totalBudgetRange: [25, 45],
    estimatedDuration: "1-2 hours",
  },
  {
    id: "rwa-diligence-risk-legal-settlement",
    name: "RWA Due Diligence \u2192 Risk Score \u2192 Legal Review \u2192 Settlement",
    description:
      "Institutional-grade RWA pipeline: asset analysis, quantitative risk scoring, legal compliance, and final settlement.",
    icon: Scale,
    category: "compliance",
    stages: [
      {
        capability: "data_analysis",
        label: "Due Diligence",
        budgetRange: [20, 40],
        description:
          "Asset provenance verification, valuation cross-check, and documentation review.",
      },
      {
        capability: "consulting",
        label: "Risk Score",
        budgetRange: [10, 20],
        description:
          "Quantitative risk assessment: volatility, liquidity, counterparty, and regulatory risk.",
      },
      {
        capability: "consulting",
        label: "Legal Review",
        budgetRange: [25, 50],
        description:
          "Jurisdiction-specific compliance check, regulatory filing requirements, and legal opinion.",
      },
      {
        capability: "deployment",
        label: "Settlement",
        budgetRange: [10, 15],
        description:
          "Execute on-chain settlement with escrow release and final confirmation.",
      },
    ],
    totalBudgetRange: [65, 125],
    estimatedDuration: "6-12 hours",
  },
  {
    id: "data-pipeline-validation-delivery",
    name: "Data Pipeline \u2192 Validation \u2192 Delivery",
    description:
      "Automated data workflow: extract and transform data, validate quality, deliver to target destination.",
    icon: Cog,
    category: "operations",
    stages: [
      {
        capability: "data_analysis",
        label: "Data Pipeline",
        budgetRange: [10, 20],
        description:
          "Extract data from on-chain and API sources, transform into unified schema.",
      },
      {
        capability: "testing",
        label: "Validation",
        budgetRange: [5, 15],
        description:
          "Schema validation, outlier detection, completeness checks, and data quality scoring.",
      },
      {
        capability: "deployment",
        label: "Delivery",
        budgetRange: [5, 10],
        description:
          "Push validated dataset to destination: IPFS, API endpoint, or on-chain storage.",
      },
    ],
    totalBudgetRange: [20, 45],
    estimatedDuration: "1-3 hours",
  },
];

type CategoryFilter = "all" | WorkflowTemplate["category"];

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "engineering", label: "Engineering" },
  { key: "finance", label: "Finance" },
  { key: "research", label: "Research" },
  { key: "compliance", label: "Compliance" },
  { key: "operations", label: "Operations" },
];

type Props = {
  onLaunchTemplate: (
    stages: {
      capability: string;
      label: string;
      budgetRange: [number, number];
      description: string;
    }[]
  ) => void;
};

export function WorkflowTemplates({ onLaunchTemplate }: Props) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered =
    category === "all"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === category);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div>
      <div className="section-header">
        <h2>Workflow Templates</h2>
        <p className="section-subtitle">
          Pre-built multi-stage pipelines. Click to launch.
        </p>
      </div>

      {/* Category Filters */}
      <div className="quick-filters" style={{ marginBottom: "1.5rem" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`quick-filter${category === c.key ? " active" : ""}`}
            onClick={() => setCategory(c.key)}
          >
            {c.key !== "all" && (() => {
              const Icon = CATEGORY_ICONS[c.key as WorkflowTemplate["category"]];
              return <Icon size={13} style={{ marginRight: "0.3rem" }} />;
            })()}
            {c.label}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="template-grid">
        {filtered.map((template, i) => {
          const Icon = template.icon;
          const isExpanded = expandedId === template.id;

          return (
            <motion.div
              key={template.id}
              className="glass-card template-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              whileHover={{ y: -4 }}
            >
              {/* Card Header */}
              <div className="template-card-header">
                <div className="template-icon-wrap">
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="template-name">{template.name}</div>
                  <span
                    className={`pill template-category-pill ${
                      template.category === "engineering"
                        ? "pill-blue"
                        : template.category === "finance"
                        ? "pill-green"
                        : template.category === "research"
                        ? "pill-yellow"
                        : template.category === "compliance"
                        ? "pill-purple"
                        : "pill-gray"
                    }`}
                  >
                    {CATEGORY_LABELS[template.category]}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="template-description">{template.description}</p>

              {/* Meta Row */}
              <div className="template-meta">
                <span className="template-meta-item">
                  <Layers size={13} />
                  {template.stages.length} stages
                </span>
                <span className="template-meta-item">
                  <TrendingUp size={13} />$
                  {template.totalBudgetRange[0]}-{template.totalBudgetRange[1]}{" "}
                  USDC
                </span>
                <span className="template-meta-item">
                  <Clock size={13} />~{template.estimatedDuration}
                </span>
              </div>

              {/* Expand/Collapse Button */}
              <button
                className="template-expand-btn"
                onClick={() => toggleExpand(template.id)}
              >
                {isExpanded ? (
                  <>
                    Hide details <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    View stages <ChevronDown size={14} />
                  </>
                )}
              </button>

              {/* Expanded Stage Timeline */}
              {isExpanded && (
                <motion.div
                  className="template-timeline"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {template.stages.map((stage, si) => (
                    <div key={si} className="template-timeline-stage">
                      <div className="template-timeline-indicator">
                        <div className="template-timeline-dot" />
                        {si < template.stages.length - 1 && (
                          <div className="template-timeline-line" />
                        )}
                      </div>
                      <div className="template-timeline-content">
                        <div className="template-timeline-label">
                          <span className="template-stage-number">
                            {si + 1}
                          </span>
                          {stage.label}
                        </div>
                        <p className="template-timeline-desc">
                          {stage.description}
                        </p>
                        <div className="template-timeline-meta">
                          <span className="pill pill-gray">
                            {stage.capability.replace(/_/g, " ")}
                          </span>
                          <span className="template-budget-tag">
                            ${stage.budgetRange[0]}-{stage.budgetRange[1]} USDC
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Launch Button */}
              <button
                className="btn-primary template-launch-btn"
                onClick={() => onLaunchTemplate(template.stages)}
              >
                <Rocket size={14} />
                Launch Workflow
                <ArrowRight size={14} />
              </button>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <Search size={40} className="empty-icon" />
          <p>No templates in this category yet.</p>
        </div>
      )}
    </div>
  );
}
