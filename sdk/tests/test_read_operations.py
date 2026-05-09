"""Tests for read-only SDK operations against Arc Testnet.

These tests hit the live RPC. Run with: pytest tests/test_read_operations.py -v
They are separated from unit tests because they depend on testnet state.
"""

import pytest
from arc_commerce import ArcCommerce, Service


# Use module-scoped client to reuse the connection
@pytest.fixture(scope="module")
def client():
    return ArcCommerce()


# Pre-fetch data once to avoid rate limiting
@pytest.fixture(scope="module")
def service_0(client):
    return client.get_service(0)


def test_total_services(client):
    count = client.total_services()
    assert count >= 6


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


def test_get_services_by_agent_933(client):
    """Agent 933 (deployer) has listed services."""
    services = client.get_services_by_agent(933)
    assert len(services) >= 1


def test_get_pipeline(client):
    """Skips when no pipelines exist on the current orchestrator deployment."""
    try:
        pipeline = client.get_pipeline(0)
    except Exception:
        pytest.skip("no pipeline #0 on current testnet orchestrator")
    if pipeline.total_budget == 0:
        pytest.skip("no pipeline #0 on current testnet orchestrator")
    assert pipeline.pipeline_id == 0


def test_get_stages(client):
    """Skips when pipeline #0 has no stages on the current orchestrator."""
    stages = client.get_stages(0)
    if not stages:
        pytest.skip("no pipeline #0 stages on current testnet orchestrator")
    assert len(stages) >= 1


def test_get_agent_owner(client):
    """Agent 933 is owned by the deployer wallet."""
    owner = client.get_agent_owner(933)
    assert owner.startswith("0x")
    assert owner.lower() == "0x917a630f4bd294b68c3abfd1dd61bff6f6f2d44e"
