"""Arc Agent Commerce Protocol SDK client."""

import time
import random
import logging
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from arc_commerce.constants import (
    ARC_TESTNET_CHAIN_ID,
    USDC_ADDRESS,
    SERVICE_MARKET_ADDRESS,
    SERVICE_ESCROW_ADDRESS,
    SPENDING_POLICY_ADDRESS,
    IDENTITY_REGISTRY_ADDRESS,
    get_network_config,
)
from arc_commerce.types import Service, Agreement, AgreementStatus
from arc_commerce.abi import (
    SERVICE_MARKET_ABI,
    SERVICE_ESCROW_ABI,
    SPENDING_POLICY_ABI,
    IDENTITY_REGISTRY_ABI,
    ERC20_ABI,
)
from arc_commerce.errors import (
    TransactionRevertedError,
    TransactionTimeoutError,
    InsufficientBalanceError,
    PolicyViolationError,
)

logger = logging.getLogger("arc_commerce")


class ArcCommerce:
    """Client for interacting with Agent Commerce Protocol on Arc."""

    def __init__(
        self,
        private_key: str | None = None,
        rpc_url: str = None,
        network: str = "testnet",
        service_market: str = None,
        service_escrow: str = None,
        escrow_address: str = None,
        market_address: str = None,
        policy_address: str = None,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        tx_timeout: int = 120,
        log_level: str = "INFO",
    ):
        # Retry and timeout config
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.tx_timeout = tx_timeout

        # Configure logger
        logging.getLogger("arc_commerce").setLevel(getattr(logging, log_level.upper(), logging.INFO))

        # Resolve network config
        config = get_network_config(network)
        rpc = rpc_url or config["rpc"]
        self.w3 = Web3(Web3.HTTPProvider(rpc))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        self.chain_id = config.get("chain_id", ARC_TESTNET_CHAIN_ID)

        self.account = None
        if private_key:
            self.account = self.w3.eth.account.from_key(private_key)

        # Resolve contract addresses (explicit params > network config > hardcoded defaults)
        market_addr = market_address or service_market or config.get("service_market", SERVICE_MARKET_ADDRESS)
        escrow_addr = escrow_address or service_escrow or config.get("service_escrow", SERVICE_ESCROW_ADDRESS)
        policy_addr = policy_address or config.get("spending_policy", SPENDING_POLICY_ADDRESS)
        usdc_addr = config.get("usdc", USDC_ADDRESS)
        identity_addr = config.get("identity_registry", IDENTITY_REGISTRY_ADDRESS)

        self.market = self.w3.eth.contract(
            address=Web3.to_checksum_address(market_addr),
            abi=SERVICE_MARKET_ABI,
        )
        self.escrow = self.w3.eth.contract(
            address=Web3.to_checksum_address(escrow_addr),
            abi=SERVICE_ESCROW_ABI,
        )
        self.usdc = self.w3.eth.contract(
            address=Web3.to_checksum_address(usdc_addr),
            abi=ERC20_ABI,
        )
        self.policy = self.w3.eth.contract(
            address=Web3.to_checksum_address(policy_addr),
            abi=SPENDING_POLICY_ABI,
        )
        self.identity = self.w3.eth.contract(
            address=Web3.to_checksum_address(identity_addr),
            abi=IDENTITY_REGISTRY_ABI,
        )

        self._nonce = None  # Client-side nonce tracker

    def _get_nonce(self):
        """Get next nonce, using client-side tracking to avoid race conditions."""
        if self._nonce is None:
            self._nonce = self.w3.eth.get_transaction_count(self.account.address)
        else:
            self._nonce += 1
        return self._nonce

    def _reset_nonce(self):
        """Reset nonce tracking (call after errors)."""
        self._nonce = None

    # ── Retry helper ──

    def _retry(self, fn, max_retries=None, is_write=False):
        """Retry a function with exponential backoff and jitter.

        Write operations get only 1 retry by default to avoid duplicate txs.
        """
        retries = 1 if is_write else (max_retries or self.max_retries)
        delay = self.retry_delay
        last_error = None
        for attempt in range(retries + 1):
            try:
                return fn()
            except Exception as e:
                last_error = e
                if attempt < retries:
                    jitter = random.uniform(0, delay * 0.1)
                    sleep_time = delay + jitter
                    logger.debug(f"Retry {attempt + 1}/{retries} after {sleep_time:.1f}s: {e}")
                    time.sleep(sleep_time)
                    delay *= 2
        raise last_error

    # ── Read methods (no wallet needed) ──

    def get_service(self, service_id: int) -> Service:
        """Get a service by ID."""
        raw = self._retry(lambda: self.market.functions.getService(service_id).call())
        return Service(
            service_id=service_id,
            agent_id=raw[0],
            provider=raw[1],
            capability_hash=raw[2],
            price_per_task=raw[3],
            metadata_uri=raw[4],
            active=raw[5],
        )

    def find_services(self, capability: str) -> list[Service]:
        """Find active services by capability name (e.g., 'smart_contract_audit')."""
        cap_hash = Web3.keccak(text=capability)
        ids = self._retry(lambda: self.market.functions.getServicesByCapability(cap_hash).call())
        services = []
        for sid in ids:
            svc = self.get_service(sid)
            if svc.active:
                services.append(svc)
        return services

    def get_services_by_agent(self, agent_id: int) -> list[Service]:
        """Get all services listed by an agent."""
        ids = self._retry(lambda: self.market.functions.getServicesByAgent(agent_id).call())
        return [self.get_service(sid) for sid in ids]

    def list_all_services(self) -> list[Service]:
        """List all services (active and inactive)."""
        count = self._retry(lambda: self.market.functions.nextServiceId().call())
        return [self.get_service(i) for i in range(count)]

    def get_agreement(self, agreement_id: int) -> Agreement:
        """Get an agreement by ID."""
        raw = self._retry(lambda: self.escrow.functions.getAgreement(agreement_id).call())
        return Agreement(
            agreement_id=agreement_id,
            client=raw[0],
            provider=raw[1],
            provider_agent_id=raw[2],
            client_agent_id=raw[3],
            amount=raw[4],
            deadline=raw[5],
            task_hash=raw[6],
            service_id=raw[7],
            status=AgreementStatus(raw[8]),
        )

    def get_client_agreements(self, address: str) -> list[Agreement]:
        """Get all agreements where address is the client."""
        ids = self._retry(lambda: self.escrow.functions.getClientAgreements(
            Web3.to_checksum_address(address)
        ).call())
        return [self.get_agreement(int(aid)) for aid in ids]

    def get_provider_agreements(self, address: str) -> list[Agreement]:
        """Get all agreements where address is the provider."""
        ids = self._retry(lambda: self.escrow.functions.getProviderAgreements(
            Web3.to_checksum_address(address)
        ).call())
        return [self.get_agreement(int(aid)) for aid in ids]

    def total_services(self) -> int:
        """Total number of services listed."""
        return self._retry(lambda: self.market.functions.nextServiceId().call())

    def total_agreements(self) -> int:
        """Total number of agreements created."""
        return self._retry(lambda: self.escrow.functions.nextAgreementId().call())

    def total_fees(self) -> int:
        """Total protocol fees collected (6 decimals)."""
        return self._retry(lambda: self.escrow.functions.totalFeesCollected().call())

    # ── SpendingPolicy read methods ──

    def get_policy(self, agent: str) -> dict:
        """Get the spending policy for an agent address.

        Returns dict with maxPerTx, maxDaily, dailySpent, dayStart, exists.
        """
        raw = self._retry(lambda: self.policy.functions.policies(
            Web3.to_checksum_address(agent)
        ).call())
        return {
            "maxPerTx": raw[0],
            "maxDaily": raw[1],
            "dailySpent": raw[2],
            "dayStart": raw[3],
            "exists": raw[4],
        }

    def daily_remaining(self, agent: str) -> int:
        """Get the remaining daily spending allowance (6 decimals)."""
        return self._retry(lambda: self.policy.functions.dailyRemaining(
            Web3.to_checksum_address(agent)
        ).call())

    def would_pass(self, agent: str, amount_usdc: float, counterparty: str) -> bool:
        """Check if a transaction would pass the spending policy."""
        amount = int(amount_usdc * 1_000_000)
        return self._retry(lambda: self.policy.functions.wouldPass(
            Web3.to_checksum_address(agent),
            amount,
            Web3.to_checksum_address(counterparty),
        ).call())

    # ── IdentityRegistry read methods ──

    def get_agent_owner(self, agent_id: int) -> str:
        """Get the owner address of an agent by its ERC-8004 token ID."""
        return self._retry(lambda: self.identity.functions.ownerOf(agent_id).call())

    def get_agent_uri(self, agent_id: int) -> str:
        """Get the metadata URI of an agent by its ERC-8004 token ID."""
        return self._retry(lambda: self.identity.functions.tokenURI(agent_id).call())

    # ── Write methods (wallet required) ──

    def _send_tx(self, tx_func):
        """Build, sign, and send a transaction."""
        if not self.account:
            raise ValueError("Private key required for write operations")
        try:
            tx = tx_func.build_transaction({
                "from": self.account.address,
                "nonce": self._get_nonce(),
                "chainId": self.chain_id,
            })
            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"Transaction sent: {tx_hash.hex()}")

            try:
                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.tx_timeout)
            except Exception as e:
                if "timeout" in str(e).lower() or "TimeExhausted" in type(e).__name__:
                    raise TransactionTimeoutError(tx_hash.hex(), self.tx_timeout) from e
                raise

            if receipt["status"] != 1:
                # Try to extract revert reason
                reason = ""
                try:
                    self.w3.eth.call(tx, block_identifier=receipt["blockNumber"])
                except Exception as call_err:
                    reason = str(call_err)

                # Map known revert reasons to typed exceptions
                if "PolicyCheckFailed" in reason:
                    raise PolicyViolationError(f"Transaction {tx_hash.hex()} failed policy check: {reason}")
                if "insufficient" in reason.lower():
                    raise InsufficientBalanceError(f"Transaction {tx_hash.hex()}: {reason}")

                raise TransactionRevertedError(tx_hash.hex(), reason)

            logger.info(f"Transaction confirmed: {tx_hash.hex()} (block {receipt['blockNumber']})")
            return receipt
        except Exception:
            self._reset_nonce()
            raise

    def list_service(
        self,
        agent_id: int,
        capability: str,
        price_usdc: float,
        metadata_uri: str,
    ) -> int:
        """List a new service. Returns the service ID."""
        cap_hash = Web3.keccak(text=capability)
        price = int(price_usdc * 1_000_000)
        receipt = self._send_tx(
            self.market.functions.listService(agent_id, cap_hash, price, metadata_uri)
        )
        logs = self.market.events.ServiceListed().process_receipt(receipt)
        return logs[0]["args"]["serviceId"] if logs else -1

    def update_service(
        self,
        service_id: int,
        new_price_usdc: float,
        new_metadata_uri: str,
    ) -> dict:
        """Update an existing service's price and metadata."""
        price = int(new_price_usdc * 1_000_000)
        return self._send_tx(
            self.market.functions.updateService(service_id, price, new_metadata_uri)
        )

    def delist_service(self, service_id: int) -> dict:
        """Delist (deactivate) a service."""
        return self._send_tx(
            self.market.functions.delistService(service_id)
        )

    def create_agreement(
        self,
        provider: str,
        provider_agent_id: int,
        client_agent_id: int,
        amount_usdc: float,
        deadline_hours: float,
        task_description: str,
        service_id: int = 0,
        auto_approve: bool = True,
    ) -> int:
        """Create a USDC-escrowed agreement. Returns the agreement ID.

        If auto_approve=True (default), approves USDC spend first.
        """
        amount = int(amount_usdc * 1_000_000)
        deadline = int(time.time() + deadline_hours * 3600)
        task_hash = Web3.keccak(text=task_description)

        if auto_approve:
            self._send_tx(
                self.usdc.functions.approve(
                    Web3.to_checksum_address(SERVICE_ESCROW_ADDRESS), amount
                )
            )

        receipt = self._send_tx(
            self.escrow.functions.createAgreement(
                Web3.to_checksum_address(provider),
                provider_agent_id,
                client_agent_id,
                amount,
                deadline,
                task_hash,
                service_id,
            )
        )
        logs = self.escrow.events.AgreementCreated().process_receipt(receipt)
        return logs[0]["args"]["agreementId"] if logs else -1

    def confirm_completion(self, agreement_id: int) -> dict:
        """Confirm task completion. Releases escrow to provider."""
        return self._send_tx(
            self.escrow.functions.confirmCompletion(agreement_id)
        )

    def dispute(self, agreement_id: int) -> dict:
        """Dispute an active agreement."""
        return self._send_tx(
            self.escrow.functions.dispute(agreement_id)
        )

    def claim_expired(self, agreement_id: int) -> dict:
        """Claim refund for an expired agreement."""
        return self._send_tx(
            self.escrow.functions.claimExpired(agreement_id)
        )

    # ── SpendingPolicy write methods ──

    def set_policy(self, agent: str, max_per_tx_usdc: float, max_daily_usdc: float) -> dict:
        """Set a spending policy for an agent."""
        return self._send_tx(
            self.policy.functions.setPolicy(
                Web3.to_checksum_address(agent),
                int(max_per_tx_usdc * 1_000_000),
                int(max_daily_usdc * 1_000_000),
            )
        )

    def set_counterparty_restriction(self, agent: str, restricted: bool) -> dict:
        """Enable or disable counterparty restrictions for an agent."""
        return self._send_tx(
            self.policy.functions.setCounterpartyRestriction(
                Web3.to_checksum_address(agent),
                restricted,
            )
        )

    def set_allowed_counterparty(self, agent: str, counterparty: str, allowed: bool) -> dict:
        """Allow or revoke a counterparty for an agent."""
        return self._send_tx(
            self.policy.functions.setAllowedCounterparty(
                Web3.to_checksum_address(agent),
                Web3.to_checksum_address(counterparty),
                allowed,
            )
        )

    # ── Convenience ──

    def hire(
        self,
        capability: str,
        amount_usdc: float,
        task_description: str,
        client_agent_id: int = 0,
        deadline_hours: float = 24,
    ) -> tuple[Service, int]:
        """Find the cheapest service for a capability and create an agreement.

        Returns (service, agreement_id).
        """
        services = self.find_services(capability)
        if not services:
            raise ValueError(f"No active services found for '{capability}'")
        cheapest = min(services, key=lambda s: s.price_per_task)
        agreement_id = self.create_agreement(
            provider=cheapest.provider,
            provider_agent_id=cheapest.agent_id,
            client_agent_id=client_agent_id,
            amount_usdc=amount_usdc,
            deadline_hours=deadline_hours,
            task_description=task_description,
        )
        return cheapest, agreement_id
