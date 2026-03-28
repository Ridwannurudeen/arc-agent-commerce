"""Tests for AsyncArcCommerce client."""
import inspect
from arc_commerce.async_client import AsyncArcCommerce


class TestAsyncClientStructure:
    def test_has_write_methods(self):
        """AsyncArcCommerce should have all write methods."""
        assert hasattr(AsyncArcCommerce, '_send_tx')
        assert hasattr(AsyncArcCommerce, 'list_service')
        assert hasattr(AsyncArcCommerce, 'create_agreement')
        assert hasattr(AsyncArcCommerce, 'confirm_completion')
        assert hasattr(AsyncArcCommerce, 'dispute')
        assert hasattr(AsyncArcCommerce, 'claim_expired')
        assert hasattr(AsyncArcCommerce, 'resolve_dispute')
        assert hasattr(AsyncArcCommerce, 'resolve_expired_dispute')
        assert hasattr(AsyncArcCommerce, 'check_allowance')
        assert hasattr(AsyncArcCommerce, 'set_policy')
        assert hasattr(AsyncArcCommerce, 'set_counterparty_restriction')
        assert hasattr(AsyncArcCommerce, 'set_allowed_counterparty')

    def test_has_nonce_tracking(self):
        """AsyncArcCommerce should have nonce management."""
        assert hasattr(AsyncArcCommerce, '_get_nonce')
        assert hasattr(AsyncArcCommerce, '_reset_nonce')

    def test_has_read_methods(self):
        """AsyncArcCommerce should have all read methods."""
        assert hasattr(AsyncArcCommerce, 'get_service')
        assert hasattr(AsyncArcCommerce, 'get_agreement')
        assert hasattr(AsyncArcCommerce, 'get_services_by_capability')
        assert hasattr(AsyncArcCommerce, 'get_client_agreements')
        assert hasattr(AsyncArcCommerce, 'get_provider_agreements')
        assert hasattr(AsyncArcCommerce, 'would_pass_policy')
        assert hasattr(AsyncArcCommerce, 'get_daily_remaining')

    def test_write_methods_are_async(self):
        """All write methods should be coroutines."""
        assert inspect.iscoroutinefunction(AsyncArcCommerce._send_tx)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.list_service)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.create_agreement)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.confirm_completion)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.dispute)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.claim_expired)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.resolve_dispute)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.resolve_expired_dispute)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.check_allowance)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.set_policy)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.set_counterparty_restriction)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.set_allowed_counterparty)

    def test_read_methods_are_async(self):
        """All read methods should be coroutines."""
        assert inspect.iscoroutinefunction(AsyncArcCommerce.get_service)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.get_agreement)
        assert inspect.iscoroutinefunction(AsyncArcCommerce.get_services_by_capability)
        assert inspect.iscoroutinefunction(AsyncArcCommerce._get_nonce)

    def test_reset_nonce_is_sync(self):
        """_reset_nonce should be a regular (sync) method."""
        assert not inspect.iscoroutinefunction(AsyncArcCommerce._reset_nonce)
