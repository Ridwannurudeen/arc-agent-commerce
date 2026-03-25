"""Arc Agent Commerce Protocol SDK client."""

import time
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from arc_commerce.constants import (
    ARC_TESTNET_RPC,
    ARC_TESTNET_CHAIN_ID,
    USDC_ADDRESS,
    SERVICE_MARKET_ADDRESS,
    SERVICE_ESCROW_ADDRESS,
    IDENTITY_REGISTRY_ADDRESS,
)
from arc_commerce.types import Service, Agreement, AgreementStatus
from arc_commerce.abi import SERVICE_MARKET_ABI, SERVICE_ESCROW_ABI, ERC20_ABI


class ArcCommerce:
    """Client for interacting with Agent Commerce Protocol on Arc."""

    def __init__(
        self,
        private_key: str | None = None,
        rpc_url: str = ARC_TESTNET_RPC,
        service_market: str = SERVICE_MARKET_ADDRESS,
        service_escrow: str = SERVICE_ESCROW_ADDRESS,
    ):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        self.chain_id = ARC_TESTNET_CHAIN_ID

        self.account = None
        if private_key:
            self.account = self.w3.eth.account.from_key(private_key)

        self.market = self.w3.eth.contract(
            address=Web3.to_checksum_address(service_market),
            abi=SERVICE_MARKET_ABI,
        )
        self.escrow = self.w3.eth.contract(
            address=Web3.to_checksum_address(service_escrow),
            abi=SERVICE_ESCROW_ABI,
        )
        self.usdc = self.w3.eth.contract(
            address=Web3.to_checksum_address(USDC_ADDRESS),
            abi=ERC20_ABI,
        )

    # ── Read methods (no wallet needed) ──

    def get_service(self, service_id: int) -> Service:
        """Get a service by ID."""
        raw = self.market.functions.getService(service_id).call()
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
        ids = self.market.functions.getServicesByCapability(cap_hash).call()
        services = []
        for sid in ids:
            svc = self.get_service(sid)
            if svc.active:
                services.append(svc)
        return services

    def get_services_by_agent(self, agent_id: int) -> list[Service]:
        """Get all services listed by an agent."""
        ids = self.market.functions.getServicesByAgent(agent_id).call()
        return [self.get_service(sid) for sid in ids]

    def list_all_services(self) -> list[Service]:
        """List all services (active and inactive)."""
        count = self.market.functions.nextServiceId().call()
        return [self.get_service(i) for i in range(count)]

    def get_agreement(self, agreement_id: int) -> Agreement:
        """Get an agreement by ID."""
        raw = self.escrow.functions.getAgreement(agreement_id).call()
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
        ids = self.escrow.functions.getClientAgreements(
            Web3.to_checksum_address(address)
        ).call()
        return [self.get_agreement(int(aid)) for aid in ids]

    def get_provider_agreements(self, address: str) -> list[Agreement]:
        """Get all agreements where address is the provider."""
        ids = self.escrow.functions.getProviderAgreements(
            Web3.to_checksum_address(address)
        ).call()
        return [self.get_agreement(int(aid)) for aid in ids]

    def total_services(self) -> int:
        """Total number of services listed."""
        return self.market.functions.nextServiceId().call()

    def total_agreements(self) -> int:
        """Total number of agreements created."""
        return self.escrow.functions.nextAgreementId().call()

    def total_fees(self) -> int:
        """Total protocol fees collected (6 decimals)."""
        return self.escrow.functions.totalFeesCollected().call()

    # ── Write methods (wallet required) ──

    def _send_tx(self, tx_func):
        """Build, sign, and send a transaction."""
        if not self.account:
            raise ValueError("Private key required for write operations")
        tx = tx_func.build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "chainId": self.chain_id,
        })
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt["status"] != 1:
            raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")
        return receipt

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
        # Parse ServiceListed event for the service ID
        logs = self.market.events.ServiceListed().process_receipt(receipt)
        return logs[0]["args"]["serviceId"] if logs else -1

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
