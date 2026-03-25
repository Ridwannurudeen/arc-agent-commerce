"""Example: Use Agent Commerce as a LangChain tool."""

import os
from arc_commerce import ArcCommerce

# This shows how an AI agent framework can integrate with Agent Commerce.
# Wrap the SDK methods as tools your agent can call.

client = ArcCommerce(private_key=os.environ["ARC_PRIVATE_KEY"])


def find_service_tool(capability: str) -> str:
    """LangChain-compatible tool: find services by capability."""
    services = client.find_services(capability)
    if not services:
        return f"No services found for '{capability}'"
    lines = []
    for s in services:
        lines.append(
            f"Service #{s.service_id}: Agent #{s.agent_id}, "
            f"{s.price_usdc} USDC, {s.metadata_uri}"
        )
    return "\n".join(lines)


def hire_agent_tool(capability: str, amount_usdc: float, task: str) -> str:
    """LangChain-compatible tool: hire an agent for a task."""
    service, agreement_id = client.hire(
        capability=capability,
        amount_usdc=amount_usdc,
        task_description=task,
    )
    return (
        f"Hired Agent #{service.agent_id} for {amount_usdc} USDC. "
        f"Agreement #{agreement_id}."
    )


def confirm_tool(agreement_id: int) -> str:
    """LangChain-compatible tool: confirm task completion."""
    client.confirm_completion(agreement_id)
    return f"Agreement #{agreement_id} completed. Funds released."


# Usage with LangChain:
#
# from langchain.tools import Tool
#
# tools = [
#     Tool(name="find_service", func=find_service_tool, description="Find AI agent services by capability"),
#     Tool(name="hire_agent", func=hire_agent_tool, description="Hire an AI agent and escrow USDC payment"),
#     Tool(name="confirm_completion", func=confirm_tool, description="Confirm task done, release payment"),
# ]
