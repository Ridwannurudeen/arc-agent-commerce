"""Tests for Arc Commerce error types."""
import pytest
from arc_commerce.errors import (
    ArcCommerceError,
    TransactionRevertedError,
    TransactionTimeoutError,
    InsufficientBalanceError,
    PolicyViolationError,
    NoServicesFoundError,
)


def test_transaction_reverted_error():
    err = TransactionRevertedError("0xabc", "NotAgentOwner")
    assert "0xabc" in str(err)
    assert "NotAgentOwner" in str(err)
    assert err.tx_hash == "0xabc"
    assert err.reason == "NotAgentOwner"


def test_transaction_reverted_error_no_reason():
    err = TransactionRevertedError("0xdef")
    assert "0xdef" in str(err)
    assert err.reason == ""


def test_transaction_timeout_error():
    err = TransactionTimeoutError("0x123", 120)
    assert "0x123" in str(err)
    assert "120" in str(err)
    assert err.tx_hash == "0x123"
    assert err.timeout == 120


def test_error_hierarchy():
    assert issubclass(TransactionRevertedError, ArcCommerceError)
    assert issubclass(TransactionTimeoutError, ArcCommerceError)
    assert issubclass(InsufficientBalanceError, ArcCommerceError)
    assert issubclass(PolicyViolationError, ArcCommerceError)
    assert issubclass(NoServicesFoundError, ArcCommerceError)
    assert issubclass(ArcCommerceError, Exception)


def test_insufficient_balance_error():
    err = InsufficientBalanceError("Not enough USDC")
    assert "Not enough USDC" in str(err)


def test_policy_violation_error():
    err = PolicyViolationError("exceeds daily limit")
    assert "exceeds daily limit" in str(err)
