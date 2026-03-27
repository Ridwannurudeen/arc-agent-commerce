class ArcCommerceError(Exception):
    """Base exception for Arc Commerce SDK."""


class TransactionRevertedError(ArcCommerceError):
    def __init__(self, tx_hash: str, reason: str = ""):
        self.tx_hash = tx_hash
        self.reason = reason
        super().__init__(f"Transaction reverted: {tx_hash}" + (f" - {reason}" if reason else ""))


class TransactionTimeoutError(ArcCommerceError):
    def __init__(self, tx_hash: str, timeout: int):
        self.tx_hash = tx_hash
        self.timeout = timeout
        super().__init__(f"Transaction {tx_hash} not confirmed within {timeout}s")


class InsufficientBalanceError(ArcCommerceError):
    pass


class PolicyViolationError(ArcCommerceError):
    pass


class NoServicesFoundError(ArcCommerceError):
    pass
