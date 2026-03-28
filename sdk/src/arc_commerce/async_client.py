"""Async version of the Arc Commerce client."""
import logging
from web3 import AsyncWeb3, AsyncHTTPProvider
from .constants import (
    get_network_config,
    SERVICE_MARKET_ADDRESS,
    SERVICE_ESCROW_ADDRESS,
    SPENDING_POLICY_ADDRESS,
)
from .types import Service, Agreement, AgreementStatus
from .abi import (
    SERVICE_MARKET_ABI,
    SERVICE_ESCROW_ABI,
    SPENDING_POLICY_ABI,
)

logger = logging.getLogger("arc_commerce.async")


class AsyncArcCommerce:
    """Async client for interacting with Arc Agent Commerce contracts."""

    def __init__(self, rpc_url=None, private_key=None, network="testnet", tx_timeout=120):
        config = get_network_config(network)
        self.rpc_url = rpc_url or config["rpc"]
        self.w3 = AsyncWeb3(AsyncHTTPProvider(self.rpc_url))
        self.tx_timeout = tx_timeout
        self._config = config

        if private_key:
            self.account = self.w3.eth.account.from_key(private_key)
        else:
            self.account = None

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
