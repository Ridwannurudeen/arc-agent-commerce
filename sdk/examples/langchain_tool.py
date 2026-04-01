"""Example: Use Agent Commerce Pipeline as LangChain tools."""

import os

# --- Option 1: BaseTool classes (recommended) ---
# from arc_commerce.langchain import ArcPipelineTool, ArcApproveStage, ArcPipelineStatus
#
# tools = [
#     ArcPipelineTool(private_key=os.environ["ARC_PRIVATE_KEY"]),
#     ArcApproveStage(private_key=os.environ["ARC_PRIVATE_KEY"]),
#     ArcPipelineStatus(),
# ]

# --- Option 2: Function-based (quick integration) ---
from arc_commerce import ArcCommerce

client = ArcCommerce(private_key=os.environ.get("ARC_PRIVATE_KEY"))


def create_pipeline_tool(client_agent_id: int, stages: list[dict], currency: str = "USDC", deadline_hours: int = 24) -> str:
    """LangChain-compatible tool: create a multi-stage agent pipeline."""
    pipeline_id = client.create_pipeline(
        client_agent_id=client_agent_id,
        stages=stages,
        currency=currency,
        deadline_hours=deadline_hours,
    )
    pipeline = client.get_pipeline(pipeline_id)
    return f"Pipeline #{pipeline_id} created: {pipeline.stage_count} stages, {pipeline.total_budget_usdc} {currency}"


def approve_stage_tool(job_id: int) -> str:
    """LangChain-compatible tool: approve a completed stage."""
    client.approve_stage(job_id)
    return f"Stage (job #{job_id}) approved."


def pipeline_status_tool(pipeline_id: int) -> str:
    """LangChain-compatible tool: get pipeline status."""
    pipeline = client.get_pipeline(pipeline_id)
    stages = client.get_stages(pipeline_id)
    lines = [f"Pipeline #{pipeline_id}: {pipeline.status.name}"]
    for i, s in enumerate(stages):
        lines.append(f"  Stage {i}: {s.status.name} — {s.budget_usdc} USDC")
    return "\n".join(lines)


# Usage with LangChain:
#
# from langchain.tools import Tool
#
# tools = [
#     Tool(name="create_pipeline", func=create_pipeline_tool, description="Create multi-stage agent workflow with escrowed USDC"),
#     Tool(name="approve_stage", func=approve_stage_tool, description="Approve a completed pipeline stage"),
#     Tool(name="pipeline_status", func=pipeline_status_tool, description="Get pipeline status and stage details"),
# ]
