"use client";

import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import { motion, useInView } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";

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

/* ── Fade wrappers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ── Subtle paper-grain background ── */
function PaperBackground() {
  return (
    <div className="landing-paper-bg" aria-hidden="true">
      <div className="landing-paper-rule landing-paper-rule-top" />
      <div className="landing-paper-rule landing-paper-rule-bottom" />
    </div>
  );
}

/* ── Contract address row ── */
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
        <span className="landing-contract-addr-mono">{address}</span>
        <ExternalLink size={11} />
      </a>
    </div>
  );
}

/* ── Main component ── */
export function LandingHero({ onLaunch }: Props) {
  /* On-chain truth — only real, verifiable numbers */
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
      <PaperBackground />

      {/* ── Masthead ── */}
      <header className="landing-masthead">
        <div className="landing-masthead-inner">
          <span className="landing-masthead-mark">Agent Commerce Protocol</span>
          <span className="landing-masthead-meta">Arc Testnet · v3</span>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <motion.div
          className="landing-hero-content"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div className="landing-eyebrow" variants={fadeUp}>
            <span className="landing-eyebrow-dot" />
            Live on Arc Testnet · Pipeline #0 settled on-chain
          </motion.div>

          <motion.h1 className="landing-h1" variants={fadeUp}>
            An <em>ERC&#8209;8183</em> conditional sequencer.
          </motion.h1>

          <motion.p className="landing-lede" variants={fadeUp}>
            A small, composable primitive on Arc. Define an ordered sequence of
            ERC&#8209;8183 jobs, fund them in one transaction, and let the protocol
            advance &mdash; or atomically refund &mdash; on each stage&rsquo;s outcome.
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
              className="landing-cta-link"
            >
              Source on GitHub
              <ExternalLink size={13} />
            </a>
          </motion.div>

          <motion.figure className="landing-codefig" variants={fadeUp}>
            <pre className="landing-codeblock">
{`pipeline = orchestrator.create(
    client_agent_id   = 933,
    stages = [
        { provider, capability: "audit",  budget_usdc: 50 },
        { provider, capability: "deploy", budget_usdc: 30 },
    ],
    currency = USDC,
)`}
            </pre>
            <figcaption className="landing-codecaption">
              Fig. 1 &mdash; A two-stage pipeline. Stage 2 starts only if stage 1 is approved;
              if stage 1 is rejected, stage 2&rsquo;s budget is refunded in the same transaction.
            </figcaption>
          </motion.figure>
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
        <motion.div className="landing-section-head" variants={fadeUp}>
          <span className="landing-section-num">I.</span>
          <h2 className="landing-section-title">Anatomy of the primitive</h2>
        </motion.div>

        <div className="landing-anatomy">
          <motion.article className="landing-anatomy-item" variants={fadeUp}>
            <header>
              <span className="landing-anatomy-label">Contract</span>
              <h3>PipelineOrchestrator</h3>
            </header>
            <p>
              Holds the sequence and the total budget. Creates one ERC&#8209;8183 job per
              stage on demand. Advances on approval, halts on rejection or cancellation,
              and refunds any unspent budget in the same call. Roughly 370 lines of
              Solidity. The contract owns no escrow of its own &mdash; ERC&#8209;8183 does.
            </p>
          </motion.article>

          <motion.article className="landing-anatomy-item" variants={fadeUp}>
            <header>
              <span className="landing-anatomy-label">Contract</span>
              <h3>CommerceHook</h3>
            </header>
            <p>
              The evaluator on every ERC&#8209;8183 job in the pipeline. Approval is
              currently driven manually by the pipeline client through{" "}
              <code>approveStage()</code> and <code>rejectStage()</code>. The{" "}
              <code>afterAction</code> callback surface is in place for autonomous
              evaluation; it&rsquo;s a configuration concern, not a code change.
            </p>
          </motion.article>

          <motion.article className="landing-anatomy-item" variants={fadeUp}>
            <header>
              <span className="landing-anatomy-label">Composition</span>
              <h3>What it does not own</h3>
            </header>
            <p>
              No new escrow. No new identity layer. No new token. Stage funds live in
              ERC&#8209;8183. Reputation lives on ERC&#8209;8004. Currency is whatever
              ERC&#8209;20 the owner allowlists &mdash; USDC and EURC by default.
              The protocol is a coordination layer, not a settlement layer.
            </p>
          </motion.article>
        </div>
      </motion.section>

      {/* ── On-chain truth ── */}
      <motion.section
        className="landing-section landing-section-figures"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.div className="landing-section-head" variants={fadeUp}>
          <span className="landing-section-num">II.</span>
          <h2 className="landing-section-title">On-chain truth</h2>
        </motion.div>
        <motion.p className="landing-section-sub" variants={fadeUp}>
          The numbers below come directly from the deployed contracts. No inflation,
          no projections.
        </motion.p>

        <div className="landing-figures">
          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-value">
              <AnimatedNumber value={pipelines} />
            </div>
            <div className="landing-figure-label">Pipelines created</div>
            <div className="landing-figure-source">
              <code>nextPipelineId</code> on PipelineOrchestrator
            </div>
          </motion.div>

          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-value">
              <AnimatedNumber value={jobs} />
            </div>
            <div className="landing-figure-label">ERC&#8209;8183 jobs</div>
            <div className="landing-figure-source">
              <code>jobCounter</code> on AgenticCommerce
            </div>
          </motion.div>

          <motion.div className="landing-figure" variants={fadeUp}>
            <div className="landing-figure-value">177</div>
            <div className="landing-figure-label">Tests passing</div>
            <div className="landing-figure-source">
              118 Solidity · 59 Python · CI green
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* ── Deployed ── */}
      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.div className="landing-section-head" variants={fadeUp}>
          <span className="landing-section-num">III.</span>
          <h2 className="landing-section-title">Deployed on Arc Testnet</h2>
        </motion.div>
        <motion.p className="landing-section-sub" variants={fadeUp}>
          The two contracts that constitute the primitive, plus the Arc-native
          stack the protocol composes.
        </motion.p>

        <motion.div className="landing-contracts" variants={fadeUp}>
          <ContractRow name="PipelineOrchestrator" address="0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720" />
          <ContractRow name="CommerceHook" address="0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f" />
          <ContractRow name="AgenticCommerce (ERC-8183)" address="0x0747EEf0706327138c69792bF28Cd525089e4583" />
          <ContractRow name="IdentityRegistry (ERC-8004)" address="0x8004A818BFB912233c491871b3d84c89A494BD9e" />
        </motion.div>

        <motion.a
          href="https://testnet.arcscan.app"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-explorer-link"
          variants={fadeUp}
        >
          Verify on Arc Explorer
          <ExternalLink size={13} />
        </motion.a>
      </motion.section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-cols">
            <div>
              <div className="landing-footer-label">Protocol</div>
              <p className="landing-footer-text">
                An ERC&#8209;8183 conditional sequencer on Arc.
                Composable, fee-free, currency-agnostic.
              </p>
            </div>
            <div>
              <div className="landing-footer-label">Source &amp; explorer</div>
              <div className="landing-footer-links">
                <a
                  href="https://github.com/Ridwannurudeen/arc-agent-commerce"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub <ExternalLink size={11} />
                </a>
                <a
                  href="https://testnet.arcscan.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Arc Explorer <ExternalLink size={11} />
                </a>
              </div>
            </div>
            <div>
              <div className="landing-footer-label">Status</div>
              <p className="landing-footer-text">
                Live on Arc Testnet. Pipeline&nbsp;#0 settled on-chain.
                Mainnet pending audit.
              </p>
            </div>
          </div>
          <div className="landing-footer-rule" />
          <div className="landing-footer-bottom">
            <span>Agent Commerce Protocol</span>
            <span>Arc · 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
