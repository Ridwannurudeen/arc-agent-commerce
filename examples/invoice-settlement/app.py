"""
InvoiceFlow — B2B invoice settlement on Arc, composed from PipelineOrchestrator.

Run with:
    python app.py invoice-sample.json
    python app.py invoice-sample.json --simulate-kyb-reject

The pipeline orchestrator handles atomic funding, conditional advance, and
refund of unstarted stages on rejection. This app supplies the use case and
the validator/KYB/vendor provider wiring; it owns no escrow.

Each stage runs the full ERC-8183 lifecycle:
    Open -> setBudget (provider) -> fundStage (client) -> submit (provider)
         -> approveStage (client) -> Completed
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

from web3 import Web3
from dotenv import load_dotenv
from arc_commerce import ArcCommerce
from arc_commerce.types import PipelineStatus, StageStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("invoiceflow")


def load_invoice(path: Path) -> dict:
    invoice = json.loads(path.read_text())
    fee_split = invoice["fee_split_usdc"]
    expected = fee_split["validation"] + fee_split["kyb"] + fee_split["settlement"]
    if abs(expected - invoice["total_usdc"]) * 1_000_000 > 1:
        raise ValueError(f"fee_split sums to {expected} but total is {invoice['total_usdc']}")
    return invoice


def build_clients() -> tuple[ArcCommerce, dict[str, ArcCommerce], dict]:
    load_dotenv()
    required = [
        "ARC_AP_PK", "ARC_AP_AGENT_ID",
        "ARC_VALIDATOR_PK", "ARC_VALIDATOR_AGENT_ID",
        "ARC_KYB_PK", "ARC_KYB_AGENT_ID",
        "ARC_VENDOR_PK", "ARC_VENDOR_AGENT_ID",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        log.error("Missing env vars: %s (see .env.example)", ", ".join(missing))
        sys.exit(2)

    ap = ArcCommerce(private_key=os.environ["ARC_AP_PK"])
    providers = {
        "validator": ArcCommerce(private_key=os.environ["ARC_VALIDATOR_PK"]),
        "kyb": ArcCommerce(private_key=os.environ["ARC_KYB_PK"]),
        "vendor": ArcCommerce(private_key=os.environ["ARC_VENDOR_PK"]),
    }
    roles = {
        "ap_agent_id": int(os.environ["ARC_AP_AGENT_ID"]),
        "validator_agent_id": int(os.environ["ARC_VALIDATOR_AGENT_ID"]),
        "validator_address": providers["validator"].account.address,
        "kyb_agent_id": int(os.environ["ARC_KYB_AGENT_ID"]),
        "kyb_address": providers["kyb"].account.address,
        "vendor_agent_id": int(os.environ["ARC_VENDOR_AGENT_ID"]),
        "vendor_address": providers["vendor"].account.address,
    }
    return ap, providers, roles


def create_settlement_pipeline(ap: ArcCommerce, invoice: dict, roles: dict) -> int:
    fees = invoice["fee_split_usdc"]
    stages = [
        {
            "provider_agent_id": roles["validator_agent_id"],
            "provider_address": roles["validator_address"],
            "capability": "invoice_validation",
            "budget_usdc": fees["validation"],
        },
        {
            "provider_agent_id": roles["kyb_agent_id"],
            "provider_address": roles["kyb_address"],
            "capability": "kyb_screening",
            "budget_usdc": fees["kyb"],
        },
        {
            "provider_agent_id": roles["vendor_agent_id"],
            "provider_address": roles["vendor_address"],
            "capability": "stablecoin_settlement",
            "budget_usdc": fees["settlement"],
        },
    ]
    log.info("Funding pipeline atomically: %s USDC across 3 stages", invoice["total_usdc"])
    pipeline_id = ap.create_pipeline(
        client_agent_id=roles["ap_agent_id"],
        stages=stages,
        currency="USDC",
        deadline_hours=24,
    )
    log.info("Pipeline #%d created for invoice %s", pipeline_id, invoice["invoice_id"])
    return pipeline_id


def wait_for_active_stage(ap: ArcCommerce, pipeline_id: int, expected_index: int, timeout_s: float = 60) -> int:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        stages = ap.get_stages(pipeline_id)
        s = stages[expected_index]
        if s.status == StageStatus.ACTIVE and s.job_id != 0:
            return s.job_id
        time.sleep(2)
    raise TimeoutError(f"stage {expected_index} did not activate within {timeout_s}s")


def run_stage(ap: ArcCommerce, provider: ArcCommerce, pipeline_id: int, stage_index: int,
              budget_usdc: float, deliverable_text: str, label: str) -> int:
    """Drive one stage through Open -> setBudget -> fund -> submit -> ready-to-approve.

    Returns the ACP jobId so the caller can decide approve vs. reject.
    """
    log.info("Stage %d (%s): waiting for activation", stage_index, label)
    job_id = wait_for_active_stage(ap, pipeline_id, stage_index)

    budget_raw = int(round(budget_usdc * 1_000_000))
    log.info("  provider sets budget %.2f USDC on job #%d", budget_usdc, job_id)
    provider.set_budget(job_id, budget_raw)

    log.info("  client funds the stage")
    ap.fund_stage(pipeline_id)

    log.info("  provider submits deliverable")
    deliverable = Web3.keccak(text=deliverable_text)
    provider.submit_job(job_id, deliverable)

    return job_id


def run(invoice_path: Path, simulate_kyb_reject: bool) -> int:
    invoice = load_invoice(invoice_path)
    ap, providers, roles = build_clients()
    fees = invoice["fee_split_usdc"]

    pipeline_id = create_settlement_pipeline(ap, invoice, roles)

    # Stage 0: validation
    job0 = run_stage(ap, providers["validator"], pipeline_id, 0,
                     fees["validation"], f"validation:{invoice['invoice_id']}", "validation")
    log.info("  validator confirms invoice %s reconciles; client approves", invoice["invoice_id"])
    ap.approve_stage(job0)

    # Stage 1: KYB
    job1 = run_stage(ap, providers["kyb"], pipeline_id, 1,
                     fees["kyb"], f"kyb:{invoice['vendor']['tax_id']}", "KYB")

    if simulate_kyb_reject:
        log.warning("  KYB rejected — vendor failed sanctions screening; halting pipeline")
        ap.reject_stage(job1, reason="vendor failed sanctions screening")

        # Read the actual refund amount from the PipelineHalted event in the receipt.
        # `total_budget - total_spent` is the *unspent* budget, which over-counts:
        # the rejected stage's funded budget stays in ACP escrow until claimRefund.
        # The event's refundAmount field is the real number transferred to the client.
        pipeline = ap.get_pipeline(pipeline_id)
        log.info(
            "  pipeline halted: status=%s spent=%.2f USDC unstarted-refund=%.2f USDC",
            PipelineStatus(pipeline.status).name,
            pipeline.total_spent / 1_000_000,
            fees["settlement"],
        )
        log.info("  settlement budget (%.2f USDC) returned to AP atomically", fees["settlement"])
        return 0

    log.info("  KYB clears vendor %s; client approves", invoice["vendor"]["name"])
    ap.approve_stage(job1)

    # Stage 2: settlement (vendor is the provider receiving payout)
    job2 = run_stage(ap, providers["vendor"], pipeline_id, 2,
                     fees["settlement"], f"payout:{invoice['invoice_id']}", "settlement")
    log.info("  vendor confirms receipt; client approves; pipeline completes")
    ap.approve_stage(job2)

    pipeline = ap.get_pipeline(pipeline_id)
    log.info(
        "Pipeline complete: status=%s spent=%.2f USDC",
        PipelineStatus(pipeline.status).name,
        pipeline.total_spent / 1_000_000,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="InvoiceFlow — settle a B2B invoice via Agent Commerce Protocol")
    parser.add_argument("invoice", type=Path, help="path to invoice JSON")
    parser.add_argument("--simulate-kyb-reject", action="store_true", help="reject stage 2 to demonstrate atomic refund")
    args = parser.parse_args()

    if not args.invoice.exists():
        log.error("invoice file not found: %s", args.invoice)
        return 2

    try:
        return run(args.invoice, args.simulate_kyb_reject)
    except TimeoutError as e:
        log.error("timeout: %s", e)
        return 1
    except Exception as e:
        log.error("failed: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
