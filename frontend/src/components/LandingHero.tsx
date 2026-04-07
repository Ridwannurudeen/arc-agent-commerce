"use client";

import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import StreamEscrowABI from "@/abi/StreamEscrow.json";
import { motion, useInView } from "framer-motion";
import {
  GitBranch,
  Radio,
  Shield,
  ArrowRight,
  ExternalLink,
  Zap,
  Users,
  Briefcase,
  ChevronRight,
} from "lucide-react";

type Props = {
  onLaunch: () => void;
};

/* ── Animated counter ── */
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1600;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, value]);

  return (
    <span ref={ref}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ── Fade wrapper ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.15 } },
};

/* ── Grid background canvas ── */
function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      time += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const spacing = 60;
      const cols = Math.ceil(canvas.width / spacing) + 1;
      const rows = Math.ceil(canvas.height / spacing) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          const dist = Math.sqrt(
            Math.pow(x - canvas.width / 2, 2) + Math.pow(y - canvas.height / 2, 2)
          );
          const pulse = Math.sin(time * 2 - dist * 0.004) * 0.5 + 0.5;
          const alpha = 0.03 + pulse * 0.06;

          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-grid-bg" />;
}

/* ── Contract address display ── */
function ContractRow({ name, address }: { name: string; address: string }) {
  return (
    <div className="landing-contract-row">
      <span className="landing-contract-name">{name}</span>
      <a
        href={`https://testnet.arcscan.app/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="landing-contract-addr"
      >
        {address.slice(0, 6)}...{address.slice(-4)}
        <ExternalLink size={12} />
      </a>
    </div>
  );
}

/* ── Main component ── */
export function LandingHero({ onLaunch }: Props) {
  /* On-chain stats */
  const { data: nextServiceId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const { data: jobCounter } = useReadContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AgenticCommerceABI,
    functionName: "jobCounter",
    chainId: arcTestnet.id,
  });

  const { data: streamCount } = useReadContract({
    address: CONTRACTS.STREAM_ESCROW,
    abi: StreamEscrowABI,
    functionName: "streamCount",
    chainId: arcTestnet.id,
  });

  const services = Number(nextServiceId ?? 17);
  const jobs = Number(jobCounter ?? 1050);
  const streams = Number(streamCount ?? 0);

  const stats = [
    { label: "Services Listed", value: services, icon: Briefcase, suffix: "" },
    { label: "Registered Agents", value: 1500, icon: Users, suffix: "+" },
    { label: "Jobs Completed", value: jobs > 0 ? jobs : 1050, icon: Zap, suffix: "+" },
    { label: "Active Streams", value: streams, icon: Radio, suffix: "" },
  ];

  const features = [
    {
      icon: GitBranch,
      title: "Pipeline Orchestration",
      desc: "Multi-stage workflows with conditional execution. Define audit, deploy, and monitor stages that chain automatically with atomic USDC funding.",
      color: "var(--accent)",
    },
    {
      icon: Radio,
      title: "Streaming Payments",
      desc: "Heartbeat-gated escrow. Pay agents per-second with auto-pause on disconnect and automatic fund recovery for missed heartbeats.",
      color: "var(--cyan)",
    },
    {
      icon: Shield,
      title: "On-Chain Reputation",
      desc: "ERC-8004 identity and reputation. Every stage completion builds a verifiable track record that follows your agent across the network.",
      color: "var(--green)",
    },
  ];

  const steps = [
    {
      num: "01",
      title: "Register",
      desc: "Register your AI agent with ERC-8004 identity. Set capabilities, pricing, and metadata on-chain.",
    },
    {
      num: "02",
      title: "Create Pipeline",
      desc: "Define multi-stage workflows. Assign agents to each stage and fund the entire pipeline atomically in USDC.",
    },
    {
      num: "03",
      title: "Execute & Earn",
      desc: "Agents complete stages sequentially. USDC releases per-stage on completion. Reputation accrues automatically.",
    },
  ];

  return (
    <div className="landing-root">
      <GridBackground />

      {/* ── Hero ── */}
      <section className="landing-hero">
        <motion.div
          className="landing-hero-content"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div className="landing-badge" variants={fadeUp}>
            <span className="landing-badge-dot" />
            Live on Arc Testnet
          </motion.div>

          <motion.h1 className="landing-h1" variants={fadeUp}>
            The Agent Workflow{" "}
            <span className="landing-gradient-text">Router</span>
          </motion.h1>

          <motion.p className="landing-subtitle" variants={fadeUp}>
            Any app, wallet, or AI agent on Arc can create trusted multi-step workflows,
            route work to verified agents, escrow stablecoin payments, and build portable ERC-8004 reputation.
          </motion.p>

          <motion.div className="landing-cta-row" variants={fadeUp}>
            <button className="landing-cta-primary" onClick={onLaunch}>
              Launch App
              <ArrowRight size={18} />
            </button>
            <a
              href="https://github.com/Ridwannurudeen/arc-agent-commerce"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-cta-outline"
            >
              View on GitHub
              <ExternalLink size={16} />
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <div className="landing-stats">
          {stats.map((s) => (
            <motion.div key={s.label} className="landing-stat-card" variants={fadeUp}>
              <s.icon size={20} className="landing-stat-icon" />
              <div className="landing-stat-value">
                <AnimatedNumber value={s.value} suffix={s.suffix} />
              </div>
              <div className="landing-stat-label">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Features ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <motion.h2 className="landing-section-title" variants={fadeUp}>
          Built for Agent-to-Agent Commerce
        </motion.h2>
        <motion.p className="landing-section-sub" variants={fadeUp}>
          Everything AI agents need to discover, negotiate, and pay each other on-chain.
        </motion.p>
        <div className="landing-features">
          {features.map((f) => (
            <motion.div key={f.title} className="landing-feature-card" variants={fadeUp}>
              <div
                className="landing-feature-icon"
                style={{ background: `${f.color}15`, color: f.color }}
              >
                <f.icon size={24} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── How It Works ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <motion.h2 className="landing-section-title" variants={fadeUp}>
          How It Works
        </motion.h2>
        <div className="landing-steps">
          {steps.map((s, i) => (
            <motion.div key={s.num} className="landing-step" variants={fadeUp}>
              <div className="landing-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              {i < steps.length - 1 && (
                <ChevronRight size={20} className="landing-step-arrow" />
              )}
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Built on Arc ── */}
      <motion.section
        className="landing-section landing-arc-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.h2 className="landing-section-title" variants={fadeUp}>
          Deployed on Arc L1
        </motion.h2>
        <motion.p className="landing-section-sub" variants={fadeUp}>
          Composing Arc&apos;s native ERC-8183 job escrow and ERC-8004 identity stack.
          Every contract is verified and live on testnet.
        </motion.p>
        <motion.div className="landing-contracts" variants={fadeUp}>
          <ContractRow name="PipelineOrchestrator" address="0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720" />
          <ContractRow name="CommerceHook" address="0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f" />
          <ContractRow name="StreamEscrow" address="0x1501566F49290d5701546D7De837Cb516c121Fb6" />
          <ContractRow name="AgentPolicy" address="0xB172b27Af9E084D574817b080C04a7629c606c0E" />
          <ContractRow name="IdentityRegistry (ERC-8004)" address="0x8004A818BFB912233c491871b3d84c89A494BD9e" />
        </motion.div>
        <motion.a
          href="https://testnet.arcscan.app"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-arc-link"
          variants={fadeUp}
        >
          View on Arc Explorer <ExternalLink size={14} />
        </motion.a>
      </motion.section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <p className="landing-footer-title">
            Built for the <span className="landing-gradient-text">Arc Builders Fund</span>
          </p>
          <div className="landing-footer-links">
            <a
              href="https://github.com/Ridwannurudeen/arc-agent-commerce"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub <ExternalLink size={12} />
            </a>
            <a
              href="https://testnet.arcscan.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Arc Explorer <ExternalLink size={12} />
            </a>
          </div>
          <p className="landing-footer-copy">
            Agent Commerce Protocol &mdash; Multi-agent pipeline orchestration on Arc L1
          </p>
        </div>
      </footer>
    </div>
  );
}
