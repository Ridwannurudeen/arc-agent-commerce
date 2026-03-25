from dataclasses import dataclass
from enum import IntEnum


class AgreementStatus(IntEnum):
    ACTIVE = 0
    COMPLETED = 1
    DISPUTED = 2
    EXPIRED = 3
    RESOLVED = 4


@dataclass
class Service:
    service_id: int
    agent_id: int
    provider: str
    capability_hash: bytes
    price_per_task: int  # USDC amount in 6 decimals
    metadata_uri: str
    active: bool

    @property
    def price_usdc(self) -> float:
        return self.price_per_task / 1_000_000


@dataclass
class Agreement:
    agreement_id: int
    client: str
    provider: str
    provider_agent_id: int
    client_agent_id: int
    amount: int  # USDC amount in 6 decimals
    deadline: int  # unix timestamp
    task_hash: bytes
    service_id: int
    status: AgreementStatus

    @property
    def amount_usdc(self) -> float:
        return self.amount / 1_000_000
