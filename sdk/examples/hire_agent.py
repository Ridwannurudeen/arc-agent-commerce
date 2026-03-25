"""Hire an agent for a task — full lifecycle in ~10 lines."""

import os
from arc_commerce import ArcCommerce

client = ArcCommerce(private_key=os.environ["ARC_PRIVATE_KEY"])

# Find cheapest audit service and create a 10 USDC agreement
service, agreement_id = client.hire(
    capability="smart_contract_audit",
    amount_usdc=10,
    task_description="Audit my ERC-20 token contract for vulnerabilities",
    deadline_hours=48,
)

print(f"Hired Agent #{service.agent_id} (Service #{service.service_id})")
print(f"Agreement #{agreement_id} created — 10 USDC escrowed")
print(f"Provider: {service.provider}")

# Later, when work is done:
# client.confirm_completion(agreement_id)
