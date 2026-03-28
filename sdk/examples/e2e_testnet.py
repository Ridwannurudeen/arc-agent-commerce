"""End-to-end testnet verification: list service -> create agreement -> confirm -> complete.

Usage:
    ARC_CLIENT_PK=<private_key> python e2e_testnet.py

Uses the deployer wallet as both client and provider to exercise the full lifecycle.
"""

import os
import sys

from arc_commerce import ArcCommerce
from arc_commerce.types import AgreementStatus

PROVIDER_AGENT_ID = 944
CLIENT_AGENT_ID = 933
CAPABILITY = "smart_contract_audit"
PRICE_USDC = 0.01
ARCSCAN = "https://testnet.arcscan.io/tx/"


def main():
    pk = os.environ.get("ARC_CLIENT_PK")
    if not pk:
        print("ERROR: Set ARC_CLIENT_PK env var to deployer private key")
        sys.exit(1)

    client = ArcCommerce(private_key=pk, log_level="INFO")
    wallet = client.account.address
    print(f"Wallet: {wallet}")

    # 1. Check USDC balance
    balance = client.usdc.functions.balanceOf(wallet).call()
    balance_usdc = balance / 1_000_000
    print(f"USDC balance: {balance_usdc:.6f}")
    if balance_usdc < PRICE_USDC:
        print(f"ERROR: Need at least {PRICE_USDC} USDC, have {balance_usdc:.6f}")
        sys.exit(1)

    # 2. Check for existing active service on agent — reuse if found
    services = client.get_services_by_agent(PROVIDER_AGENT_ID)
    active = [s for s in services if s.active]
    if active:
        service_id = active[0].service_id
        print(f"Reusing existing Service #{service_id} (Agent #{PROVIDER_AGENT_ID})")
    else:
        service_id = client.list_service(
            agent_id=PROVIDER_AGENT_ID,
            capability=CAPABILITY,
            price_usdc=PRICE_USDC,
            metadata_uri="ipfs://e2e-test-audit-service",
        )
        print(f"Listed new Service #{service_id} (Agent #{PROVIDER_AGENT_ID})")

    # 3. Create agreement — same wallet as both client and provider
    print(f"Creating agreement: {PRICE_USDC} USDC, client Agent #{CLIENT_AGENT_ID} -> provider Agent #{PROVIDER_AGENT_ID}")
    agreement_id = client.create_agreement(
        provider=wallet,
        provider_agent_id=PROVIDER_AGENT_ID,
        client_agent_id=CLIENT_AGENT_ID,
        amount_usdc=PRICE_USDC,
        deadline_hours=1,
        task_description="E2E testnet verification - audit service",
        service_id=service_id,
        auto_approve=True,
    )
    print(f"Agreement #{agreement_id} created")

    # 4. Verify status = ACTIVE
    agr = client.get_agreement(agreement_id)
    assert agr.status == AgreementStatus.ACTIVE, f"Expected ACTIVE, got {agr.status}"
    print(f"Status: {agr.status.name}")

    # 5. Confirm completion — releases payment, records reputation
    print("Confirming completion...")
    receipt = client.confirm_completion(agreement_id)
    tx_hash = receipt["transactionHash"].hex()
    print(f"TX: {ARCSCAN}{tx_hash}")

    # 6. Verify status = COMPLETED
    agr = client.get_agreement(agreement_id)
    assert agr.status == AgreementStatus.COMPLETED, f"Expected COMPLETED, got {agr.status}"
    print(f"Status: {agr.status.name}")

    # Summary
    print("\n--- E2E Verification Summary ---")
    print(f"Service ID:    #{service_id}")
    print(f"Agreement ID:  #{agreement_id}")
    print(f"Amount:        {PRICE_USDC} USDC")
    print(f"Client Agent:  #{CLIENT_AGENT_ID}")
    print(f"Provider Agent: #{PROVIDER_AGENT_ID}")
    print(f"Final Status:  COMPLETED")
    print(f"TX:            {ARCSCAN}{tx_hash}")
    print(f"Dashboard:     https://arc.gudman.xyz")
    print("All checks passed.")


if __name__ == "__main__":
    main()
