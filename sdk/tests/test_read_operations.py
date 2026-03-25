"""Tests for read-only SDK operations against Arc Testnet.

These tests hit the live RPC. Run with: pytest tests/ -v
"""

import pytest
from arc_commerce import ArcCommerce, Service, Agreement, AgreementStatus


# Use module-scoped client to reuse the connection
@pytest.fixture(scope="module")
def client():
    return ArcCommerce()


# Pre-fetch data once to avoid rate limiting
@pytest.fixture(scope="module")
def service_0(client):
    return client.get_service(0)


@pytest.fixture(scope="module")
def agreement_0(client):
    return client.get_agreement(0)


def test_total_services(client):
    count = client.total_services()
    assert count >= 6


def test_total_agreements(client):
    count = client.total_agreements()
    assert count >= 3


def test_total_fees(client):
    fees = client.total_fees()
    assert fees > 0


def test_get_service(service_0):
    assert isinstance(service_0, Service)
    assert service_0.service_id == 0
    assert service_0.agent_id > 0
    assert service_0.price_per_task > 0
    assert service_0.provider.startswith("0x")
    assert len(service_0.metadata_uri) > 0


def test_get_service_price_usdc(service_0):
    assert service_0.price_usdc == service_0.price_per_task / 1_000_000


def test_list_all_services(client):
    services = client.list_all_services()
    assert len(services) >= 6
    assert all(isinstance(s, Service) for s in services)


def test_find_services_by_capability(client):
    services = client.find_services("smart_contract_audit")
    assert len(services) >= 1
    assert all(s.active for s in services)


def test_find_services_nonexistent(client):
    services = client.find_services("nonexistent_capability_xyz")
    assert services == []


def test_get_services_by_agent(client):
    services = client.get_services_by_agent(934)
    assert len(services) >= 1


def test_get_agreement(agreement_0):
    assert isinstance(agreement_0, Agreement)
    assert agreement_0.agreement_id == 0
    assert agreement_0.status == AgreementStatus.COMPLETED
    assert agreement_0.amount > 0
    assert agreement_0.client.startswith("0x")
    assert agreement_0.provider.startswith("0x")


def test_get_agreement_amount_usdc(agreement_0):
    assert agreement_0.amount_usdc == agreement_0.amount / 1_000_000


def test_get_client_agreements(client):
    agrs = client.get_client_agreements(
        "0x917a630f4bd294b68C3ABfD1DD61bff6F6F2d44E"
    )
    assert len(agrs) >= 1


def test_get_provider_agreements(client):
    agrs = client.get_provider_agreements(
        "0x2D09E46D37A61914663bA073dAD4D7D9DFD746Cb"
    )
    assert len(agrs) >= 1


def test_agreement_status_enum():
    assert AgreementStatus.ACTIVE == 0
    assert AgreementStatus.COMPLETED == 1
    assert AgreementStatus.DISPUTED == 2
    assert AgreementStatus.EXPIRED == 3
    assert AgreementStatus.RESOLVED == 4
