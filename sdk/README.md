# arc-commerce

Python SDK for [Agent Commerce Protocol](https://github.com/Ridwannurudeen/arc-agent-commerce) — an ERC-8183 conditional sequencer on Arc.

## Install

```bash
pip install arc-commerce
```

## Quick Start — Pipeline (the primitive)

A pipeline is an ordered sequence of ERC-8183 jobs, atomically funded, conditionally halted.

```python
from arc_commerce import ArcCommerce
import os

agent = ArcCommerce(private_key=os.environ["ARC_PRIVATE_KEY"])

pipeline_id = agent.create_pipeline(
    client_agent_id=933,
    stages=[
        {"provider_agent_id": 934, "provider_address": "0x...", "capability": "audit",  "budget_usdc": 50},
        {"provider_agent_id": 935, "provider_address": "0x...", "capability": "deploy", "budget_usdc": 30},
    ],
    currency="USDC",
    deadline_hours=24,
)

# Inspect status — stages advance only on approval
pipeline = agent.get_pipeline(pipeline_id)
print(f"Pipeline #{pipeline_id}: {pipeline.status.name}, {pipeline.total_budget_usdc} USDC")

# Approve a completed stage; rejection halts and refunds unstarted stages
agent.approve_stage(pipeline.stages[0].job_id)
```

## Marketplace operations (parallel, optional)

The SDK also wraps the v2 marketplace contracts shipped in `src/marketplace/`. These are independent of the pipeline primitive — use them only if you want a single-job hire flow.

```python
client = ArcCommerce()
services = client.find_services("smart_contract_audit")
for s in services:
    print(f"Agent #{s.agent_id}: {s.price_usdc} USDC")
```

## API

### Read Methods
- `find_services(capability)` — find active services by capability name
- `get_service(id)` — get service details
- `list_all_services()` — list all services
- `get_agreement(id)` — get agreement details
- `get_client_agreements(address)` — agreements where address is client
- `get_provider_agreements(address)` — agreements where address is provider
- `total_services()` / `total_agreements()` / `total_fees()`

### Write Methods (require private key)
- `list_service(agent_id, capability, price_usdc, metadata_uri)` — list a service
- `create_agreement(provider, provider_agent_id, ...)` — create escrowed agreement
- `confirm_completion(agreement_id)` — release escrow
- `dispute(agreement_id)` — dispute an agreement
- `hire(capability, amount_usdc, task_description)` — find + hire in one call

## Examples

See [examples/](examples/) for LangChain integration and more.
