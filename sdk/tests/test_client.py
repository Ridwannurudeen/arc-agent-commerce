"""Tests for ArcCommerce client nonce tracking, gas estimation, and new methods."""
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from arc_commerce.client import ArcCommerce
from arc_commerce.errors import TransactionRevertedError


@pytest.fixture
def mock_w3():
    """Create a mock Web3 instance."""
    w3 = MagicMock()
    w3.eth.get_transaction_count.return_value = 5
    w3.eth.estimate_gas.return_value = 100000
    w3.eth.chain_id = 5042002
    w3.to_checksum_address = lambda addr: addr
    return w3


@pytest.fixture
def client(mock_w3):
    """Create ArcCommerce client with mocked Web3.

    Patches Web3 in the client module so that static calls like
    Web3.to_checksum_address inside methods pass through as identity.
    """
    with patch("arc_commerce.client.Web3") as MockWeb3:
        MockWeb3.return_value = mock_w3
        MockWeb3.to_checksum_address = lambda addr: addr
        MockWeb3.HTTPProvider = MagicMock()
        MockWeb3.keccak = MagicMock(return_value=b'\x00' * 32)
        c = ArcCommerce.__new__(ArcCommerce)
        c.w3 = mock_w3
        c.chain_id = 5042002
        c.account = MagicMock()
        c.account.address = "0x1234"
        c.max_retries = 1
        c.retry_delay = 0
        c.tx_timeout = 10
        c._nonce = None
        c.market = MagicMock()
        c.escrow = MagicMock()
        c.usdc = MagicMock()
        c.policy = MagicMock()
        c.identity = MagicMock()
        yield c


class TestNonceTracking:
    def test_first_call_fetches_from_chain(self, client):
        """First _get_nonce should fetch from chain."""
        nonce = client._get_nonce()
        assert nonce == 5
        client.w3.eth.get_transaction_count.assert_called_once_with("0x1234")

    def test_second_call_increments(self, client):
        """Subsequent calls should increment without fetching."""
        n1 = client._get_nonce()
        n2 = client._get_nonce()
        assert n2 == n1 + 1
        # Only one chain call
        assert client.w3.eth.get_transaction_count.call_count == 1

    def test_reset_forces_refetch(self, client):
        """After reset, next call should fetch from chain again."""
        client._get_nonce()
        client._reset_nonce()
        assert client._nonce is None
        client.w3.eth.get_transaction_count.return_value = 10
        nonce = client._get_nonce()
        assert nonce == 10
        assert client.w3.eth.get_transaction_count.call_count == 2

    def test_sequential_nonces_increment(self, client):
        """Multiple rapid calls should produce sequential nonces."""
        nonces = [client._get_nonce() for _ in range(5)]
        assert nonces == [5, 6, 7, 8, 9]


class TestGasEstimation:
    def test_gas_buffer_applied(self, client):
        """Gas estimation should apply 20% buffer."""
        client.w3.eth.estimate_gas.return_value = 100000

        tx_func = MagicMock()
        tx_func.build_transaction.return_value = {"from": "0x1234"}

        # Mock the signing/sending chain
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client._send_tx(tx_func)

        # Verify gas was set to 120000 (100000 * 1.2)
        call_args = client.account.sign_transaction.call_args
        tx_dict = call_args[0][0]
        assert tx_dict["gas"] == 120000


class TestCheckAllowance:
    def test_check_allowance_default_spender(self, client):
        """check_allowance with no arg should use escrow address."""
        client.usdc.functions.allowance.return_value.call.return_value = 1000000
        result = client.check_allowance()
        assert result == 1000000


class TestNewMethods:
    def test_resolve_dispute_calls_contract(self, client):
        """resolve_dispute should call escrow.resolveDispute."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.resolve_dispute(1, 50)
        client.escrow.functions.resolveDispute.assert_called_once_with(1, 50)

    def test_resolve_expired_dispute_calls_contract(self, client):
        """resolve_expired_dispute should call escrow.resolveExpiredDispute."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.resolve_expired_dispute(1)
        client.escrow.functions.resolveExpiredDispute.assert_called_once_with(1)

    def test_dispute_calls_contract(self, client):
        """dispute should call escrow.dispute."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.dispute(42)
        client.escrow.functions.dispute.assert_called_once_with(42)

    def test_claim_expired_calls_contract(self, client):
        """claim_expired should call escrow.claimExpired."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.claim_expired(7)
        client.escrow.functions.claimExpired.assert_called_once_with(7)

    def test_set_policy_calls_contract(self, client):
        """set_policy should call policy.setPolicy with USDC amounts."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.set_policy("0xAgent", 100.0, 1000.0)
        client.policy.functions.setPolicy.assert_called_once_with(
            "0xAgent", 100_000_000, 1_000_000_000
        )

    def test_set_counterparty_restriction_calls_contract(self, client):
        """set_counterparty_restriction should call policy correctly."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.set_counterparty_restriction("0xAgent", True)
        client.policy.functions.setCounterpartyRestriction.assert_called_once_with(
            "0xAgent", True
        )

    def test_set_allowed_counterparty_calls_contract(self, client):
        """set_allowed_counterparty should call policy correctly."""
        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 1, "blockNumber": 1}

        client.set_allowed_counterparty("0xAgent", "0xCounterparty", True)
        client.policy.functions.setAllowedCounterparty.assert_called_once_with(
            "0xAgent", "0xCounterparty", True
        )


class TestSendTxErrorHandling:
    def test_send_tx_requires_account(self, client):
        """_send_tx should raise ValueError without a private key."""
        client.account = None
        with pytest.raises(ValueError, match="Private key required"):
            client._send_tx(MagicMock())

    def test_send_tx_resets_nonce_on_error(self, client):
        """_send_tx should reset nonce after any error."""
        tx_func = MagicMock()
        tx_func.build_transaction.side_effect = RuntimeError("RPC fail")

        with pytest.raises(RuntimeError):
            client._send_tx(tx_func)

        assert client._nonce is None

    def test_send_tx_reverted_raises_typed_error(self, client):
        """_send_tx should raise TransactionRevertedError on status=0."""
        tx_func = MagicMock()
        tx_func.build_transaction.return_value = {"from": "0x1234"}

        client.account.sign_transaction.return_value = MagicMock(raw_transaction=b"signed")
        client.w3.eth.send_raw_transaction.return_value = b"\x00" * 32
        client.w3.eth.wait_for_transaction_receipt.return_value = {"status": 0, "blockNumber": 1}
        client.w3.eth.call.side_effect = Exception("SomeRevertReason")

        with pytest.raises(TransactionRevertedError):
            client._send_tx(tx_func)
