#!/usr/bin/env python3
"""
Autonomous Agent Demo — Arc Agent Commerce Protocol

Two AI agents autonomously discover each other, escrow USDC,
complete work, and earn reputation on Arc Testnet.

  BUILDER  (Client Agent #933)  — needs a smart contract audit
  AUDITOR  (Provider Agent #934) — offers audit services

Usage:
    cd sdk/examples
    python demo.py

Environment (or .env file):
    ARC_CLIENT_PK=0x...    # Agent #933 wallet
    ARC_PROVIDER_PK=0x...  # Agent #934 wallet
"""

import os
import sys
import time
import warnings
from functools import wraps

# Suppress web3 ABI mismatch warnings (non-matching events in shared receipts)
warnings.filterwarnings("ignore", message=".*MismatchedABI.*")

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from web3 import Web3
from arc_commerce.client import ArcCommerce


def retry(fn, retries=3, delay=3):
    """Retry an RPC call on transient network errors."""
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            err = str(type(e).__name__)
            if "Connection" in err or "Resolution" in err or "gaierror" in str(e):
                if attempt == retries - 1:
                    raise
                time.sleep(delay)
            else:
                raise
from arc_commerce.constants import (
    SERVICE_MARKET_ADDRESS,
    SERVICE_ESCROW_ADDRESS,
    USDC_ADDRESS,
)
from arc_commerce.types import AgreementStatus

from demo_ui import (
    CYAN, MAGENTA, GREEN, YELLOW, RED, BOLD, RESET, DIM,
    banner, phase, agent_log, agent_sub, tx_link, usdc_fmt,
    check_line, report_box, summary_box, error_exit,
)

# ── Config ──

CLIENT_AGENT_ID = 933
PROVIDER_AGENT_ID = 944
CAPABILITY = "smart_contract_audit"
AUDIT_PRICE_USDC = 1.0
TASK_DESCRIPTION = "Audit ERC-20 token contract for security vulnerabilities"
DEADLINE_HOURS = 48
METADATA_URI = "ipfs://QmAuditServiceMetadata"

# ── Load env ──

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional


# ══════════════════════════════════════════════════════════════
#  Provider Agent (AUDITOR)
# ══════════════════════════════════════════════════════════════

class ProviderAgent:
    """Autonomous audit provider — Agent #934."""

    NAME = "AUDITOR"
    COLOR = MAGENTA

    def __init__(self, private_key: str):
        self.sdk = ArcCommerce(private_key=private_key)
        self.address = self.sdk.account.address
        self.known_agreement_ids: set[int] = set()
        self.initial_balance = 0

    def boot(self):
        """Initialize: log wallet, cache existing agreements."""
        agent_log(self.NAME, self.COLOR, f"Booting Agent #{PROVIDER_AGENT_ID}")
        agent_sub(self.NAME, self.COLOR, f"Wallet: {self.address}")

        self.initial_balance = retry(
            lambda: self.sdk.usdc.functions.balanceOf(self.address).call()
        )
        agent_sub(self.NAME, self.COLOR, f"Balance: {usdc_fmt(self.initial_balance)}")

        existing = retry(lambda: self.sdk.get_provider_agreements(self.address))
        self.known_agreement_ids = {a.agreement_id for a in existing}
        agent_sub(
            self.NAME, self.COLOR,
            f"Known agreements: {len(self.known_agreement_ids)}"
        )

    def ensure_service_listed(self) -> int:
        """Check for existing audit service; list one if none found."""
        agent_log(self.NAME, self.COLOR, "Checking for existing audit service...")
        services = retry(lambda: self.sdk.get_services_by_agent(PROVIDER_AGENT_ID))
        for svc in services:
            if svc.active and svc.capability_hash == Web3.keccak(text=CAPABILITY):
                agent_sub(
                    self.NAME, self.COLOR,
                    f"Reusing Service #{svc.service_id} "
                    f"({usdc_fmt(svc.price_per_task)}/task)"
                )
                return svc.service_id

        agent_log(self.NAME, self.COLOR, "No existing service — listing new one")
        service_id = self.sdk.list_service(
            agent_id=PROVIDER_AGENT_ID,
            capability=CAPABILITY,
            price_usdc=AUDIT_PRICE_USDC,
            metadata_uri=METADATA_URI,
        )
        agent_log(
            self.NAME, self.COLOR,
            f"{GREEN}Service #{service_id} listed{RESET} — "
            f"{usdc_fmt(int(AUDIT_PRICE_USDC * 1_000_000))}/task"
        )
        return service_id

    def poll_for_work(self, timeout: int = 30) -> int:
        """Poll chain for a new ACTIVE agreement not in known set."""
        agent_log(self.NAME, self.COLOR, "Polling chain for new work...")
        start = time.time()
        while time.time() - start < timeout:
            agreements = retry(lambda: self.sdk.get_provider_agreements(self.address))
            for a in agreements:
                if (
                    a.agreement_id not in self.known_agreement_ids
                    and a.status == AgreementStatus.ACTIVE
                ):
                    agent_log(
                        self.NAME, self.COLOR,
                        f"{GREEN}New job detected!{RESET} "
                        f"Agreement #{a.agreement_id} — {usdc_fmt(a.amount)}"
                    )
                    self.known_agreement_ids.add(a.agreement_id)
                    return a.agreement_id
            time.sleep(2)
        error_exit("Provider timed out waiting for work")

    def execute_audit(self, agreement_id: int) -> str:
        """Simulate a 5-check security audit with delays."""
        agent_log(self.NAME, self.COLOR, f"Starting audit for Agreement #{agreement_id}")

        checks = [
            ("Reentrancy analysis", True),
            ("Integer overflow checks", True),
            ("Access control review", True),
            ("Front-running vectors", True),
            ("Flash loan attack surface", True),
        ]

        for i, (name, passed) in enumerate(checks, 1):
            time.sleep(1.5)
            check_line(i, len(checks), name, passed)

        report_lines = [
            f"{BOLD}SECURITY AUDIT REPORT{RESET}",
            f"Agreement: #{agreement_id}",
            f"Auditor:   Agent #{PROVIDER_AGENT_ID}",
            "",
            "Findings: 0 Critical, 0 High, 1 Medium, 2 Info",
            "",
            "  [M-01] Missing zero-address check in transfer()",
            "  [I-01] Consider using SafeERC20 wrapper",
            "  [I-02] Events missing indexed parameters",
            "",
            f"Verdict: {GREEN}PASS{RESET} — Safe for deployment",
        ]

        print()
        report_box(report_lines)

        agent_log(
            self.NAME, self.COLOR,
            f"{GREEN}Audit complete{RESET} — deliverable ready"
        )
        return "AUDIT_PASSED"


# ══════════════════════════════════════════════════════════════
#  Client Agent (BUILDER)
# ══════════════════════════════════════════════════════════════

class ClientAgent:
    """Autonomous client seeking audits — Agent #933."""

    NAME = "BUILDER"
    COLOR = CYAN

    def __init__(self, private_key: str):
        self.sdk = ArcCommerce(private_key=private_key)
        self.address = self.sdk.account.address
        self.initial_balance = 0
        self.tx_hashes: list[str] = []

    def boot(self):
        """Initialize: log wallet, check USDC balance."""
        agent_log(self.NAME, self.COLOR, f"Booting Agent #{CLIENT_AGENT_ID}")
        agent_sub(self.NAME, self.COLOR, f"Wallet: {self.address}")

        self.initial_balance = retry(
            lambda: self.sdk.usdc.functions.balanceOf(self.address).call()
        )
        agent_sub(self.NAME, self.COLOR, f"Balance: {usdc_fmt(self.initial_balance)}")

        required = int(AUDIT_PRICE_USDC * 1_000_000)
        if self.initial_balance < required:
            error_exit(
                f"Client needs {usdc_fmt(required)} but has "
                f"{usdc_fmt(self.initial_balance)}"
            )

    def discover_services(self):
        """Find available audit services on-chain."""
        agent_log(self.NAME, self.COLOR, "Searching for audit services...")
        services = retry(lambda: self.sdk.find_services(CAPABILITY))
        if not services:
            error_exit("No audit services found on-chain")

        services.sort(key=lambda s: s.price_per_task)
        agent_log(
            self.NAME, self.COLOR,
            f"Found {len(services)} audit service(s):"
        )
        for svc in services:
            agent_sub(
                self.NAME, self.COLOR,
                f"Service #{svc.service_id} — Agent #{svc.agent_id} — "
                f"{usdc_fmt(svc.price_per_task)}"
            )
        return services

    def hire_provider(self, service) -> int:
        """Approve USDC and create escrow agreement (separate txs for logging)."""
        amount = service.price_per_task
        agent_log(
            self.NAME, self.COLOR,
            f"Hiring Agent #{service.agent_id} via Service #{service.service_id}"
        )

        # TX 1: Approve USDC
        agent_log(self.NAME, self.COLOR, f"Approving {usdc_fmt(amount)} to escrow...")
        approve_receipt = self.sdk._send_tx(
            self.sdk.usdc.functions.approve(
                Web3.to_checksum_address(SERVICE_ESCROW_ADDRESS), amount
            )
        )
        approve_hash = approve_receipt["transactionHash"].hex()
        self.tx_hashes.append(approve_hash)
        agent_sub(self.NAME, self.COLOR, f"TX: {tx_link(approve_hash)}")

        # TX 2: Create agreement — call _send_tx directly to capture receipt
        agent_log(self.NAME, self.COLOR, "Creating escrow agreement...")
        deadline = int(time.time() + DEADLINE_HOURS * 3600)
        task_hash = Web3.keccak(text=TASK_DESCRIPTION)
        create_receipt = self.sdk._send_tx(
            self.sdk.escrow.functions.createAgreement(
                Web3.to_checksum_address(service.provider),
                service.agent_id,
                CLIENT_AGENT_ID,
                amount,
                deadline,
                task_hash,
                service.service_id,
            )
        )
        create_hash = create_receipt["transactionHash"].hex()
        self.tx_hashes.append(create_hash)
        agent_sub(self.NAME, self.COLOR, f"TX: {tx_link(create_hash)}")

        # Parse agreement ID from event
        logs = self.sdk.escrow.events.AgreementCreated().process_receipt(
            create_receipt
        )
        agreement_id = logs[0]["args"]["agreementId"] if logs else -1

        agent_log(
            self.NAME, self.COLOR,
            f"{GREEN}Agreement #{agreement_id} created{RESET} — "
            f"{usdc_fmt(amount)} escrowed"
        )
        return agreement_id

    def verify_and_confirm(self, agreement_id: int, report: str) -> str:
        """Verify deliverable and confirm completion on-chain."""
        agent_log(
            self.NAME, self.COLOR,
            f"Verifying deliverable for Agreement #{agreement_id}..."
        )
        time.sleep(1)

        if report != "AUDIT_PASSED":
            error_exit(f"Audit failed — not confirming (report: {report})")

        agent_log(self.NAME, self.COLOR, f"{GREEN}Deliverable verified{RESET}")
        agent_log(self.NAME, self.COLOR, "Confirming completion — releasing payment...")

        receipt = self.sdk.confirm_completion(agreement_id)
        confirm_hash = receipt["transactionHash"].hex()
        self.tx_hashes.append(confirm_hash)
        agent_sub(self.NAME, self.COLOR, f"TX: {tx_link(confirm_hash)}")

        agent_log(
            self.NAME, self.COLOR,
            f"{GREEN}Payment released + reputation recorded{RESET}"
        )
        return confirm_hash


# ══════════════════════════════════════════════════════════════
#  Orchestrator
# ══════════════════════════════════════════════════════════════

def main():
    start_time = time.time()

    # Load keys
    client_pk = os.environ.get("ARC_CLIENT_PK")
    provider_pk = os.environ.get("ARC_PROVIDER_PK")
    if not client_pk or not provider_pk:
        error_exit(
            "Set ARC_CLIENT_PK and ARC_PROVIDER_PK in environment or .env file"
        )

    banner(SERVICE_MARKET_ADDRESS, SERVICE_ESCROW_ADDRESS)

    # ── Phase 1: Agent Initialization ──
    phase(1, "AGENT INITIALIZATION")

    provider = ProviderAgent(provider_pk)
    client = ClientAgent(client_pk)
    provider.boot()
    print()
    client.boot()

    # ── Phase 2: Service Registration ──
    phase(2, "SERVICE REGISTRATION")

    service_id = provider.ensure_service_listed()

    # ── Phase 3: Service Discovery & Hiring ──
    phase(3, "SERVICE DISCOVERY & HIRING")

    services = client.discover_services()
    cheapest = services[0]  # sorted by price
    print()
    agreement_id = client.hire_provider(cheapest)

    # ── Phase 4: Task Detection & Execution ──
    phase(4, "TASK DETECTION & EXECUTION")

    detected_id = provider.poll_for_work(timeout=30)
    assert detected_id == agreement_id, "Agreement ID mismatch"
    print()
    report = provider.execute_audit(agreement_id)

    # ── Phase 5: Verification & Payment ──
    phase(5, "VERIFICATION & PAYMENT")

    client.verify_and_confirm(agreement_id, report)

    # ── Phase 6: Summary ──
    phase(6, "SUMMARY")

    elapsed = time.time() - start_time
    client_final = client.sdk.usdc.functions.balanceOf(client.address).call()
    provider_final = provider.sdk.usdc.functions.balanceOf(provider.address).call()

    summary_box({
        "Agreement ID": f"#{agreement_id}",
        "On-chain TXs": f"{len(client.tx_hashes)}",
        "": "",
        "Client balance (before)": usdc_fmt(client.initial_balance),
        "Client balance (after)": usdc_fmt(client_final),
        f"  {DIM}change{RESET}": usdc_fmt(client_final - client.initial_balance),
        " ": "",
        "Provider balance (before)": usdc_fmt(provider.initial_balance),
        "Provider balance (after)": usdc_fmt(provider_final),
        f"  {DIM}change{RESET} ": usdc_fmt(provider_final - provider.initial_balance),
        "  ": "",
        "Elapsed": f"{elapsed:.1f}s",
    })

    print(f"  {DIM}Verify on-chain:{RESET}")
    for h in client.tx_hashes:
        print(f"    {tx_link(h)}")
    print()


if __name__ == "__main__":
    main()
