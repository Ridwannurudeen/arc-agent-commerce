"""LangChain tool wrappers for Arc Agent Commerce Protocol."""
from langchain.tools import BaseTool
from pydantic import BaseModel, Field
from arc_commerce import ArcCommerce


class PipelineInput(BaseModel):
    stages: list[dict] = Field(
        description="Ordered list of pipeline stages. Each stage: {'provider_agent_id': int, 'provider_address': str, 'capability': str, 'budget_usdc': float}"
    )
    client_agent_id: int = Field(description="ERC-8004 agent ID of the client")
    deadline_hours: int = Field(default=24, description="Hours until pipeline expires")
    currency: str = Field(default="USDC", description="Payment currency: USDC or EURC")


class ArcPipelineTool(BaseTool):
    name: str = "arc_create_pipeline"
    description: str = "Create a multi-stage agent workflow pipeline on Arc. Chains multiple ERC-8183 jobs with atomic funding. Returns pipeline ID and stage details."
    args_schema: type = PipelineInput
    client: ArcCommerce = None

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, private_key: str, **kwargs):
        super().__init__(client=ArcCommerce(private_key=private_key), **kwargs)

    def _run(self, stages: list[dict], client_agent_id: int, deadline_hours: int = 24, currency: str = "USDC") -> str:
        pipeline_id = self.client.create_pipeline(
            client_agent_id=client_agent_id,
            stages=stages,
            currency=currency,
            deadline_hours=deadline_hours,
        )
        pipeline = self.client.get_pipeline(pipeline_id)
        return f"Pipeline #{pipeline_id} created: {pipeline.stage_count} stages, {pipeline.total_budget_usdc} {currency} total"


class ApproveStageInput(BaseModel):
    job_id: int = Field(description="The ERC-8183 job ID to approve")


class ArcApproveStage(BaseTool):
    name: str = "arc_approve_stage"
    description: str = "Approve a completed pipeline stage. Releases payment to the provider and advances to the next stage."
    args_schema: type = ApproveStageInput
    client: ArcCommerce = None

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, private_key: str, **kwargs):
        super().__init__(client=ArcCommerce(private_key=private_key), **kwargs)

    def _run(self, job_id: int) -> str:
        self.client.approve_stage(job_id)
        return f"Stage (job #{job_id}) approved. Pipeline advanced."


class FundStageInput(BaseModel):
    pipeline_id: int = Field(description="The pipeline ID whose active stage to fund")


class ArcFundStage(BaseTool):
    name: str = "arc_fund_stage"
    description: str = "Fund the active stage's ACP job after the provider has set a budget. Required step between stage activation and provider submission."
    args_schema: type = FundStageInput
    client: ArcCommerce = None

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, private_key: str, **kwargs):
        super().__init__(client=ArcCommerce(private_key=private_key), **kwargs)

    def _run(self, pipeline_id: int) -> str:
        self.client.fund_stage(pipeline_id)
        return f"Pipeline #{pipeline_id} active stage funded."


class PipelineStatusInput(BaseModel):
    pipeline_id: int = Field(description="The pipeline ID to check")


class ArcPipelineStatus(BaseTool):
    name: str = "arc_pipeline_status"
    description: str = "Get the current status of a pipeline including all stage statuses and budget details."
    args_schema: type = PipelineStatusInput
    client: ArcCommerce = None

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, rpc_url: str = None, **kwargs):
        super().__init__(client=ArcCommerce(rpc_url=rpc_url), **kwargs)

    def _run(self, pipeline_id: int) -> str:
        pipeline = self.client.get_pipeline(pipeline_id)
        stages = self.client.get_stages(pipeline_id)
        lines = [f"Pipeline #{pipeline_id}: {pipeline.status.name}"]
        lines.append(f"Budget: {pipeline.total_budget_usdc} USDC ({pipeline.total_spent / 1e6} spent)")
        for i, s in enumerate(stages):
            lines.append(f"  Stage {i}: {s.status.name} — Job #{s.job_id} — {s.budget_usdc} USDC")
        return "\n".join(lines)
