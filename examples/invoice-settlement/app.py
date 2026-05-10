"""
InvoiceFlow — B2B invoice settlement on Arc, composed from PipelineOrchestrator.

Run with:
    python app.py invoice-sample.json
    python app.py invoice-sample.json --simulate-kyb-reject

The pipeline orchestrator handles atomic funding, conditional advance, and
refund of unstarted stages on rejection. This app supplies the use case and
the validator/KYB/settlement provider wiring; it owns no escrow.
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from arc_commerce import ArcCommerce
from arc_commerce.types import PipelineStatus, StageStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("invoiceflow")


def load_invoice(path: Path) -> dict:
    invoice = json.loads(path.read_text())
    fee_split = invoice["fee_split_usdc"]
    expected = fee_split["validation"] + fee_split["kyb"] + fee_split["settlement"]
    if abs(expected - invoice["total_usdc"]) > 0.001:
        raise ValueError(f"fee_split sums to {expected} but total is {invoice['total_usdc']}")
    return invoice


def build_clients() -> tuple[ArcCommerce, ArcCommerce, ArcCommerce, dict]:
    load_dotenv()
    required = [
        "ARC_AP_PK", "ARC_AP_AGENT_ID",
        "ARC_VALIDATOR_PK", "ARC_VALIDATOR_AGENT_ID",
        "ARC_KYB_PK", "ARC_KYB_AGENT_ID",
        "VENDOR_ADDRESS", "VENDOR_AGENT_ID",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        log.error("Missing env vars: %s (see .env.example)", ", ".join(missing))
        sys.exit(2)

    ap = ArcCommerce(private_key=os.environ["ARC_AP_PK"])
    validator = ArcCommerce(private_key=os.environ["ARC_VALIDATOR_PK"])
    kyb = ArcCommerce(private_key=os.environ["ARC_KYB_PK"])
    roles = {
        "ap_agent_id": int(os.environ["ARC_AP_AGENT_ID"]),
        "validator_agent_id": int(os.environ["ARC_VALIDATOR_AGENT_ID"]),
        "validator_address": validator.account.address,
        "kyb_agent_id": int(os.environ["ARC_KYB_AGENT_ID"]),
        "kyb_address": kyb.account.address,
        "vendor_address": os.environ["VENDOR_ADDRESS"],
        "vendor_agent_id": int(os.environ["VENDOR_AGENT_ID"]),
    }
    return ap, validator, kyb, roles


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
        if s.status == StageStatus.ACTIVE:
            return s.job_id
        time.sleep(2)
    raise TimeoutError(f"stage {expected_index} did not activate within {timeout_s}s")


def run(invoice_path: Path, simulate_kyb_reject: bool) -> int:
    invoice = load_invoice(invoice_path)
    ap, _validator, _kyb, roles = build_clients()

    pipeline_id = create_settlement_pipeline(ap, invoice, roles)

    log.info("Stage 1 (validation): waiting for activation")
    stage1_job = wait_for_active_stage(ap, pipeline_id, 0)
    log.info("Validator confirms invoice %s: line items match, totals reconcile", invoice["invoice_id"])
    ap.approve_stage(stage1_job)

    log.info("Stage 2 (KYB): waiting for activation")
    stage2_job = wait_for_active_stage(ap, pipeline_id, 1)

    if simulate_kyb_reject:
        log.warning("KYB rejected — vendor failed sanctions screening; halting pipeline")
        ap.reject_stage(stage2_job, reason="vendor failed sanctions screening")
        pipeline = ap.get_pipeline(pipeline_id)
        refunded = (pipeline.total_budget - pipeline.total_spent) / 1e6
        log.info(
            "Pipeline halted: status=%s spent=%.2f USDC refunded=%.2f USDC",
            PipelineStatus(pipeline.status).name,
            pipeline.total_spent / 1e6,
            refunded,
        )
        log.info("Settlement budget (%.2f USDC) returned to AP atomically.", invoice["fee_split_usdc"]["settlement"])
        return 0

    log.info("KYB clears vendor %s", invoice["vendor"]["name"])
    ap.approve_stage(stage2_job)

    log.info("Stage 3 (settlement): waiting for activation")
    stage3_job = wait_for_active_stage(ap, pipeline_id, 2)
    log.info("Forwarding %.2f USDC to vendor %s", invoice["fee_split_usdc"]["settlement"], roles["vendor_address"])
    ap.approve_stage(stage3_job)

    pipeline = ap.get_pipeline(pipeline_id)
    log.info(
        "Pipeline complete: status=%s spent=%.2f USDC",
        PipelineStatus(pipeline.status).name,
        pipeline.total_spent / 1e6,
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
    return run(args.invoice, args.simulate_kyb_reject)


if __name__ == "__main__":
    sys.exit(main())
