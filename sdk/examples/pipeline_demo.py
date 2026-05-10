#!/usr/bin/env python3
"""
Three-Wallet Pipeline Demo (scripted, evaluator-driven)

Demonstrates the full pipeline lifecycle on Arc Testnet using three wallets
to play client and two providers. Approval is driven manually by the client
(evaluator path), not by autonomous agents.

Each stage runs the full ERC-8183 lifecycle:
    Open -> setBudget (provider) -> fund (client) -> submit (provider)
         -> approve (client) -> Completed

1. BUILDER creates a 2-stage pipeline (audit → deploy)
2. AUDITOR setBudget + (BUILDER funds) + AUDITOR submit
3. BUILDER approves stage 1 → stage 2 auto-starts
4. DEPLOYER setBudget + (BUILDER funds) + DEPLOYER submit
5. BUILDER approves stage 2 → pipeline completes

Usage:
    ARC_BUILDER_PK=0x... ARC_AUDITOR_PK=0x... ARC_DEPLOYER_PK=0x... \
    ARC_BUILDER_AGENT_ID=933 ARC_AUDITOR_AGENT_ID=934 ARC_DEPLOYER_AGENT_ID=935 \
    python pipeline_demo.py

Environment (or .env file):
    ARC_BUILDER_PK=0x...      # BUILDER wallet (Client)
    ARC_AUDITOR_PK=0x...      # AUDITOR wallet (Stage 1 provider)
    ARC_DEPLOYER_PK=0x...     # DEPLOYER wallet (Stage 2 provider)
    ARC_BUILDER_AGENT_ID=933
    ARC_AUDITOR_AGENT_ID=934
    ARC_DEPLOYER_AGENT_ID=935
"""

import os
import sys
import time
import logging

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from web3 import Web3
from arc_commerce.client import ArcCommerce
from arc_commerce.types import PipelineStatus, StageStatus

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("pipeline_demo")

# ── Color constants for terminal output ──
CYAN = "\033[36m"
MAGENTA = "\033[35m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def format_usdc(amount_raw: int) -> str:
    """Format raw USDC (6 decimals) as human-readable string."""
    return f"${amount_raw / 1e6:.2f}"


def stage_status_name(status: StageStatus) -> str:
    """Return human-readable stage status name."""
    names = {
        StageStatus.PENDING: "PENDING",
        StageStatus.ACTIVE: "ACTIVE",
        StageStatus.COMPLETED: "COMPLETED",
        StageStatus.FAILED: "FAILED",
    }
    return names.get(status, f"UNKNOWN({status})")


def pipeline_status_name(status: PipelineStatus) -> str:
    """Return human-readable pipeline status name."""
    names = {
        PipelineStatus.ACTIVE: "ACTIVE",
        PipelineStatus.COMPLETED: "COMPLETED",
        PipelineStatus.HALTED: "HALTED",
        PipelineStatus.CANCELLED: "CANCELLED",
    }
    return names.get(status, f"UNKNOWN({status})")


def print_stage_table(stages, pipeline_id, builder_sdk):
    """Print a formatted table of all pipeline stages."""
    print(f"{DIM}Pipeline #{pipeline_id} Stages:{RESET}")
    print(f"{DIM}{'─' * 80}{RESET}")
    for i, s in enumerate(stages):
        status_color = GREEN if s.status == StageStatus.COMPLETED else YELLOW
        print(
            f"  Stage {i}: {status_color}{stage_status_name(s.status):<10}{RESET} | "
            f"Job #{s.job_id:<4} | {format_usdc(s.budget):<8} | "
            f"Agent #{s.provider_agent_id} @ {s.provider_address[:10]}..."
        )
    print(f"{DIM}{'─' * 80}{RESET}")


def main():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # dotenv optional

    # ── Load environment variables ──
    builder_pk = os.environ.get("ARC_BUILDER_PK")
    auditor_pk = os.environ.get("ARC_AUDITOR_PK")
    deployer_pk = os.environ.get("ARC_DEPLOYER_PK")

    if not all([builder_pk, auditor_pk, deployer_pk]):
        log.error("Missing required env vars:")
        log.error("  ARC_BUILDER_PK, ARC_AUDITOR_PK, ARC_DEPLOYER_PK")
        sys.exit(1)

    builder_agent_id = int(os.environ.get("ARC_BUILDER_AGENT_ID", "933"))
    auditor_agent_id = int(os.environ.get("ARC_AUDITOR_AGENT_ID", "934"))
    deployer_agent_id = int(os.environ.get("ARC_DEPLOYER_AGENT_ID", "935"))

    # ── Initialize SDK clients ──
    log.info(f"{BOLD}=== Agent Commerce Pipeline Demo ==={RESET}")
    log.info("Initializing 3 wallet roles (1 client, 2 providers)...")

    builder = ArcCommerce(private_key=builder_pk)
    auditor = ArcCommerce(private_key=auditor_pk)
    deployer = ArcCommerce(private_key=deployer_pk)

    log.info(f"{CYAN}BUILDER{RESET}: {builder.account.address} (Agent #{builder_agent_id})")
    log.info(f"{MAGENTA}AUDITOR{RESET}: {auditor.account.address} (Agent #{auditor_agent_id})")
    log.info(f"{MAGENTA}DEPLOYER{RESET}: {deployer.account.address} (Agent #{deployer_agent_id})")

    # ── Check USDC balances ──
    log.info("\nChecking USDC balances...")
    builder_balance = builder.usdc.functions.balanceOf(builder.account.address).call()
    auditor_balance = auditor.usdc.functions.balanceOf(auditor.account.address).call()
    deployer_balance = deployer.usdc.functions.balanceOf(deployer.account.address).call()

    required_total = 80  # 50 + 30 USDC
    log.info(f"  {CYAN}BUILDER{RESET}: {format_usdc(builder_balance)}")
    log.info(f"  {MAGENTA}AUDITOR{RESET}: {format_usdc(auditor_balance)}")
    log.info(f"  {MAGENTA}DEPLOYER{RESET}: {format_usdc(deployer_balance)}")

    if builder_balance < required_total * 1_000_000:
        log.error(f"BUILDER needs {format_usdc(required_total * 1_000_000)} but has {format_usdc(builder_balance)}")
        sys.exit(1)

    # ═══════════════════════════════════════════════════════════════
    # Step 1: BUILDER creates pipeline
    # ═══════════════════════════════════════════════════════════════
    log.info(f"\n{BOLD}─ Step 1: BUILDER creates audit → deploy pipeline ─{RESET}")

    stages = [
        {
            "provider_agent_id": auditor_agent_id,
            "provider_address": auditor.account.address,
            "capability": "smart_contract_audit",
            "budget_usdc": 50.0,
        },
        {
            "provider_agent_id": deployer_agent_id,
            "provider_address": deployer.account.address,
            "capability": "contract_deployment",
            "budget_usdc": 30.0,
        },
    ]

    log.info(f"{CYAN}BUILDER{RESET} creating 2-stage pipeline...")
    log.info(f"  Stage 1: {MAGENTA}AUDITOR{RESET} — smart_contract_audit — {format_usdc(50_000_000)}")
    log.info(f"  Stage 2: {MAGENTA}DEPLOYER{RESET} — contract_deployment — {format_usdc(30_000_000)}")

    try:
        pipeline_id = builder.create_pipeline(
            client_agent_id=builder_agent_id,
            stages=stages,
            currency="USDC",
            deadline_hours=24,
        )
        log.info(f"{GREEN}✓ Pipeline #{pipeline_id} created!{RESET} Total: {format_usdc(80_000_000)} locked")
    except Exception as e:
        log.error(f"Failed to create pipeline: {e}")
        sys.exit(1)

    # Get pipeline status
    time.sleep(2)
    pipeline = builder.get_pipeline(pipeline_id)
    all_stages = builder.get_stages(pipeline_id)

    log.info(f"Pipeline status: {pipeline_status_name(pipeline.status)}")
    print_stage_table(all_stages, pipeline_id, builder)

    # ═══════════════════════════════════════════════════════════════
    # Step 2: AUDITOR drives stage 1 through the ACP lifecycle
    # ═══════════════════════════════════════════════════════════════
    log.info(f"\n{BOLD}─ Step 2: AUDITOR runs stage 1 (setBudget → fund → submit) ─{RESET}")

    stage1 = all_stages[0]
    log.info(f"{MAGENTA}AUDITOR{RESET} setBudget on Job #{stage1.job_id} ({format_usdc(stage1.budget)})...")
    auditor.set_budget(stage1.job_id, stage1.budget)

    log.info(f"{CYAN}BUILDER{RESET} fundStage(pipeline #{pipeline_id})...")
    builder.fund_stage(pipeline_id)

    audit_hash = Web3.keccak(text=f"audit_report:pipeline_{pipeline_id}:stage_1")
    log.info(f"{MAGENTA}AUDITOR{RESET} submit on Job #{stage1.job_id} (deliverable {audit_hash.hex()[:18]}...)")
    auditor.submit_job(stage1.job_id, audit_hash)

    # ═══════════════════════════════════════════════════════════════
    # Step 3: BUILDER approves stage 1
    # ═══════════════════════════════════════════════════════════════
    log.info(f"\n{BOLD}─ Step 3: BUILDER approves stage 1 ─{RESET}")

    log.info(f"{CYAN}BUILDER{RESET} approving stage 1 (Job #{stage1.job_id})...")
    try:
        builder.approve_stage(stage1.job_id)
        log.info(f"{GREEN}✓ Stage 1 approved!{RESET} Releasing {format_usdc(stage1.budget)} to AUDITOR")
    except Exception as e:
        log.error(f"Failed to approve stage 1: {e}")
        sys.exit(1)

    time.sleep(2)
    pipeline = builder.get_pipeline(pipeline_id)
    all_stages = builder.get_stages(pipeline_id)

    log.info(f"Pipeline status: {pipeline_status_name(pipeline.status)}")
    print_stage_table(all_stages, pipeline_id, builder)

    # ═══════════════════════════════════════════════════════════════
    # Step 4: DEPLOYER drives stage 2 through the ACP lifecycle
    # ═══════════════════════════════════════════════════════════════
    log.info(f"\n{BOLD}─ Step 4: DEPLOYER runs stage 2 (setBudget → fund → submit) ─{RESET}")

    stage2 = all_stages[1]
    log.info(f"{MAGENTA}DEPLOYER{RESET} setBudget on Job #{stage2.job_id} ({format_usdc(stage2.budget)})...")
    deployer.set_budget(stage2.job_id, stage2.budget)

    log.info(f"{CYAN}BUILDER{RESET} fundStage(pipeline #{pipeline_id})...")
    builder.fund_stage(pipeline_id)

    deploy_hash = Web3.keccak(text=f"deployment_tx:pipeline_{pipeline_id}:stage_2")
    log.info(f"{MAGENTA}DEPLOYER{RESET} submit on Job #{stage2.job_id} (deliverable {deploy_hash.hex()[:18]}...)")
    deployer.submit_job(stage2.job_id, deploy_hash)

    # ═══════════════════════════════════════════════════════════════
    # Step 5: BUILDER approves stage 2
    # ═══════════════════════════════════════════════════════════════
    log.info(f"\n{BOLD}─ Step 5: BUILDER approves stage 2 → pipeline completes ─{RESET}")

    log.info(f"{CYAN}BUILDER{RESET} approving stage 2 (Job #{stage2.job_id})...")
    try:
        builder.approve_stage(stage2.job_id)
        log.info(f"{GREEN}✓ Stage 2 approved!{RESET} Releasing {format_usdc(stage2.budget)} to DEPLOYER")
    except Exception as e:
        log.error(f"Failed to approve stage 2: {e}")
        sys.exit(1)

    time.sleep(2)
    pipeline = builder.get_pipeline(pipeline_id)
    all_stages = builder.get_stages(pipeline_id)

    # ═══════════════════════════════════════════════════════════════
    # Final Summary
    # ═══════════════════════════════════════════════════════════════
    log.info(f"\n{BOLD}{'═' * 80}{RESET}")
    log.info(f"{BOLD}FINAL PIPELINE STATUS{RESET}")
    log.info(f"{BOLD}{'═' * 80}{RESET}")

    log.info(f"Pipeline #{pipeline_id}: {pipeline_status_name(pipeline.status)}")
    log.info(f"Total budget: {format_usdc(pipeline.total_budget)}")
    log.info(f"Total spent: {format_usdc(pipeline.total_spent)}")
    log.info(f"Current stage: {pipeline.current_stage}/{pipeline.stage_count}")

    print_stage_table(all_stages, pipeline_id, builder)

    # Check final balances
    builder_final = builder.usdc.functions.balanceOf(builder.account.address).call()
    auditor_final = auditor.usdc.functions.balanceOf(auditor.account.address).call()
    deployer_final = deployer.usdc.functions.balanceOf(deployer.account.address).call()

    log.info("\nFinal USDC Balances:")
    log.info(f"  {CYAN}BUILDER{RESET}: {format_usdc(builder_balance)} → {format_usdc(builder_final)} "
             f"({DIM}{format_usdc(builder_final - builder_balance):+}{RESET})")
    log.info(f"  {MAGENTA}AUDITOR{RESET}: {format_usdc(auditor_balance)} → {format_usdc(auditor_final)} "
             f"({GREEN}{format_usdc(auditor_final - auditor_balance):+}{RESET})")
    log.info(f"  {MAGENTA}DEPLOYER{RESET}: {format_usdc(deployer_balance)} → {format_usdc(deployer_final)} "
             f"({GREEN}{format_usdc(deployer_final - deployer_balance):+}{RESET})")

    if pipeline.status == PipelineStatus.COMPLETED:
        log.info(f"\n{GREEN}{BOLD}✓ SUCCESS!{RESET} Pipeline completed — all stages delivered and paid.")
    else:
        log.info(f"\n{YELLOW}Pipeline not yet complete. Status: {pipeline_status_name(pipeline.status)}{RESET}")

    log.info(f"\n{DIM}Verify on Arc Testnet Explorer:{RESET}")
    log.info(f"  https://explorer.arcl1.org/address/{builder.account.address}")


if __name__ == "__main__":
    main()
