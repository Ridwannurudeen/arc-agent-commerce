"""Tests for retry logic."""
import pytest
from arc_commerce.client import ArcCommerce


def test_retry_succeeds_after_failure():
    """Test that retry eventually succeeds."""
    client = ArcCommerce.__new__(ArcCommerce)
    client.max_retries = 3
    client.retry_delay = 0.01  # Fast for tests

    call_count = 0
    def flaky_fn():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise ConnectionError("RPC down")
        return "success"

    result = client._retry(flaky_fn)
    assert result == "success"
    assert call_count == 3


def test_retry_exhausted():
    """Test that retry raises after all attempts exhausted."""
    client = ArcCommerce.__new__(ArcCommerce)
    client.max_retries = 2
    client.retry_delay = 0.01

    def always_fail():
        raise ConnectionError("RPC down")

    with pytest.raises(ConnectionError):
        client._retry(always_fail)


def test_retry_write_limited():
    """Test that writes only get 1 retry."""
    client = ArcCommerce.__new__(ArcCommerce)
    client.max_retries = 5
    client.retry_delay = 0.01

    call_count = 0
    def fail_fn():
        nonlocal call_count
        call_count += 1
        raise ConnectionError("fail")

    with pytest.raises(ConnectionError):
        client._retry(fail_fn, is_write=True)

    assert call_count == 2  # 1 original + 1 retry for writes
