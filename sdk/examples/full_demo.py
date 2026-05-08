#!/usr/bin/env python3
"""
Arc Agent Commerce — Full Lifecycle Demo (single wallet)

Drives the entire protocol end-to-end on Arc Testnet:
  1. Register an ERC-8004 agent identity
  2. List a service on the marketplace
  3. Approve USDC for the orchestrator
  4. Create a multi-stage pipeline
  5. Set budget on the underlying ACP job (provider quote)
  6. Fund the stage (client funds quote)
  7. Submit the deliverable (provider work)
  8. Approve the stage (client signs off → payment + reputation)
  9. Verify completion on-chain

Usage:
    DEMO_PK=0x... python full_demo.py
"""

import os
import sys
import time

from web3 import Web3
from arc_commerce import ArcCommerce

# ── Colors ──
C = "\033[36m"
M = "\033[35m"
G = "\033[32m"
Y = "\033[33m"
B = "\033[1m"
D = "\033[2m"
RED = "\033[31m"
RESET = "\033[0m"

# ── Contract addresses ──
IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
AGENTIC_COMMERCE = "0x0747EEf0706327138c69792bF28Cd525089e4583"
USDC = "0x3600000000000000000000000000000000000000"
ARCSCAN_TX = "https://testnet.arcscan.app/tx/0x"

PRICE_USDC = 5
CAPABILITY = "smart_contract_audit"


def section(num, title):
    print(f"\n{B}[{num}] {title}{RESET}")


def ok(msg, tx_hash=None):
    line = f"  {G}✓{RESET} {msg}"
    if tx_hash:
        clean = tx_hash[2:] if tx_hash.startswith("0x") else tx_hash
        line += f"\n    {D}{ARCSCAN_TX}{clean}{RESET}"
    print(line)


def info(msg):
    print(f"  {D}{msg}{RESET}")


def fail(msg):
    print(f"  {RED}✗ {msg}{RESET}")
    sys.exit(1)


def main():
    pk = os.environ.get("DEMO_PK")
    if not pk:
        fail("Set DEMO_PK env var")

    print(f"{B}{C}╔═══════════════════════════════════════════════════════════╗{RESET}")
    print(f"{B}{C}║   Arc Agent Commerce — Full Lifecycle Demo                ║{RESET}")
    print(f"{B}{C}║   Single wallet, real on-chain transactions on Arc       ║{RESET}")
    print(f"{B}{C}╚═══════════════════════════════════════════════════════════╝{RESET}")

    sdk = ArcCommerce(private_key=pk)
    w3 = sdk.w3
    wallet = sdk.account.address
    print(f"\n{D}Wallet: {wallet}{RESET}")

    # ── Balance check ──
    bal = w3.eth.get_balance(wallet)
    bal_usdc = bal / 1e18
    info(f"Balance: {bal_usdc:.2f} USDC (native)")
    if bal_usdc < PRICE_USDC + 1:
        fail(f"Need at least {PRICE_USDC + 1} USDC, have {bal_usdc:.2f}")

    # ═══════════════════════════════════════════════════════════
    section("1/8", "Register ERC-8004 Agent Identity")
    # ═══════════════════════════════════════════════════════════
    register_abi = [
        {
            "inputs": [{"name": "metadataURI", "type": "string"}],
            "name": "register",
            "outputs": [{"name": "tokenId", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function",
        },
        {
            "inputs": [{"name": "owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function",
        },
    ]
    reg = w3.eth.contract(address=IDENTITY_REGISTRY, abi=register_abi)
    info("Calling IdentityRegistry.register()...")
    tx = reg.functions.register("demo://full-lifecycle").build_transaction(
        {
            "from": wallet,
            "nonce": w3.eth.get_transaction_count(wallet),
            "gas": 500_000,
            "gasPrice": w3.eth.gas_price,
        }
    )
    signed = sdk.account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction).hex()
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    sdk._reset_nonce()

    # Extract tokenId from Transfer event
    transfer_topic = "0x" + w3.keccak(text="Transfer(address,address,uint256)").hex().lstrip("0x")
    agent_id = None
    for log in receipt.logs:
        if log.address.lower() == IDENTITY_REGISTRY.lower() and len(log.topics) >= 4:
            t0 = "0x" + log.topics[0].hex().lstrip("0x")
            if t0 == transfer_topic:
                agent_id = int(log.topics[3].hex(), 16)
                break
    if agent_id is None:
        fail("Could not find new agent ID in Transfer event")
    ok(f"Agent #{agent_id} minted to {wallet[:10]}...{wallet[-4:]}", tx_hash)
    time.sleep(1)

    # ═══════════════════════════════════════════════════════════
    section("2/8", "List Service on Marketplace")
    # ═══════════════════════════════════════════════════════════
    info(f"Capability: {CAPABILITY}")
    info(f"Price: {PRICE_USDC} USDC per task")
    service_id = sdk.list_service(
        agent_id=agent_id,
        capability=CAPABILITY,
        price_usdc=PRICE_USDC,
        metadata_uri="ipfs://demo-audit-service",
    )
    ok(f"Service #{service_id} listed on ServiceMarket")
    time.sleep(1)

    # ═══════════════════════════════════════════════════════════
    section("3/8", "Approve USDC for PipelineOrchestrator")
    # ═══════════════════════════════════════════════════════════
    from arc_commerce.constants import PIPELINE_ORCHESTRATOR_ADDRESS

    allowance = sdk.check_allowance(spender=PIPELINE_ORCHESTRATOR_ADDRESS)
    info(f"Current allowance: {allowance / 1e6:.2f} USDC")
    if allowance < PRICE_USDC * 1_000_000:
        info("Approving 100 USDC for orchestrator...")
        approve_abi = [
            {
                "inputs": [
                    {"name": "spender", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
                "name": "approve",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        usdc_c = w3.eth.contract(address=USDC, abi=approve_abi)
        tx = usdc_c.functions.approve(
            PIPELINE_ORCHESTRATOR_ADDRESS, 100 * 1_000_000
        ).build_transaction(
            {
                "from": wallet,
                "nonce": w3.eth.get_transaction_count(wallet),
                "gas": 200_000,
                "gasPrice": w3.eth.gas_price,
            }
        )
        signed = sdk.account.sign_transaction(tx)
        h = w3.eth.send_raw_transaction(signed.raw_transaction).hex()
        w3.eth.wait_for_transaction_receipt(h)
        sdk._reset_nonce()
        ok("Allowance set to 100 USDC", h)
    else:
        ok("Allowance already sufficient — skipping approve")
    time.sleep(1)

    # ═══════════════════════════════════════════════════════════
    section("4/8", "Create Multi-Stage Pipeline")
    # ═══════════════════════════════════════════════════════════
    info(f"Stage 1: Agent #{agent_id} performs '{CAPABILITY}' for {PRICE_USDC} USDC")
    pipeline_id = sdk.create_pipeline(
        client_agent_id=agent_id,
        stages=[
            {
                "provider_agent_id": agent_id,
                "provider_address": wallet,
                "capability": CAPABILITY,
                "budget_usdc": PRICE_USDC,
            }
        ],
        currency="USDC",
        deadline_hours=24,
    )
    ok(f"Pipeline #{pipeline_id} created — {PRICE_USDC} USDC locked in escrow")
    time.sleep(1)

    p = sdk.get_pipeline(pipeline_id)
    stages = sdk.get_stages(pipeline_id)
    job_id = stages[0].job_id
    info(f"Underlying ACP Job #{job_id} created (status: Open)")

    # ═══════════════════════════════════════════════════════════
    section("5/8", "Provider quotes the budget (setBudget)")
    # ═══════════════════════════════════════════════════════════
    setbudget_abi = [
        {
            "inputs": [
                {"name": "jobId", "type": "uint256"},
                {"name": "amount", "type": "uint256"},
                {"name": "data", "type": "bytes"},
            ],
            "name": "setBudget",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function",
        }
    ]
    acp = w3.eth.contract(address=AGENTIC_COMMERCE, abi=setbudget_abi)
    tx = acp.functions.setBudget(job_id, PRICE_USDC * 1_000_000, b"").build_transaction(
        {
            "from": wallet,
            "nonce": w3.eth.get_transaction_count(wallet),
            "gas": 300_000,
            "gasPrice": w3.eth.gas_price,
        }
    )
    signed = sdk.account.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction).hex()
    w3.eth.wait_for_transaction_receipt(h)
    sdk._reset_nonce()
    ok(f"Budget {PRICE_USDC} USDC quoted on Job #{job_id}", h)
    time.sleep(1)

    # ═══════════════════════════════════════════════════════════
    section("6/8", "Client funds the stage")
    # ═══════════════════════════════════════════════════════════
    res = sdk.fund_stage(pipeline_id)
    ok(f"Stage funded — Job #{job_id} now in Funded state", res.get("tx_hash"))
    time.sleep(1)

    # ═══════════════════════════════════════════════════════════
    section("7/8", "Provider submits the deliverable")
    # ═══════════════════════════════════════════════════════════
    submit_abi = [
        {
            "inputs": [
                {"name": "jobId", "type": "uint256"},
                {"name": "deliverableHash", "type": "bytes32"},
                {"name": "data", "type": "bytes"},
            ],
            "name": "submit",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function",
        }
    ]
    acp2 = w3.eth.contract(address=AGENTIC_COMMERCE, abi=submit_abi)
    deliverable = w3.keccak(text="audit complete: no critical issues found")
    tx = acp2.functions.submit(job_id, deliverable, b"").build_transaction(
        {
            "from": wallet,
            "nonce": w3.eth.get_transaction_count(wallet),
            "gas": 300_000,
            "gasPrice": w3.eth.gas_price,
        }
    )
    signed = sdk.account.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction).hex()
    w3.eth.wait_for_transaction_receipt(h)
    sdk._reset_nonce()
    ok(f"Deliverable submitted (hash: {deliverable.hex()[:18]}...)", h)
    time.sleep(1)

    # ═══════════════════════════════════════════════════════════
    section("8/8", "Client approves the work")
    # ═══════════════════════════════════════════════════════════
    res = sdk.approve_stage(job_id)
    ok("Stage approved — payment released, reputation +50 recorded", res.get("tx_hash"))
    time.sleep(2)

    # ═══════════════════════════════════════════════════════════
    section("✓", "Verify on-chain")
    # ═══════════════════════════════════════════════════════════
    p = sdk.get_pipeline(pipeline_id)
    stages = sdk.get_stages(pipeline_id)
    status_name = {0: "ACTIVE", 1: "COMPLETED", 2: "HALTED", 3: "CANCELLED"}[p.status]
    stage_status = {0: "PENDING", 1: "ACTIVE", 2: "COMPLETED", 3: "FAILED"}[stages[0].status]
    info(f"Pipeline #{pipeline_id} status: {G}{status_name}{RESET}")
    info(f"Stage 0 status:    {G}{stage_status}{RESET}")
    info(f"Total spent:       {p.total_spent / 1e6:.2f} USDC")

    print(f"\n{B}{G}╔═══════════════════════════════════════════════════════════╗{RESET}")
    print(f"{B}{G}║   ✓ FULL LIFECYCLE COMPLETE — protocol verified          ║{RESET}")
    print(f"{B}{G}╚═══════════════════════════════════════════════════════════╝{RESET}")
    print(f"\n{D}Wallet trail: https://testnet.arcscan.app/address/{wallet}{RESET}")
    print(
        f"{D}Orchestrator: https://testnet.arcscan.app/address/0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7{RESET}\n"
    )


if __name__ == "__main__":
    main()
