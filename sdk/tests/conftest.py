"""Shared fixtures for Arc Commerce SDK tests."""

import os
import pytest
from arc_commerce import ArcCommerce


PROVIDER_AGENT_ID = 944
CLIENT_AGENT_ID = 933
TEST_PRICE_USDC = 0.01


@pytest.fixture(scope="module")
def client():
    """Read-only client (no private key)."""
    return ArcCommerce()


@pytest.fixture(scope="module")
def provider_client():
    """Provider client with write access. Skips if ARC_PROVIDER_PK not set."""
    pk = os.environ.get("ARC_PROVIDER_PK")
    if not pk:
        pytest.skip("ARC_PROVIDER_PK not set")
    return ArcCommerce(private_key=pk)


@pytest.fixture(scope="module")
def client_client():
    """Client agent client with write access. Skips if ARC_CLIENT_PK not set."""
    pk = os.environ.get("ARC_CLIENT_PK")
    if not pk:
        pytest.skip("ARC_CLIENT_PK not set")
    return ArcCommerce(private_key=pk)
