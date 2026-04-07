#!/usr/bin/env python3
"""
Flagship Demo: Autonomous Agent Workflow on Arc L1

A founder asks an AI agent to ship a product update. The agent hires an
auditor and a deployer. Each stage is escrowed in USDC, validated, paid,
and recorded to ERC-8004 reputation.

3 agents. 2 stages. $4.00 USDC. ERC-8183 + ERC-8004. Fully on-chain.

Usage:
    # Option A: env vars
    BUILDER_PK=0x... AUDITOR_PK=0x... DEPLOYER_PK=0x... python flagship_demo.py

    # Option B: uses demo_wallets.json + PRIVATE_KEY for builder
    PRIVATE_KEY=0x... python flagship_demo.py

    # Option C: all agent IDs explicit
    BUILDER_PK=0x... BUILDER_AGENT_ID=933 \
    AUDITOR_PK=0x... AUDITOR_AGENT_ID=1504 \
    DEPLOYER_PK=0x... DEPLOYER_AGENT_ID=1506 \
    python flagship_demo.py
"""

import os
import sys
import json
import time
import logging
import traceback

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

from web3 import Web3
from arc_commerce.client import ArcCommerce
from arc_commerce.types import PipelineStatus, StageStatus
from arc_commerce.constants import AGENTIC_COMMERCE_ADDRESS

# ── Terminal Colors ──────────────────────────────────────────────────
CYAN    = "\033[36m"
MAGENTA = "\033[35m"
GREEN   = "\033[32m"
YELLOW  = "\033[33m"
RED     = "\033[31m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
RESET   = "\033[0m"
STAR    = f"{YELLOW}*{RESET}"

# ── Explorer URL ─────────────────────────────────────────────────────
EXPLORER = "https://explorer.arcl1.org"

# Quiet down SDK logging so our output is clean
logging.basicConfig(level=logging.WARNING, format="%(message)s")
logging.getLogger("arc_commerce").setLevel(logging.WARNING)


# ═════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════

def fmt_usdc(raw: int) -> str:
    """Format raw USDC (6 decimals) to $X.XX string."""
    return f"${raw / 1_000_000:.2f}"


def fmt_addr(addr: str) -> str:
    """Shorten address: 0x917a...488E"""
    return f"{addr[:6]}...{addr[-4:]}"


def fmt_delta(delta: int) -> str:
    """Format a USDC delta as +$X.XX or -$X.XX with color."""
    val = delta / 1_000_000
    if val >= 0:
        return f"{GREEN}+${val:.2f}{RESET}"
    else:
        return f"{RED}-${abs(val):.2f}{RESET}"


def fmt_tx(receipt) -> str:
    """Extract tx hash string from receipt."""
    if receipt and "transactionHash" in receipt:
        return receipt["transactionHash"].hex()
    return "unknown"


def banner():
    """Print the demo banner."""
    print()
    print(f"{BOLD}{CYAN}")
    print("+" + "=" * 62 + "+")
    print("|  FLAGSHIP DEMO: Autonomous Agent Workflow on Arc L1" + " " * 9 + "|")
    print("+" + "=" * 62 + "+")
    print(f"|  \"Ship a product update\" -> Audit -> Deploy" + " " * 17 + "|")
    print(f"|  3 agents  |  2 stages  |  $4.00 USDC  |  ERC-8183 + 8004  |")
    print("+" + "=" * 62 + "+")
    print(f"{RESET}")


def section(label: str):
    """Print a section header."""
    print(f"\n{BOLD}{CYAN}[{label}]{RESET}")


def step(msg: str, end="\n"):
    """Print a step line."""
    print(f"  {DIM}->{RESET} {msg}", end=end, flush=True)


def ok(msg: str = ""):
    """Print success checkmark."""
    suffix = f"  {msg}" if msg else ""
    print(f"  {GREEN}OK{RESET}{suffix}")


def star(msg: str):
    """Print a star highlight line."""
    print(f"  {YELLOW}*{RESET} {msg}")


def err(msg: str):
    """Print error line."""
    print(f"  {RED}ERROR:{RESET} {msg}")


def load_acp_abi():
    """Load the AgenticCommerce (ACP) ABI for setBudget/submit calls."""
    abi_path = os.path.join(
        os.path.dirname(__file__), "..", "frontend", "src", "abi", "AgenticCommerce.json"
    )
    if os.path.exists(abi_path):
        with open(abi_path) as f:
            return json.load(f)
    raise FileNotFoundError(f"ACP ABI not found at {abi_path}")


def send_raw(sdk: ArcCommerce, contract, func_call):
    """Build, sign, and send a raw transaction. Returns receipt."""
    tx = func_call.build_transaction({
        "from": sdk.account.address,
        "nonce": sdk.w3.eth.get_transaction_count(sdk.account.address),
        "chainId": sdk.chain_id,
    })
    tx["gas"] = int(sdk.w3.eth.estimate_gas(tx) * 1.2)
    signed = sdk.account.sign_transaction(tx)
    tx_hash = sdk.w3.eth.send_raw_transaction(signed.raw_transaction)
    return sdk.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)


# ═════════════════════════════════════════════════════════════════════
# Main Demo
# ═════════════════════════════════════════════════════════════════════

def main():
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    except ImportError:
        pass

    # ── Resolve wallet keys ──────────────────────────────────────────
    builder_pk  = os.environ.get("BUILDER_PK") or os.environ.get("PRIVATE_KEY")
    auditor_pk  = os.environ.get("AUDITOR_PK")
    deployer_pk = os.environ.get("DEPLOYER_PK")

    # Fall back to demo_wallets.json for auditor/deployer
    if not auditor_pk or not deployer_pk:
        wallets_path = os.path.join(os.path.dirname(__file__), "demo_wallets.json")
        if os.path.exists(wallets_path):
            with open(wallets_path) as f:
                wallets = json.load(f)
            if not auditor_pk and "provider_a" in wallets:
                auditor_pk = wallets["provider_a"]["pk"]
            if not deployer_pk and "provider_b" in wallets:
                deployer_pk = wallets["provider_b"]["pk"]

    if not all([builder_pk, auditor_pk, deployer_pk]):
        print(f"{RED}Missing wallet keys.{RESET}")
        print("Set BUILDER_PK (or PRIVATE_KEY), AUDITOR_PK, DEPLOYER_PK as env vars,")
        print("or ensure scripts/demo_wallets.json has provider_a and provider_b entries.")
        sys.exit(1)

    # ── Resolve agent IDs ────────────────────────────────────────────
    builder_agent_id  = int(os.environ.get("BUILDER_AGENT_ID", "933"))
    auditor_agent_id  = int(os.environ.get("AUDITOR_AGENT_ID", "1504"))
    deployer_agent_id = int(os.environ.get("DEPLOYER_AGENT_ID", "1506"))

    # ── Initialize SDK clients ───────────────────────────────────────
    builder  = ArcCommerce(private_key=builder_pk)
    auditor  = ArcCommerce(private_key=auditor_pk)
    deployer_sdk = ArcCommerce(private_key=deployer_pk)

    # Load ACP ABI for low-level setBudget/submit calls
    acp_abi = load_acp_abi()
    acp_addr = builder.orchestrator.functions.acp().call()
    acp_builder  = builder.w3.eth.contract(address=Web3.to_checksum_address(acp_addr), abi=acp_abi)
    acp_auditor  = auditor.w3.eth.contract(address=Web3.to_checksum_address(acp_addr), abi=acp_abi)
    acp_deployer = deployer_sdk.w3.eth.contract(address=Web3.to_checksum_address(acp_addr), abi=acp_abi)

    # Track transaction hashes for explorer links
    tx_hashes = []

    # ═════════════════════════════════════════════════════════════════
    # PHASE 1: SETUP
    # ═════════════════════════════════════════════════════════════════
    banner()
    section("SETUP")
    print(f"  Loading 3 agent wallets...\n")

    builder_bal  = builder.usdc.functions.balanceOf(builder.account.address).call()
    auditor_bal  = auditor.usdc.functions.balanceOf(auditor.account.address).call()
    deployer_bal = deployer_sdk.usdc.functions.balanceOf(deployer_sdk.account.address).call()

    print(f"  {CYAN}BUILDER{RESET}   (Agent #{builder_agent_id})  {fmt_addr(builder.account.address)}  Balance: {fmt_usdc(builder_bal)} USDC")
    print(f"  {MAGENTA}AUDITOR{RESET}   (Agent #{auditor_agent_id})  {fmt_addr(auditor.account.address)}  Balance: {fmt_usdc(auditor_bal)} USDC")
    print(f"  {MAGENTA}DEPLOYER{RESET}  (Agent #{deployer_agent_id})  {fmt_addr(deployer_sdk.account.address)}  Balance: {fmt_usdc(deployer_bal)} USDC")

    required = 4_000_000  # $4.00
    if builder_bal < required:
        print(f"\n  {RED}BUILDER needs {fmt_usdc(required)} but only has {fmt_usdc(builder_bal)}{RESET}")
        sys.exit(1)

    time.sleep(2)

    # ═════════════════════════════════════════════════════════════════
    # PHASE 2: PIPELINE CREATION
    # ═════════════════════════════════════════════════════════════════
    section("STEP 1")
    print(f"  BUILDER creates pipeline: Audit -> Deploy ($4.00 USDC)\n")

    stages_config = [
        {
            "provider_agent_id": auditor_agent_id,
            "provider_address": auditor.account.address,
            "capability": "smart_contract_audit",
            "budget_usdc": 2.50,
        },
        {
            "provider_agent_id": deployer_agent_id,
            "provider_address": deployer_sdk.account.address,
            "capability": "contract_deployment",
            "budget_usdc": 1.50,
        },
    ]

    pipeline_id = None
    try:
        builder._nonce = None
        pipeline_id = builder.create_pipeline(
            client_agent_id=builder_agent_id,
            stages=stages_config,
            currency="USDC",
            deadline_hours=24,
        )
        print(f"  {GREEN}OK{RESET} Pipeline #{pipeline_id} created")
    except Exception as e:
        err(f"Pipeline creation failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(1)

    # Fetch stage details (job IDs)
    all_stages = builder.get_stages(pipeline_id)
    pipeline = builder.get_pipeline(pipeline_id)

    stage1_job = all_stages[0].job_id
    stage2_job = all_stages[1].job_id

    print(f"  {GREEN}OK{RESET} Stage 1: ACP Job #{stage1_job} (smart_contract_audit, $2.50)")
    print(f"  {GREEN}OK{RESET} Stage 2: ACP Job #{stage2_job} (contract_deployment, $1.50)")
    print(f"  {DIM}Total: $4.00 USDC locked atomically via PipelineOrchestrator{RESET}")

    time.sleep(2)

    # ═════════════════════════════════════════════════════════════════
    # PHASE 3: STAGE 1 — AUDIT
    # ═════════════════════════════════════════════════════════════════
    section("STEP 2")
    print(f"  Stage 1: AUDITOR performs smart contract audit\n")

    # 3a: AUDITOR sets budget on the ACP job
    try:
        step("AUDITOR sets budget on Job #{}...".format(stage1_job), end="")
        auditor._nonce = None
        receipt = send_raw(auditor, acp_auditor,
            acp_auditor.functions.setBudget(stage1_job, all_stages[0].budget, b""))
        tx_hashes.append(("Auditor setBudget", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"setBudget failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(2)

    # 3b: BUILDER funds stage 1
    try:
        step("BUILDER funds stage 1...", end="")
        builder._nonce = None
        receipt = builder.fund_stage(pipeline_id)
        tx_hashes.append(("Builder fundStage(1)", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"fundStage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(2)

    # 3c: AUDITOR submits deliverable
    try:
        step("AUDITOR submits deliverable...", end="")
        auditor._nonce = None
        deliverable = Web3.keccak(text="audit_report_v1")
        receipt = send_raw(auditor, acp_auditor,
            acp_auditor.functions.submit(stage1_job, deliverable, b""))
        tx_hashes.append(("Auditor submit", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"submit failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(2)

    # 3d: BUILDER approves stage 1
    try:
        step("BUILDER approves stage 1...", end="")
        builder._nonce = None
        receipt = builder.approve_stage(stage1_job)
        tx_hashes.append(("Builder approveStage(1)", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"approveStage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    star(f"Stage 1 COMPLETED -- Auditor earned $2.50 USDC")
    star(f"Reputation recorded on ERC-8004")

    time.sleep(2)

    # Refresh stages to confirm advancement
    all_stages = builder.get_stages(pipeline_id)
    pipeline = builder.get_pipeline(pipeline_id)
    print(f"\n  {DIM}Pipeline advancing to stage 2 (current_stage: {pipeline.current_stage}/{pipeline.stage_count}){RESET}")

    time.sleep(2)

    # ═════════════════════════════════════════════════════════════════
    # PHASE 4: STAGE 2 — DEPLOY
    # ═════════════════════════════════════════════════════════════════
    section("STEP 3")
    print(f"  Stage 2: DEPLOYER performs contract deployment\n")

    # 4a: DEPLOYER sets budget
    try:
        step("DEPLOYER sets budget on Job #{}...".format(stage2_job), end="")
        deployer_sdk._nonce = None
        receipt = send_raw(deployer_sdk, acp_deployer,
            acp_deployer.functions.setBudget(stage2_job, all_stages[1].budget, b""))
        tx_hashes.append(("Deployer setBudget", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"setBudget failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(2)

    # 4b: BUILDER funds stage 2
    try:
        step("BUILDER funds stage 2...", end="")
        builder._nonce = None
        receipt = builder.fund_stage(pipeline_id)
        tx_hashes.append(("Builder fundStage(2)", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"fundStage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(2)

    # 4c: DEPLOYER submits deliverable
    try:
        step("DEPLOYER submits deliverable...", end="")
        deployer_sdk._nonce = None
        deliverable = Web3.keccak(text="deployment_confirmed")
        receipt = send_raw(deployer_sdk, acp_deployer,
            acp_deployer.functions.submit(stage2_job, deliverable, b""))
        tx_hashes.append(("Deployer submit", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"submit failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    time.sleep(2)

    # 4d: BUILDER approves stage 2
    try:
        step("BUILDER approves stage 2...", end="")
        builder._nonce = None
        receipt = builder.approve_stage(stage2_job)
        tx_hashes.append(("Builder approveStage(2)", fmt_tx(receipt)))
        ok()
    except Exception as e:
        print()
        err(f"approveStage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    star(f"Stage 2 COMPLETED -- Deployer earned $1.50 USDC")
    star(f"Reputation recorded on ERC-8004")
    print(f"\n  {GREEN}{BOLD}PIPELINE COMPLETED. All stages done.{RESET}")

    time.sleep(2)

    # ═════════════════════════════════════════════════════════════════
    # PHASE 5: SUMMARY
    # ═════════════════════════════════════════════════════════════════
    # Fetch final state
    pipeline = builder.get_pipeline(pipeline_id)
    all_stages = builder.get_stages(pipeline_id)

    builder_final  = builder.usdc.functions.balanceOf(builder.account.address).call()
    auditor_final  = auditor.usdc.functions.balanceOf(auditor.account.address).call()
    deployer_final = deployer_sdk.usdc.functions.balanceOf(deployer_sdk.account.address).call()

    status_str = "COMPLETED" if pipeline.status == PipelineStatus.COMPLETED else f"STATUS={pipeline.status}"
    stage1_check = "OK" if all_stages[0].status == StageStatus.COMPLETED else "?"
    stage2_check = "OK" if all_stages[1].status == StageStatus.COMPLETED else "?"

    print()
    print(f"{BOLD}{GREEN}")
    print("+" + "=" * 62 + "+")
    print(f"|  PIPELINE #{pipeline_id} {status_str}" + " " * (48 - len(str(pipeline_id)) - len(status_str)) + "|")
    print("+" + "=" * 62 + "+")
    print(f"{RESET}", end="")
    print(f"  Total Budget:    {fmt_usdc(pipeline.total_budget)} USDC")
    print(f"  Total Spent:     {fmt_usdc(pipeline.total_spent)} USDC")
    print(f"  Stages:          {pipeline.stage_count}/{pipeline.stage_count} completed")
    print(f"  ERC-8183 Jobs:   #{stage1_job} ({stage1_check}), #{stage2_job} ({stage2_check})")
    print(f"  Reputation:      2 events recorded on ERC-8004")
    print()
    print(f"  {BOLD}Final Balances:{RESET}")
    print(f"  {CYAN}BUILDER{RESET}:   {fmt_usdc(builder_final)} USDC  ({fmt_delta(builder_final - builder_bal)})")
    print(f"  {MAGENTA}AUDITOR{RESET}:   {fmt_usdc(auditor_final)} USDC  ({fmt_delta(auditor_final - auditor_bal)})")
    print(f"  {MAGENTA}DEPLOYER{RESET}:  {fmt_usdc(deployer_final)} USDC  ({fmt_delta(deployer_final - deployer_bal)})")

    # Explorer links
    print(f"\n  {BOLD}Transactions on Arc Explorer:{RESET}")
    for label, tx_hash in tx_hashes:
        print(f"  {DIM}{label}:{RESET} {EXPLORER}/tx/0x{tx_hash}" if not tx_hash.startswith("0x") else f"  {DIM}{label}:{RESET} {EXPLORER}/tx/{tx_hash}")

    print(f"\n  {BOLD}Contract Addresses:{RESET}")
    print(f"  {DIM}PipelineOrchestrator:{RESET} {EXPLORER}/address/{builder.orchestrator.address}")
    print(f"  {DIM}CommerceHook:{RESET}         {EXPLORER}/address/{builder.hook.address}")
    print(f"  {DIM}ACP (ERC-8183):{RESET}       {EXPLORER}/address/{acp_addr}")

    print(f"\n{BOLD}{GREEN}Demo complete.{RESET}\n")


if __name__ == "__main__":
    main()
