"use client";

import { useEffect, useRef, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import { motion, useInView } from "framer-motion";
import { ArrowRight, ArrowUpRight, Code2, ExternalLink } from "lucide-react";

type Props = {
  onLaunch: () => void;
};

/* ── Animated counter ── */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1400;
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

  return <span ref={ref}>{display.toLocaleString()}</span>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" as const } },
};
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

/* ── Pipeline animation SVG ── */
function PipelineViz() {
  return (
    <div className="landing-viz">
      <div className="landing-viz-glow" aria-hidden="true" />
      <svg viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" aria-label="Pipeline flow visualization">
        <defs>
          <linearGradient id="cool-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a8cff" />
            <stop offset="100%" stopColor="#6ea8ff" />
          </linearGradient>
          <linearGradient id="warm-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5b25e" />
            <stop offset="100%" stopColor="#ff9d6e" />
          </linearGradient>
          <radialGradient id="orb-cool">
            <stop offset="0%" stopColor="#6ea8ff" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#4a8cff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4a8cff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orb-warm">
            <stop offset="0%" stopColor="#ff9d6e" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#f5b25e" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#f5b25e" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer ring */}
        <circle cx="240" cy="240" r="200" fill="none" stroke="rgba(74, 140, 255, 0.08)" strokeWidth="1" />
        <circle cx="240" cy="240" r="150" fill="none" stroke="rgba(74, 140, 255, 0.06)" strokeWidth="1" />

        {/* Connection lines */}
        <path d="M 130 180 Q 175 150 220 180" fill="none" stroke="url(#cool-grad)" strokeWidth="1.6" strokeLinecap="round" className="viz-line viz-line-1" opacity="0.7" />
        <path d="M 240 240 Q 285 210 330 240" fill="none" stroke="url(#cool-grad)" strokeWidth="1.6" strokeLinecap="round" className="viz-line viz-line-2" opacity="0.7" />
        <path d="M 350 300 Q 305 330 260 300" fill="none" stroke="url(#warm-grad)" strokeWidth="1.6" strokeLinecap="round" className="viz-line viz-line-3" opacity="0.7" />

        {/* Center hub — Orchestrator */}
        <g transform="translate(240, 240)">
          <circle r="56" fill="url(#orb-cool)" opacity="0.25" />
          <circle r="42" fill="rgba(13, 13, 20, 0.95)" stroke="url(#cool-grad)" strokeWidth="1.5" className="viz-node-cool" />
          <text textAnchor="middle" dy="-3" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="rgba(255,255,245,0.5)" letterSpacing="1">PIPELINE</text>
          <text textAnchor="middle" dy="11" fontSize="11" fontWeight="500" fontFamily="Fraunces, serif" fill="#fafaf5">orchestrator</text>
        </g>

        {/* Stage 1 — top left */}
        <g transform="translate(110, 170)">
          <circle r="36" fill="url(#orb-cool)" opacity="0.3" />
          <circle r="26" fill="rgba(13, 13, 20, 0.95)" stroke="url(#cool-grad)" strokeWidth="1.4" className="viz-node-cool-2" />
          <text textAnchor="middle" dy="-3" fontSize="7" fontFamily="JetBrains Mono, monospace" fill="rgba(255,255,245,0.4)" letterSpacing="0.5">STAGE 1</text>
          <text textAnchor="middle" dy="9" fontSize="11" fontFamily="Fraunces, serif" fontStyle="italic" fill="#fafaf5">audit</text>
        </g>

        {/* Stage 2 — top right */}
        <g transform="translate(360, 240)">
          <circle r="36" fill="url(#orb-cool)" opacity="0.3" />
          <circle r="26" fill="rgba(13, 13, 20, 0.95)" stroke="url(#cool-grad)" strokeWidth="1.4" className="viz-node-cool-3" />
          <text textAnchor="middle" dy="-3" fontSize="7" fontFamily="JetBrains Mono, monospace" fill="rgba(255,255,245,0.4)" letterSpacing="0.5">STAGE 2</text>
          <text textAnchor="middle" dy="9" fontSize="11" fontFamily="Fraunces, serif" fontStyle="italic" fill="#fafaf5">deploy</text>
        </g>

        {/* Stage 3 — bottom — settled */}
        <g transform="translate(220, 340)">
          <circle r="36" fill="url(#orb-warm)" opacity="0.35" />
          <circle r="26" fill="rgba(13, 13, 20, 0.95)" stroke="url(#warm-grad)" strokeWidth="1.4" className="viz-node-warm" />
          <text textAnchor="middle" dy="-3" fontSize="7" fontFamily="JetBrains Mono, monospace" fill="rgba(245,178,94,0.6)" letterSpacing="0.5">SETTLED</text>
          <text textAnchor="middle" dy="9" fontSize="11" fontFamily="Fraunces, serif" fontStyle="italic" fill="#fafaf5">monitor</text>
        </g>

        {/* USDC token labels floating */}
        <g opacity="0.55">
          <text x="60" y="100" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#5fd49b" letterSpacing="0.5">+50 USDC</text>
          <text x="380" y="160" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#5fd49b" letterSpacing="0.5">+30 USDC</text>
          <text x="100" y="380" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#5fd49b" letterSpacing="0.5">+20 USDC</text>
        </g>

        {/* Subtle grid dots inside the ring */}
        <g opacity="0.18" fill="rgba(255, 255, 245, 0.4)">
          {Array.from({ length: 14 }).map((_, i) => {
            const angle = (i / 14) * Math.PI * 2;
            const x = 240 + Math.cos(angle) * 120;
            const y = 240 + Math.sin(angle) * 120;
            return <circle key={i} cx={x} cy={y} r="1.2" />;
          })}
        </g>
      </svg>
    </div>
  );
}

/* ── Contract row ── */
function ContractRow({ name, tag, address }: { name: string; tag: string; address: string }) {
  return (
    <div className="landing-contract-row">
      <div>
        <span className="landing-contract-name">{name}</span>
        <span className="landing-contract-tag">{tag}</span>
      </div>
      <a
        href={`https://testnet.arcscan.app/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="landing-contract-addr"
      >
        {address}
      </a>
      <a
        href={`https://testnet.arcscan.app/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="landing-contract-explorer"
      >
        Explorer <ArrowUpRight size={11} />
      </a>
    </div>
  );
}

/* ── Live activity ticker ── */
function ActivityTicker({ pipelineCount }: { pipelineCount: number }) {
  const recentIds = Array.from({ length: Math.min(5, pipelineCount) }, (_, i) => pipelineCount - 1 - i);
  const reads = useReadContracts({
    contracts: recentIds.map((id) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR,
      abi: PipelineOrchestratorABI as any,
      functionName: "pipelines",
      args: [BigInt(id)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: pipelineCount > 0 },
  });

  const pipelineStatusLabel = (statusIdx: number) => {
    switch (statusIdx) {
      case 0: return { label: "Active", attr: "active" };
      case 1: return { label: "Settled", attr: "completed" };
      case 2: return { label: "Halted", attr: "halted" };
      case 3: return { label: "Cancelled", attr: "halted" };
      default: return { label: "—", attr: "active" };
    }
  };

  return (
    <div className="landing-ticker">
      <div className="landing-ticker-head">
        <span className="landing-ticker-title">Recent pipelines</span>
        <a className="landing-ticker-link" href={`https://testnet.arcscan.app/address/${CONTRACTS.PIPELINE_ORCHESTRATOR}`} target="_blank" rel="noopener noreferrer">
          all on Arc Explorer →
        </a>
      </div>

      <div className="landing-ticker-rows">
        {recentIds.length === 0 && (
          <div className="landing-ticker-empty">No pipelines yet — yours could be #0.</div>
        )}
        {recentIds.map((id, idx) => {
          const r = reads.data?.[idx];
          const data = r?.status === "success" ? (r.result as any) : null;
          const status = data ? pipelineStatusLabel(Number(data[7])) : { label: "Loading", attr: "active" };
          const stageCount = data ? Number(data[6]) : null;
          const totalBudget = data ? Number(data[3]) / 1e6 : null;
          return (
            <div className="landing-ticker-row" key={id}>
              <span className="landing-ticker-id">#{id}</span>
              <span className="landing-ticker-meta">
                {stageCount !== null ? `${stageCount} stage${stageCount === 1 ? "" : "s"}` : "—"}
                {totalBudget !== null && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--text)" }}>{totalBudget.toFixed(2)} USDC</span>
                  </>
                )}
              </span>
              <span className="landing-ticker-status" data-status={status.attr}>{status.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Logo glyph (used in masthead + footer) ── */
function MarkGlyph() {
  return <span className="landing-mark-glyph" aria-hidden="true" />;
}

/* ── Main component ── */
export function LandingHero({ onLaunch }: Props) {
  const { data: nextPipelineId } = useReadContract({
    address: CONTRACTS.PIPELINE_ORCHESTRATOR,
    abi: PipelineOrchestratorABI,
    functionName: "nextPipelineId",
    chainId: arcTestnet.id,
  });

  const { data: jobCounter } = useReadContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: AgenticCommerceABI,
    functionName: "jobCounter",
    chainId: arcTestnet.id,
  });

  const pipelines = Number(nextPipelineId ?? 0);
  const jobs = Number(jobCounter ?? 0);

  return (
    <div className="landing-root">
      <div className="landing-glow-bg" />
      <div className="landing-grid-bg" />

      {/* ── Masthead ── */}
      <header className="landing-masthead">
        <div className="landing-masthead-inner">
          <span className="landing-mark">
            <MarkGlyph />
            Agent Commerce Protocol
          </span>
          <span className="landing-chain-badge">
            <span className="landing-chain-dot" />
            Arc Testnet · 5042002
          </span>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <motion.div className="landing-hero-text" initial="hidden" animate="visible" variants={stagger}>
          <motion.div className="landing-eyebrow" variants={fadeUp}>
            <span className="landing-eyebrow-dot" />
            <strong>Live</strong>·{pipelines === 0
              ? "Arc Testnet · 5042002"
              : `${pipelines} pipeline${pipelines === 1 ? "" : "s"} on-chain`}
          </motion.div>

          <motion.h1 className="landing-h1" variants={fadeUp}>
            <span className="landing-h1-mono">ERC&#8209;8183</span>
            <br />
            conditional <span className="landing-h1-accent">sequencer.</span>
          </motion.h1>

          <motion.p className="landing-lede" variants={fadeUp}>
            A small composable primitive on Arc. Define an ordered sequence of
            ERC&#8209;8183 jobs, fund them <strong>atomically</strong>, and let the protocol
            advance &mdash; or refund &mdash; on each stage&rsquo;s outcome.
          </motion.p>

          <motion.div className="landing-cta-row" variants={fadeUp}>
            <button className="landing-cta-primary" onClick={onLaunch}>
              Open the protocol
              <ArrowRight size={16} />
            </button>
            <a
              href="https://github.com/Ridwannurudeen/arc-agent-commerce"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-cta-secondary"
            >
              <Code2 size={15} />
              Source
            </a>
          </motion.div>

          <motion.div className="landing-meta-strip" variants={fadeUp}>
            <span><strong><AnimatedNumber value={pipelines} /></strong>Pipelines</span>
            <span><strong><AnimatedNumber value={jobs} /></strong>ERC&#8209;8183 jobs</span>
            <span><strong>177</strong>Tests · CI green</span>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: "easeOut" }}>
          <PipelineViz />
        </motion.div>
      </section>

      {/* ── Anatomy ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <motion.div variants={fadeUp}>
          <div className="landing-section-eyebrow">Anatomy</div>
          <h2 className="landing-section-title">Two thin contracts. <em>Composes Arc, doesn&rsquo;t fork it.</em></h2>
          <p className="landing-section-sub">
            No new escrow, no new identity, no new token. Stage funds live in
            ERC&#8209;8183. Reputation lives on ERC&#8209;8004. The protocol owns
            the sequence and nothing else.
          </p>
        </motion.div>

        <div className="landing-anatomy">
          <motion.article className="landing-anatomy-card" variants={fadeUp}>
            <div className="landing-anatomy-num"><span>01</span> Contract</div>
            <h3>PipelineOrchestrator</h3>
            <p>
              Holds the sequence and the total budget. Creates one ERC&#8209;8183 job per
              stage on demand. Advances on approval, halts and refunds atomically on
              rejection or cancellation. ~370 lines of Solidity.
            </p>
          </motion.article>

          <motion.article className="landing-anatomy-card" variants={fadeUp}>
            <div className="landing-anatomy-num"><span>02</span> Contract</div>
            <h3>CommerceHook</h3>
            <p>
              Evaluator on every ERC&#8209;8183 job in the pipeline. Records ERC&#8209;8004
              reputation on each outcome. Manual approval today via{" "}
              <code>approveStage()</code>; the <code>afterAction</code> surface is in
              place for autonomous evaluation.
            </p>
          </motion.article>

          <motion.article className="landing-anatomy-card" variants={fadeUp}>
            <div className="landing-anatomy-num"><span>03</span> Composition</div>
            <h3>What it does <em>not</em> own</h3>
            <p>
              No new escrow. No new identity. No new token. Currency is whatever
              ERC&#8209;20 the owner allowlists &mdash; <code>USDC</code> and <code>EURC</code>{" "}
              by default. Coordination layer, not settlement layer.
            </p>
          </motion.article>
        </div>
      </motion.section>

      {/* ── Five-line code ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
        style={{ paddingTop: "2rem" }}
      >
        <motion.div variants={fadeUp}>
          <div className="landing-section-eyebrow">In five lines</div>
          <h2 className="landing-section-title">Atomically funded. <em>Conditionally halted.</em></h2>
          <p className="landing-section-sub">
            One transaction locks the whole pipeline budget. Stage <code style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text)" }}>N+1</code>
            {" "}only starts if stage <code style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text)" }}>N</code> is approved.
            If any stage is rejected, unstarted budgets refund in the same call.
          </p>
        </motion.div>

        <motion.figure className="landing-codefig" variants={fadeUp}>
          <div className="landing-codefig-header">
            <div className="landing-codefig-dots">
              <span className="landing-codefig-dot" />
              <span className="landing-codefig-dot" />
              <span className="landing-codefig-dot" />
            </div>
            <span className="landing-codefig-tag">arc_commerce — python</span>
          </div>
          <div className="landing-codefig-body">
            <pre className="landing-codeblock"><span className="tk-com"># two-stage pipeline: audit -&gt; deploy</span>
{"\n"}pipeline_id = orchestrator.<span className="tk-key">create_pipeline</span>(
{"\n"}    <span className="tk-key">client_agent_id</span>=<span className="tk-num">933</span>,
{"\n"}    <span className="tk-key">stages</span>=[
{"\n"}        {"{"}<span className="tk-str">"capability"</span>: <span className="tk-str">"audit"</span>,  <span className="tk-str">"budget_usdc"</span>: <span className="tk-num">50</span>{"}"},
{"\n"}        {"{"}<span className="tk-str">"capability"</span>: <span className="tk-str">"deploy"</span>, <span className="tk-str">"budget_usdc"</span>: <span className="tk-num">30</span>{"}"},
{"\n"}    ],
{"\n"}    <span className="tk-key">currency</span>=<span className="tk-str">"USDC"</span>,
{"\n"})</pre>
          </div>
        </motion.figure>
      </motion.section>

      {/* ── Live data ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <motion.div variants={fadeUp}>
          <div className="landing-section-eyebrow">On-chain truth</div>
          <h2 className="landing-section-title">Live data <em>from the deployed contracts.</em></h2>
          <p className="landing-section-sub">
            Numbers below are read directly from Arc Testnet. No projections, no inflation.
          </p>
        </motion.div>

        <div className="landing-figures">
          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-label">Pipelines</div>
            <div className="landing-figure-value"><AnimatedNumber value={pipelines} /></div>
            <div className="landing-figure-source"><code>nextPipelineId</code></div>
          </motion.div>
          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-label">ERC&#8209;8183 jobs</div>
            <div className="landing-figure-value"><AnimatedNumber value={jobs} /></div>
            <div className="landing-figure-source"><code>jobCounter</code></div>
          </motion.div>
          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-label">Tests</div>
            <div className="landing-figure-value">177</div>
            <div className="landing-figure-source">118 Solidity · 59 Python</div>
          </motion.div>
          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-label">Network</div>
            <div className="landing-figure-value" style={{ fontSize: "1.6rem", letterSpacing: "-0.01em" }}>Arc Testnet</div>
            <div className="landing-figure-source">chain · 5042002</div>
          </motion.div>
        </div>

        <motion.div variants={fadeUp}>
          <ActivityTicker pipelineCount={pipelines} />
        </motion.div>
      </motion.section>

      {/* ── Deployed contracts ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <motion.div variants={fadeUp}>
          <div className="landing-section-eyebrow">Deployed</div>
          <h2 className="landing-section-title">Verified on Arc Testnet.</h2>
          <p className="landing-section-sub">
            Two contracts that constitute the primitive, plus the Arc-native stack
            the protocol composes.
          </p>
        </motion.div>

        <motion.div className="landing-contracts" variants={fadeUp}>
          <ContractRow
            name="PipelineOrchestrator"
            tag="Sequencer · UUPS"
            address="0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7"
          />
          <ContractRow
            name="CommerceHook"
            tag="Evaluator · UUPS"
            address="0x792170848bEcFf0B90c5095E58c08F35F5efB72c"
          />
          <ContractRow
            name="AgenticCommerce"
            tag="ERC-8183 · Arc-native"
            address="0x0747EEf0706327138c69792bF28Cd525089e4583"
          />
          <ContractRow
            name="IdentityRegistry"
            tag="ERC-8004 · Arc-native"
            address="0x8004A818BFB912233c491871b3d84c89A494BD9e"
          />
          <ContractRow
            name="ReputationRegistry"
            tag="ERC-8004 · Arc-native"
            address="0x8004B663056A597Dffe9eCcC1965A193B7388713"
          />
        </motion.div>
      </motion.section>

      {/* ── CTA banner ── */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
        <motion.div className="landing-cta-banner" variants={fadeUp}>
          <h2 className="landing-cta-banner-title">
            Composing the primitive in <em>your</em> Arc app?
          </h2>
          <p className="landing-cta-banner-sub">
            The protocol takes no fee on pipeline creation. Read the integration
            guide and ship.
          </p>
          <div className="landing-cta-banner-row">
            <button className="landing-cta-primary" onClick={onLaunch}>
              Open the protocol <ArrowRight size={16} />
            </button>
            <a
              href="https://github.com/Ridwannurudeen/arc-agent-commerce/blob/master/docs/INTEGRATING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-cta-secondary"
            >
              Integration guide <ExternalLink size={14} />
            </a>
          </div>
        </motion.div>
      </motion.section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-cols">
            <div className="landing-footer-brand">
              <span className="landing-footer-brand-mark"><MarkGlyph />Agent Commerce Protocol</span>
              <p className="landing-footer-brand-text">
                An ERC&#8209;8183 conditional sequencer on Arc. Composable, fee-free,
                currency-agnostic.
              </p>
            </div>
            <div>
              <div className="landing-footer-label">Resources</div>
              <div className="landing-footer-links">
                <a href="https://github.com/Ridwannurudeen/arc-agent-commerce" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={11} /></a>
                <a href="https://github.com/Ridwannurudeen/arc-agent-commerce/blob/master/docs/INTEGRATING.md" target="_blank" rel="noopener noreferrer">Integration guide <ArrowUpRight size={11} /></a>
                <a href="https://github.com/Ridwannurudeen/arc-agent-commerce/blob/master/BUILDERS_FUND.md" target="_blank" rel="noopener noreferrer">Builders Fund spec <ArrowUpRight size={11} /></a>
              </div>
            </div>
            <div>
              <div className="landing-footer-label">Network</div>
              <div className="landing-footer-links">
                <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer">Arc Explorer <ArrowUpRight size={11} /></a>
                <a href="https://docs.arc.network" target="_blank" rel="noopener noreferrer">Arc Docs <ArrowUpRight size={11} /></a>
                <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Testnet faucet <ArrowUpRight size={11} /></a>
              </div>
            </div>
            <div>
              <div className="landing-footer-label">Status</div>
              <div className="landing-footer-links">
                <a href="https://arc.gudman.xyz/api/stats" target="_blank" rel="noopener noreferrer">/api/stats <ArrowUpRight size={11} /></a>
                <a href="https://github.com/Ridwannurudeen/arc-agent-commerce/actions" target="_blank" rel="noopener noreferrer">CI <ArrowUpRight size={11} /></a>
              </div>
            </div>
          </div>
          <div className="landing-footer-rule" />
          <div className="landing-footer-bottom">
            <span>Agent Commerce Protocol · Arc · 2026</span>
            <span>Mainnet pending audit</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
