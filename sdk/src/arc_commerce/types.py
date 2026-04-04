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


class StageStatus(IntEnum):
    PENDING = 0
    ACTIVE = 1
    COMPLETED = 2
    FAILED = 3


class PipelineStatus(IntEnum):
    ACTIVE = 0
    COMPLETED = 1
    HALTED = 2
    CANCELLED = 3


@dataclass
class Stage:
    provider_agent_id: int
    provider_address: str
    capability_hash: bytes
    budget: int
    job_id: int
    status: StageStatus

    @property
    def budget_usdc(self) -> float:
        return self.budget / 1e6


@dataclass
class Pipeline:
    pipeline_id: int
    client_agent_id: int
    client: str
    currency: str
    total_budget: int
    total_spent: int
    current_stage: int
    stage_count: int
    status: PipelineStatus
    created_at: int
    deadline: int

    @property
    def total_budget_usdc(self) -> float:
        return self.total_budget / 1e6


class StreamStatus(IntEnum):
    ACTIVE = 0
    PAUSED = 1
    COMPLETED = 2
    CANCELLED = 3


@dataclass
class StreamInfo:
    stream_id: int
    client: str
    provider: str
    client_agent_id: int
    provider_agent_id: int
    currency: str
    deposit: int
    withdrawn: int
    start_time: int
    end_time: int
    heartbeat_interval: int
    last_heartbeat: int
    missed_beats: int
    paused_at: int
    total_paused_time: int
    status: StreamStatus

    @property
    def deposit_usdc(self) -> float:
        return self.deposit / 1e6

    @property
    def rate_per_second(self) -> float:
        duration = self.end_time - self.start_time
        return self.deposit_usdc / duration if duration > 0 else 0
