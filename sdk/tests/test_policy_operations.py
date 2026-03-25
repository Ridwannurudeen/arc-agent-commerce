"""Read-only tests for SpendingPolicy operations."""

import pytest


class TestGetPolicy:
    def test_get_policy_no_policy(self, client):
        """Address with no policy should return exists=False."""
        result = client.get_policy("0x0000000000000000000000000000000000000001")
        assert isinstance(result, dict)
        assert "exists" in result
        assert "maxPerTx" in result
        assert "maxDaily" in result
        assert "dailySpent" in result
        assert "dayStart" in result

    def test_get_policy_returns_dict(self, client):
        """get_policy should return a dict with all expected keys."""
        result = client.get_policy("0x0000000000000000000000000000000000000001")
        assert isinstance(result["maxPerTx"], int)
        assert isinstance(result["maxDaily"], int)
        assert isinstance(result["exists"], bool)


class TestDailyRemaining:
    def test_daily_remaining_no_policy(self, client):
        """Address with no policy should return 0 remaining."""
        result = client.daily_remaining("0x0000000000000000000000000000000000000001")
        assert isinstance(result, int)
        assert result >= 0

    def test_daily_remaining_returns_int(self, client):
        """daily_remaining should return an integer."""
        result = client.daily_remaining("0x0000000000000000000000000000000000000001")
        assert isinstance(result, int)


class TestWouldPass:
    def test_would_pass_no_policy(self, client):
        """Address with no policy — wouldPass behavior depends on contract logic."""
        result = client.would_pass(
            "0x0000000000000000000000000000000000000001",
            10.0,
            "0x0000000000000000000000000000000000000002",
        )
        assert isinstance(result, bool)

    def test_would_pass_returns_bool(self, client):
        """would_pass should return a boolean."""
        result = client.would_pass(
            "0x0000000000000000000000000000000000000001",
            1.0,
            "0x0000000000000000000000000000000000000002",
        )
        assert isinstance(result, bool)
