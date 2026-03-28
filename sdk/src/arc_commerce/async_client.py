"""Async version of the Arc Commerce client."""
import time
import logging
from web3 import AsyncWeb3, AsyncHTTPProvider, Web3
from .constants import (
    get_network_config,
    SERVICE_MARKET_ADDRESS,
    SERVICE_ESCROW_ADDRESS,
    SPENDING_POLICY_ADDRESS,
    IDENTITY_REGISTRY_ADDRESS,
    USDC_ADDRESS,
)
from .types import Service, Agreement, AgreementStatus
from .abi import (
    SERVICE_MARKET_ABI,
    SERVICE_ESCROW_ABI,
    SPENDING_POLICY_ABI,
    IDENTITY_REGISTRY_ABI,
    ERC20_ABI,
)
from .errors import (
    TransactionRevertedError,
    TransactionTimeoutError,
    InsufficientBalanceError,
    PolicyViolationError,
)

logger = logging.getLogger("arc_commerce.async")


class AsyncArcCommerce:
    """Async client for interacting with Arc Agent Commerce contracts."""

    def __init__(self, rpc_url=None, private_key=None, network="testnet", tx_timeout=120):
        config = get_network_config(network)
        self.rpc_url = rpc_url or config["rpc"]
        self.w3 = AsyncWeb3(AsyncHTTPProvider(self.rpc_url))
        self.tx_timeout = tx_timeout
        self.chain_id = config.get("chain_id", 5042002)
        self._config = config

        if private_key:
            self.account = self.w3.eth.account.from_key(private_key)
        else:
            self.account = None

        self._nonce = None  # Client-side nonce tracker

        self._setup_contracts(config)

    def _setup_contracts(self, config):
        """Set up contract instances."""
        self.market = self.w3.eth.contract(
            address=self.w3.to_checksum_address(config.get("service_market", SERVICE_MARKET_ADDRESS)),
            abi=SERVICE_MARKET_ABI,
        )
        self.escrow = self.w3.eth.contract(
            address=self.w3.to_checksum_address(config.get("service_escrow", SERVICE_ESCROW_ADDRESS)),
            abi=SERVICE_ESCROW_ABI,
        )
        self.policy = self.w3.eth.contract(
            address=self.w3.to_checksum_address(config.get("spending_policy", SPENDING_POLICY_ADDRESS)),
            abi=SPENDING_POLICY_ABI,
        )
        usdc_addr = config.get("usdc", USDC_ADDRESS)
        identity_addr = config.get("identity_registry", IDENTITY_REGISTRY_ADDRESS)
        self.usdc = self.w3.eth.contract(
            address=self.w3.to_checksum_address(usdc_addr),
            abi=ERC20_ABI,
        )
        self.identity = self.w3.eth.contract(
            address=self.w3.to_checksum_address(identity_addr),
            abi=IDENTITY_REGISTRY_ABI,
        )

    # --- Nonce management ---

    async def _get_nonce(self):
        """Get next nonce, using client-side tracking."""
        if self._nonce is None:
            self._nonce = await self.w3.eth.get_transaction_count(self.account.address)
        else:
            self._nonce += 1
        return self._nonce

    def _reset_nonce(self):
        """Reset nonce tracking."""
        self._nonce = None

    # --- Transaction sending ---

    async def _send_tx(self, tx_func):
        """Build, sign, and send a transaction."""
        if not self.account:
            raise ValueError("Private key required for write operations")
        try:
            tx = tx_func.build_transaction({
                "from": self.account.address,
                "nonce": await self._get_nonce(),
                "chainId": self.chain_id,
            })
            estimated_gas = await self.w3.eth.estimate_gas(tx)
            tx["gas"] = int(estimated_gas * 1.2)
            signed = self.account.sign_transaction(tx)
            tx_hash = await self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"Transaction sent: {tx_hash.hex()}")

            try:
                receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.tx_timeout)
            except Exception as e:
                if "timeout" in str(e).lower() or "TimeExhausted" in type(e).__name__:
                    raise TransactionTimeoutError(tx_hash.hex(), self.tx_timeout) from e
                raise

            if receipt["status"] != 1:
                reason = ""
                try:
                    await self.w3.eth.call(tx, block_identifier=receipt["blockNumber"])
                except Exception as call_err:
                    reason = str(call_err)
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

    # --- Read methods ---

    async def get_service(self, service_id: int) -> Service:
        """Get a service by ID."""
        raw = await self.market.functions.getService(service_id).call()
        return Service(
            service_id=service_id,
            agent_id=raw[0],
            provider=raw[1],
            capability_hash=raw[2].hex() if isinstance(raw[2], bytes) else raw[2],
            price_per_task=raw[3],
            metadata_uri=raw[4],
            active=raw[5],
        )

    async def get_agreement(self, agreement_id: int) -> Agreement:
        """Get an agreement by ID."""
        raw = await self.escrow.functions.getAgreement(agreement_id).call()
        return Agreement(
            agreement_id=agreement_id,
            client=raw[0],
            provider=raw[1],
            provider_agent_id=raw[2],
            client_agent_id=raw[3],
            amount=raw[4],
            deadline=raw[5],
            task_hash=raw[6].hex() if isinstance(raw[6], bytes) else raw[6],
            service_id=raw[7],
            status=AgreementStatus(raw[8]),
        )

    async def get_services_by_capability(self, capability: str) -> list:
        """Find active services by capability name."""
        cap_hash = self.w3.keccak(text=capability)
        ids = await self.market.functions.getServicesByCapability(cap_hash).call()
        services = []
        for sid in ids:
            svc = await self.get_service(sid)
            if svc.active:
                services.append(svc)
        return services

    async def get_client_agreements(self, address: str) -> list:
        """Get all agreements where address is the client."""
        ids = await self.escrow.functions.getClientAgreements(
            self.w3.to_checksum_address(address)
        ).call()
        return [await self.get_agreement(aid) for aid in ids]

    async def get_provider_agreements(self, address: str) -> list:
        """Get all agreements where address is the provider."""
        ids = await self.escrow.functions.getProviderAgreements(
            self.w3.to_checksum_address(address)
        ).call()
        return [await self.get_agreement(aid) for aid in ids]

    async def would_pass_policy(self, agent: str, amount: int, counterparty: str) -> bool:
        """Check if a transaction would pass the spending policy."""
        return await self.policy.functions.wouldPass(
            self.w3.to_checksum_address(agent),
            amount,
            self.w3.to_checksum_address(counterparty),
        ).call()

    async def get_daily_remaining(self, agent: str) -> int:
        """Get the remaining daily spending allowance (6 decimals)."""
        return await self.policy.functions.dailyRemaining(
            self.w3.to_checksum_address(agent)
        ).call()

    # --- Write methods ---

    async def list_service(
        self,
        agent_id: int,
        capability: str,
        price_usdc: float,
        metadata_uri: str,
    ) -> int:
        """List a new service. Returns the service ID."""
        cap_hash = Web3.keccak(text=capability)
        price = int(price_usdc * 1_000_000)
        receipt = await self._send_tx(
            self.market.functions.listService(agent_id, cap_hash, price, metadata_uri)
        )
        logs = self.market.events.ServiceListed().process_receipt(receipt)
        return logs[0]["args"]["serviceId"] if logs else -1

    async def update_service(
        self,
        service_id: int,
        new_price_usdc: float,
        new_metadata_uri: str,
    ) -> dict:
        """Update an existing service's price and metadata."""
        price = int(new_price_usdc * 1_000_000)
        return await self._send_tx(
            self.market.functions.updateService(service_id, price, new_metadata_uri)
        )

    async def delist_service(self, service_id: int) -> dict:
        """Delist (deactivate) a service."""
        return await self._send_tx(
            self.market.functions.delistService(service_id)
        )

    async def create_agreement(
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
            current_allowance = await self.check_allowance()
            if current_allowance < amount:
                await self._send_tx(
                    self.usdc.functions.approve(self.escrow.address, amount)
                )

        receipt = await self._send_tx(
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

    async def confirm_completion(self, agreement_id: int) -> dict:
        """Confirm task completion. Releases escrow to provider."""
        return await self._send_tx(
            self.escrow.functions.confirmCompletion(agreement_id)
        )

    async def dispute(self, agreement_id: int) -> dict:
        """Dispute an active agreement."""
        return await self._send_tx(
            self.escrow.functions.dispute(agreement_id)
        )

    async def claim_expired(self, agreement_id: int) -> dict:
        """Claim refund for an expired agreement."""
        return await self._send_tx(
            self.escrow.functions.claimExpired(agreement_id)
        )

    async def resolve_dispute(self, agreement_id: int, client_pct: int) -> dict:
        """Resolve a dispute (owner only). client_pct: 0-100."""
        return await self._send_tx(
            self.escrow.functions.resolveDispute(agreement_id, client_pct)
        )

    async def resolve_expired_dispute(self, agreement_id: int) -> dict:
        """Auto-resolve an expired dispute (anyone can call)."""
        return await self._send_tx(
            self.escrow.functions.resolveExpiredDispute(agreement_id)
        )

    async def check_allowance(self, spender: str = None) -> int:
        """Check current USDC allowance for escrow contract."""
        spender = spender or self.escrow.address
        return await self.usdc.functions.allowance(
            self.account.address,
            Web3.to_checksum_address(spender),
        ).call()

    # --- SpendingPolicy write methods ---

    async def set_policy(self, agent: str, max_per_tx_usdc: float, max_daily_usdc: float) -> dict:
        """Set a spending policy for an agent."""
        return await self._send_tx(
            self.policy.functions.setPolicy(
                Web3.to_checksum_address(agent),
                int(max_per_tx_usdc * 1_000_000),
                int(max_daily_usdc * 1_000_000),
            )
        )

    async def set_counterparty_restriction(self, agent: str, restricted: bool) -> dict:
        """Enable or disable counterparty restrictions for an agent."""
        return await self._send_tx(
            self.policy.functions.setCounterpartyRestriction(
                Web3.to_checksum_address(agent),
                restricted,
            )
        )

    async def set_allowed_counterparty(self, agent: str, counterparty: str, allowed: bool) -> dict:
        """Allow or revoke a counterparty for an agent."""
        return await self._send_tx(
            self.policy.functions.setAllowedCounterparty(
                Web3.to_checksum_address(agent),
                Web3.to_checksum_address(counterparty),
                allowed,
            )
        )
