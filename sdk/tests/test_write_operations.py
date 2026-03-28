"""Tests for write operations against Arc Testnet.

These tests perform real transactions on Arc Testnet.
Set ARC_PROVIDER_PK and ARC_CLIENT_PK to run them.

Run with: pytest tests/test_write_operations.py -v
"""

import time
from arc_commerce import AgreementStatus
from tests.conftest import PROVIDER_AGENT_ID, CLIENT_AGENT_ID, TEST_PRICE_USDC


class TestListService:
    """Test service listing."""

    def test_list_service(self, provider_client):
        """List a new service and verify on-chain fields."""
        capability = f"test_cap_{int(time.time())}"
        service_id = provider_client.list_service(
            agent_id=PROVIDER_AGENT_ID,
            capability=capability,
            price_usdc=TEST_PRICE_USDC,
            metadata_uri="ipfs://test",
        )
        assert service_id >= 0

        svc = provider_client.get_service(service_id)
        assert svc.agent_id == PROVIDER_AGENT_ID
        assert svc.price_per_task == int(TEST_PRICE_USDC * 1_000_000)
        assert svc.metadata_uri == "ipfs://test"
        assert svc.active is True

    def test_find_services_after_listing(self, provider_client):
        """New service appears in find_services()."""
        capability = f"findable_{int(time.time())}"
        service_id = provider_client.list_service(
            agent_id=PROVIDER_AGENT_ID,
            capability=capability,
            price_usdc=TEST_PRICE_USDC,
            metadata_uri="ipfs://findable",
        )
        services = provider_client.find_services(capability)
        assert any(s.service_id == service_id for s in services)


class TestCreateAgreement:
    """Test agreement creation."""

    def test_create_agreement(self, client_client, provider_client):
        """Create an auto-approved agreement and verify fields."""
        agreement_id = client_client.create_agreement(
            provider=provider_client.account.address,
            provider_agent_id=PROVIDER_AGENT_ID,
            client_agent_id=CLIENT_AGENT_ID,
            amount_usdc=TEST_PRICE_USDC,
            deadline_hours=1,
            task_description=f"test_task_{int(time.time())}",
            auto_approve=True,
        )
        assert agreement_id >= 0

        agr = client_client.get_agreement(agreement_id)
        assert agr.status == AgreementStatus.ACTIVE
        assert agr.amount == int(TEST_PRICE_USDC * 1_000_000)
        assert agr.provider.lower() == provider_client.account.address.lower()
        assert agr.client.lower() == client_client.account.address.lower()

    def test_create_agreement_manual_approve(self, client_client, provider_client):
        """Create agreement with manual USDC approval first."""
        from web3 import Web3
        from arc_commerce.constants import SERVICE_ESCROW_ADDRESS

        amount = int(TEST_PRICE_USDC * 1_000_000)
        # Manual approve
        client_client._send_tx(
            client_client.usdc.functions.approve(
                Web3.to_checksum_address(SERVICE_ESCROW_ADDRESS), amount
            )
        )
        agreement_id = client_client.create_agreement(
            provider=provider_client.account.address,
            provider_agent_id=PROVIDER_AGENT_ID,
            client_agent_id=CLIENT_AGENT_ID,
            amount_usdc=TEST_PRICE_USDC,
            deadline_hours=1,
            task_description=f"manual_approve_{int(time.time())}",
            auto_approve=False,
        )
        assert agreement_id >= 0
        agr = client_client.get_agreement(agreement_id)
        assert agr.status == AgreementStatus.ACTIVE


class TestConfirmCompletion:
    """Test completing agreements."""

    def test_confirm_completion(self, client_client, provider_client):
        """Create and confirm an agreement."""
        agreement_id = client_client.create_agreement(
            provider=provider_client.account.address,
            provider_agent_id=PROVIDER_AGENT_ID,
            client_agent_id=CLIENT_AGENT_ID,
            amount_usdc=TEST_PRICE_USDC,
            deadline_hours=1,
            task_description=f"complete_{int(time.time())}",
        )
        receipt = client_client.confirm_completion(agreement_id)
        assert receipt["status"] == 1

        agr = client_client.get_agreement(agreement_id)
        assert agr.status == AgreementStatus.COMPLETED


class TestFullLifecycle:
    """Full lifecycle: list -> create -> confirm -> verify balances."""

    def test_full_lifecycle(self, client_client, provider_client):
        """End-to-end test with balance verification and fee math."""
        # Snapshot balances
        provider_before = provider_client.usdc.functions.balanceOf(
            provider_client.account.address
        ).call()
        fees_before = provider_client.escrow.functions.totalFeesCollected().call()

        # List service
        capability = f"lifecycle_{int(time.time())}"
        service_id = provider_client.list_service(
            agent_id=PROVIDER_AGENT_ID,
            capability=capability,
            price_usdc=TEST_PRICE_USDC,
            metadata_uri="ipfs://lifecycle",
        )

        # Create agreement
        agreement_id = client_client.create_agreement(
            provider=provider_client.account.address,
            provider_agent_id=PROVIDER_AGENT_ID,
            client_agent_id=CLIENT_AGENT_ID,
            amount_usdc=TEST_PRICE_USDC,
            deadline_hours=1,
            task_description=f"lifecycle_{int(time.time())}",
            service_id=service_id,
        )

        # Confirm completion
        client_client.confirm_completion(agreement_id)

        # Verify balances
        amount = int(TEST_PRICE_USDC * 1_000_000)
        fee = amount // 1000  # 0.1%
        provider_after = provider_client.usdc.functions.balanceOf(
            provider_client.account.address
        ).call()
        fees_after = provider_client.escrow.functions.totalFeesCollected().call()

        assert provider_after - provider_before == amount - fee
        assert fees_after - fees_before == fee


class TestHireConvenience:
    """Test the hire() convenience method."""

    def test_hire(self, client_client):
        """Use hire() to find cheapest service and create agreement."""
        service, agreement_id = client_client.hire(
            capability="smart_contract_audit",
            amount_usdc=TEST_PRICE_USDC,
            task_description=f"hire_test_{int(time.time())}",
            client_agent_id=CLIENT_AGENT_ID,
        )
        assert service is not None
        assert agreement_id >= 0

        agr = client_client.get_agreement(agreement_id)
        assert agr.status == AgreementStatus.ACTIVE
