#!/usr/bin/env python3
"""
Populate the Arc Agent Commerce marketplace with realistic demo data.

Creates multiple agents, services, and pipelines to demonstrate a
functioning two-sided marketplace for the Builders Fund judges.

Uses the deployer wallet + 2 freshly generated provider wallets.
"""

import os
import sys
import time
import json
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from arc_commerce.client import ArcCommerce
from arc_commerce.types import PipelineStatus, StageStatus
from arc_commerce.abi import IDENTITY_REGISTRY_ABI, ERC20_ABI
from arc_commerce.constants import USDC_ADDRESS, IDENTITY_REGISTRY_ADDRESS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("populate")

# Terminal colors
C = "\033[36m"   # cyan
M = "\033[35m"   # magenta
G = "\033[32m"   # green
Y = "\033[33m"   # yellow
B = "\033[1m"    # bold
D = "\033[2m"    # dim
R = "\033[0m"    # reset

USDC_DECIMALS = 6

def fmt(amount_raw: int) -> str:
    return f"${amount_raw / 10**USDC_DECIMALS:.2f}"


def generate_wallet(w3):
    """Generate a new wallet and return (address, private_key)."""
    acct = w3.eth.account.create()
    return acct.address, acct.key.hex()


def fund_wallet(sender_sdk: ArcCommerce, to_address: str, native_amount: float, usdc_amount: float):
    """Send native gas + USDC to a wallet."""
    w3 = sender_sdk.w3
    acct = sender_sdk.account

    # Send native token for gas
    if native_amount > 0:
        native_wei = int(native_amount * 10**18)
        tx = {
            "from": acct.address,
            "to": Web3.to_checksum_address(to_address),
            "value": native_wei,
            "nonce": w3.eth.get_transaction_count(acct.address),
            "chainId": sender_sdk.chain_id,
            "gas": 21000,
            "gasPrice": w3.eth.gas_price,
        }
        signed = acct.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        log.info(f"  Sent {native_amount} native to {to_address[:10]}...")

    # Send USDC
    if usdc_amount > 0:
        amount_raw = int(usdc_amount * 10**USDC_DECIMALS)
        sender_sdk._nonce = None  # reset nonce
        sender_sdk._send_tx(
            sender_sdk.usdc.functions.transfer(
                Web3.to_checksum_address(to_address), amount_raw
            )
        )
        log.info(f"  Sent {fmt(amount_raw)} USDC to {to_address[:10]}...")


def register_agent(sdk: ArcCommerce, metadata_uri: str = "") -> int:
    """Register a new ERC-8004 agent. Returns the agent ID."""
    receipt = sdk._send_tx(
        sdk.identity.functions.register(metadata_uri)
    )
    # Parse Transfer event to get token ID
    transfer_topic = Web3.keccak(text="Transfer(address,address,uint256)")
    for log_entry in receipt.get("logs", []):
        if log_entry["topics"][0] == transfer_topic:
            agent_id = int(log_entry["topics"][3].hex(), 16)
            return agent_id
    raise RuntimeError("Failed to parse agent ID from register tx")


def main():
    deployer_pk = os.environ.get("PRIVATE_KEY")
    if not deployer_pk:
        log.error("PRIVATE_KEY not set in .env")
        sys.exit(1)

    deployer = ArcCommerce(private_key=deployer_pk)
    w3 = deployer.w3

    log.info(f"{B}=== Arc Agent Commerce — Marketplace Populator ==={R}")
    log.info(f"Deployer: {deployer.account.address}")

    # Check deployer balances
    usdc_bal = deployer.usdc.functions.balanceOf(deployer.account.address).call()
    native_bal = w3.eth.get_balance(deployer.account.address)
    log.info(f"USDC: {fmt(usdc_bal)} | Native: {native_bal / 1e18:.4f}")

    if usdc_bal < 5_000_000:  # $5 minimum
        log.error("Need at least $5 USDC to populate marketplace")
        sys.exit(1)

    # ═══════════════════════════════════════════════════
    # Step 1: Generate 2 provider wallets
    # ═══════════════════════════════════════════════════
    log.info(f"\n{B}Step 1: Generate provider wallets{R}")

    prov1_addr, prov1_pk = generate_wallet(w3)
    prov2_addr, prov2_pk = generate_wallet(w3)

    log.info(f"  {M}Provider A{R}: {prov1_addr}")
    log.info(f"  {M}Provider B{R}: {prov2_addr}")

    # Save keys for future use
    keys_file = os.path.join(os.path.dirname(__file__), "demo_wallets.json")
    with open(keys_file, "w") as f:
        json.dump({
            "provider_a": {"address": prov1_addr, "pk": prov1_pk},
            "provider_b": {"address": prov2_addr, "pk": prov2_pk},
        }, f, indent=2)
    log.info(f"  Keys saved to {keys_file}")

    # ═══════════════════════════════════════════════════
    # Step 2: Fund provider wallets
    # ═══════════════════════════════════════════════════
    log.info(f"\n{B}Step 2: Fund provider wallets{R}")

    fund_wallet(deployer, prov1_addr, native_amount=0.5, usdc_amount=0)
    fund_wallet(deployer, prov2_addr, native_amount=0.5, usdc_amount=0)

    # Init provider SDK clients
    prov1 = ArcCommerce(private_key=prov1_pk)
    prov2 = ArcCommerce(private_key=prov2_pk)

    # ═══════════════════════════════════════════════════
    # Step 3: Register agents
    # ═══════════════════════════════════════════════════
    log.info(f"\n{B}Step 3: Register agents{R}")

    # Deployer registers 1 more client agent
    log.info(f"  {C}Deployer{R} registering client agent...")
    client_agent_2 = register_agent(deployer, "arc://agent/data-pipeline-client")
    log.info(f"  {G}Agent #{client_agent_2}{R} registered (Data Pipeline Client)")

    # Provider A registers 2 agents
    log.info(f"  {M}Provider A{R} registering agents...")
    prov1_agent_a = register_agent(prov1, "arc://agent/audit-specialist")
    log.info(f"  {G}Agent #{prov1_agent_a}{R} registered (Audit Specialist)")
    prov1_agent_b = register_agent(prov1, "arc://agent/security-researcher")
    log.info(f"  {G}Agent #{prov1_agent_b}{R} registered (Security Researcher)")

    # Provider B registers 2 agents
    log.info(f"  {M}Provider B{R} registering agents...")
    prov2_agent_a = register_agent(prov2, "arc://agent/deploy-operator")
    log.info(f"  {G}Agent #{prov2_agent_a}{R} registered (Deploy Operator)")
    prov2_agent_b = register_agent(prov2, "arc://agent/monitoring-bot")
    log.info(f"  {G}Agent #{prov2_agent_b}{R} registered (Monitoring Bot)")

    # ═══════════════════════════════════════════════════
    # Step 4: List services across capabilities
    # ═══════════════════════════════════════════════════
    log.info(f"\n{B}Step 4: List services on marketplace{R}")

    services = [
        # Provider A services
        (prov1, prov1_agent_a, "smart_contract_audit", 25.0, "Full Solidity audit with formal verification"),
        (prov1, prov1_agent_a, "security_audit", 35.0, "Comprehensive security review + pentest"),
        (prov1, prov1_agent_b, "testing", 15.0, "Automated test suite generation"),
        # Provider B services
        (prov2, prov2_agent_a, "contract_deployment", 10.0, "Multi-chain deployment + verification"),
        (prov2, prov2_agent_a, "deployment", 8.0, "Infrastructure deployment & config"),
        (prov2, prov2_agent_b, "monitoring", 5.0, "24/7 on-chain monitoring alerts"),
        # Deployer adds more services for agent 933
        (deployer, 933, "smart_contract_audit", 40.0, "Premium audit by senior agent"),
        (deployer, 933, "consulting", 20.0, "Architecture consulting & review"),
    ]

    service_ids = []
    for sdk, agent_id, capability, price, metadata in services:
        try:
            sid = sdk.list_service(agent_id, capability, price, metadata)
            service_ids.append(sid)
            log.info(f"  {G}Service #{sid}{R}: Agent #{agent_id} — {capability} @ {fmt(int(price * 1e6))}")
        except Exception as e:
            log.warning(f"  Failed to list service: {e}")
            service_ids.append(-1)

    # ═══════════════════════════════════════════════════
    # Step 5: Create pipelines
    # ═══════════════════════════════════════════════════
    log.info(f"\n{B}Step 5: Create pipelines{R}")

    # Pipeline 1: audit → deploy (deployer as client, prov A + prov B as providers)
    log.info(f"\n  {C}Pipeline 1{R}: Smart Contract Audit → Deploy")
    try:
        pid1 = deployer.create_pipeline(
            client_agent_id=933,
            stages=[
                {
                    "provider_agent_id": prov1_agent_a,
                    "provider_address": prov1_addr,
                    "capability": "smart_contract_audit",
                    "budget_usdc": 2.50,
                },
                {
                    "provider_agent_id": prov2_agent_a,
                    "provider_address": prov2_addr,
                    "capability": "contract_deployment",
                    "budget_usdc": 1.50,
                },
            ],
            currency="USDC",
            deadline_hours=48,
        )
        log.info(f"  {G}Pipeline #{pid1} created{R} — $4.00 budget, 2 stages")
    except Exception as e:
        log.error(f"  Pipeline 1 failed: {e}")
        pid1 = None

    # Pipeline 2: security audit → testing → monitoring (3-stage)
    log.info(f"\n  {C}Pipeline 2{R}: Security Audit → Testing → Monitoring")
    try:
        pid2 = deployer.create_pipeline(
            client_agent_id=client_agent_2,
            stages=[
                {
                    "provider_agent_id": prov1_agent_b,
                    "provider_address": prov1_addr,
                    "capability": "security_audit",
                    "budget_usdc": 3.00,
                },
                {
                    "provider_agent_id": prov1_agent_b,
                    "provider_address": prov1_addr,
                    "capability": "testing",
                    "budget_usdc": 1.50,
                },
                {
                    "provider_agent_id": prov2_agent_b,
                    "provider_address": prov2_addr,
                    "capability": "monitoring",
                    "budget_usdc": 1.00,
                },
            ],
            currency="USDC",
            deadline_hours=72,
        )
        log.info(f"  {G}Pipeline #{pid2} created{R} — $5.50 budget, 3 stages")
    except Exception as e:
        log.error(f"  Pipeline 2 failed: {e}")
        pid2 = None

    # ═══════════════════════════════════════════════════
    # Step 6: Complete Pipeline 1 lifecycle
    # ═══════════════════════════════════════════════════
    if pid1 is not None:
        log.info(f"\n{B}Step 6: Complete Pipeline #{pid1} lifecycle{R}")

        stages = deployer.get_stages(pid1)
        stage1 = stages[0]

        # Stage 1: Provider A sets budget on ACP job
        log.info(f"  {M}Provider A{R} setting budget on Job #{stage1.job_id}...")
        try:
            acp_addr = deployer.orchestrator.functions.acp().call()
            from arc_commerce.abi import ERC20_ABI
            acp_abi = json.loads(open(os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "abi", "AgenticCommerce.json")).read())
            acp_contract = prov1.w3.eth.contract(
                address=Web3.to_checksum_address(acp_addr),
                abi=acp_abi,
            )

            # Provider sets budget
            prov1._nonce = None
            tx_func = acp_contract.functions.setBudget(stage1.job_id, stage1.budget, b"")
            tx = tx_func.build_transaction({
                "from": prov1.account.address,
                "nonce": prov1.w3.eth.get_transaction_count(prov1.account.address),
                "chainId": prov1.chain_id,
            })
            tx["gas"] = int(prov1.w3.eth.estimate_gas(tx) * 1.2)
            signed = prov1.account.sign_transaction(tx)
            tx_hash = prov1.w3.eth.send_raw_transaction(signed.raw_transaction)
            prov1.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            log.info(f"  {G}Budget set!{R} Job #{stage1.job_id} = {fmt(stage1.budget)}")

            # Client funds stage
            time.sleep(2)
            log.info(f"  {C}Client{R} funding stage 1...")
            deployer._nonce = None
            deployer.fund_stage(pid1)
            log.info(f"  {G}Stage 1 funded!{R}")

            # Provider submits deliverable
            time.sleep(2)
            log.info(f"  {M}Provider A{R} submitting deliverable...")
            prov1._nonce = None
            deliverable_hash = Web3.keccak(text="audit-report-v1-complete")
            tx_func = acp_contract.functions.submit(stage1.job_id, deliverable_hash, b"")
            tx = tx_func.build_transaction({
                "from": prov1.account.address,
                "nonce": prov1.w3.eth.get_transaction_count(prov1.account.address),
                "chainId": prov1.chain_id,
            })
            tx["gas"] = int(prov1.w3.eth.estimate_gas(tx) * 1.2)
            signed = prov1.account.sign_transaction(tx)
            tx_hash = prov1.w3.eth.send_raw_transaction(signed.raw_transaction)
            prov1.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            log.info(f"  {G}Deliverable submitted!{R}")

            # Client approves stage 1
            time.sleep(2)
            log.info(f"  {C}Client{R} approving stage 1...")
            deployer._nonce = None
            deployer.approve_stage(stage1.job_id)
            log.info(f"  {G}Stage 1 approved!{R} Provider A paid {fmt(stage1.budget)}")

            # Now stage 2 should be active
            time.sleep(2)
            stages = deployer.get_stages(pid1)
            stage2 = stages[1]
            log.info(f"\n  Stage 2 now active — Job #{stage2.job_id}")

            # Provider B sets budget
            log.info(f"  {M}Provider B{R} setting budget on Job #{stage2.job_id}...")
            prov2._nonce = None
            acp_contract2 = prov2.w3.eth.contract(
                address=Web3.to_checksum_address(acp_addr),
                abi=acp_abi,
            )
            tx_func = acp_contract2.functions.setBudget(stage2.job_id, stage2.budget, b"")
            tx = tx_func.build_transaction({
                "from": prov2.account.address,
                "nonce": prov2.w3.eth.get_transaction_count(prov2.account.address),
                "chainId": prov2.chain_id,
            })
            tx["gas"] = int(prov2.w3.eth.estimate_gas(tx) * 1.2)
            signed = prov2.account.sign_transaction(tx)
            tx_hash = prov2.w3.eth.send_raw_transaction(signed.raw_transaction)
            prov2.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            log.info(f"  {G}Budget set!{R}")

            # Client funds stage 2
            time.sleep(2)
            log.info(f"  {C}Client{R} funding stage 2...")
            deployer._nonce = None
            deployer.fund_stage(pid1)
            log.info(f"  {G}Stage 2 funded!{R}")

            # Provider B submits
            time.sleep(2)
            log.info(f"  {M}Provider B{R} submitting deliverable...")
            prov2._nonce = None
            deploy_hash = Web3.keccak(text="deployment-proof-mainnet-0x1234")
            tx_func = acp_contract2.functions.submit(stage2.job_id, deploy_hash, b"")
            tx = tx_func.build_transaction({
                "from": prov2.account.address,
                "nonce": prov2.w3.eth.get_transaction_count(prov2.account.address),
                "chainId": prov2.chain_id,
            })
            tx["gas"] = int(prov2.w3.eth.estimate_gas(tx) * 1.2)
            signed = prov2.account.sign_transaction(tx)
            tx_hash = prov2.w3.eth.send_raw_transaction(signed.raw_transaction)
            prov2.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            log.info(f"  {G}Deliverable submitted!{R}")

            # Client approves stage 2 → pipeline completes
            time.sleep(2)
            log.info(f"  {C}Client{R} approving stage 2...")
            deployer._nonce = None
            deployer.approve_stage(stage2.job_id)
            log.info(f"  {G}Stage 2 approved! Pipeline #{pid1} COMPLETED!{R}")

        except Exception as e:
            log.error(f"  Pipeline lifecycle error: {e}")
            import traceback
            traceback.print_exc()

    # ═══════════════════════════════════════════════════
    # Step 7: Partially progress Pipeline 2 (leave active for demo)
    # ═══════════════════════════════════════════════════
    if pid2 is not None:
        log.info(f"\n{B}Step 7: Progress Pipeline #{pid2} (leave active for demo){R}")

        try:
            stages = deployer.get_stages(pid2)
            stage1 = stages[0]

            acp_addr = deployer.orchestrator.functions.acp().call()
            acp_abi = json.loads(open(os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "abi", "AgenticCommerce.json")).read())

            # Provider A sets budget on stage 1
            log.info(f"  {M}Provider A{R} setting budget on Job #{stage1.job_id}...")
            prov1._nonce = None
            acp_c = prov1.w3.eth.contract(address=Web3.to_checksum_address(acp_addr), abi=acp_abi)
            tx_func = acp_c.functions.setBudget(stage1.job_id, stage1.budget, b"")
            tx = tx_func.build_transaction({
                "from": prov1.account.address,
                "nonce": prov1.w3.eth.get_transaction_count(prov1.account.address),
                "chainId": prov1.chain_id,
            })
            tx["gas"] = int(prov1.w3.eth.estimate_gas(tx) * 1.2)
            signed = prov1.account.sign_transaction(tx)
            tx_hash = prov1.w3.eth.send_raw_transaction(signed.raw_transaction)
            prov1.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            log.info(f"  {G}Budget set!{R}")

            # Client funds stage 1
            time.sleep(2)
            log.info(f"  {C}Client{R} funding stage 1...")
            deployer._nonce = None
            deployer.fund_stage(pid2)
            log.info(f"  {G}Stage 1 funded!{R} Pipeline #{pid2} stage 1 is now awaiting deliverable")
            log.info(f"  {Y}Leaving pipeline active for demo — judges can see in-progress work{R}")

        except Exception as e:
            log.error(f"  Pipeline 2 progress error: {e}")
            import traceback
            traceback.print_exc()

    # ═══════════════════════════════════════════════════
    # Final Summary
    # ═══════════════════════════════════════════════════
    log.info(f"\n{B}{'═' * 60}{R}")
    log.info(f"{B}MARKETPLACE POPULATED{R}")
    log.info(f"{B}{'═' * 60}{R}")

    # Recount
    total_svc = deployer.total_services()
    try:
        next_pid = deployer.orchestrator.functions.nextPipelineId().call()
    except:
        next_pid = "?"

    final_usdc = deployer.usdc.functions.balanceOf(deployer.account.address).call()

    log.info(f"Total services: {total_svc}")
    log.info(f"Total pipelines: {next_pid}")
    log.info(f"Deployer USDC remaining: {fmt(final_usdc)}")
    log.info(f"\nNew agents registered:")
    log.info(f"  Client Agent #{client_agent_2}")
    log.info(f"  Provider A Agents: #{prov1_agent_a}, #{prov1_agent_b}")
    log.info(f"  Provider B Agents: #{prov2_agent_a}, #{prov2_agent_b}")
    log.info(f"\n{G}Marketplace is ready for demo!{R}")
    log.info(f"View at: https://arc.gudman.xyz")


if __name__ == "__main__":
    main()
