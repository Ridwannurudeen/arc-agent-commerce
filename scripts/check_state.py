#!/usr/bin/env python3
"""Check current marketplace state."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from arc_commerce.client import ArcCommerce

c = ArcCommerce(private_key=os.environ["PRIVATE_KEY"])

print("=== MARKETPLACE STATE ===\n")

total_svc = c.total_services()
print(f"Services: {total_svc}")
caps = {}
for i in range(total_svc):
    s = c.get_service(i)
    if s.active:
        cap = s.capability_hash.hex()[:8]
        caps[cap] = caps.get(cap, 0) + 1
        print(f"  #{i}: Agent #{s.agent_id} | {s.price_per_task/1e6:.0f} USDC | {s.metadata_uri[:50]}")
print(f"  Active across {len(caps)} capability categories\n")

next_pid = c.orchestrator.functions.nextPipelineId().call()
print(f"Pipelines: {next_pid}")
status_names = ["Active", "Completed", "Halted", "Cancelled"]
for i in range(next_pid):
    p = c.get_pipeline(i)
    stages = c.get_stages(i)
    print(f"  #{i}: {status_names[p.status]} | {p.stage_count} stages | ${p.total_budget/1e6:.2f} budget | ${p.total_spent/1e6:.2f} spent")

print(f"\nAgents:")
for aid in [933, 934, 935, 1156, 1157, 1158, 1159, 1160]:
    try:
        owner = c.identity.functions.ownerOf(aid).call()
        uri = c.identity.functions.tokenURI(aid).call()
        print(f"  #{aid}: {owner[:10]}... | {uri or '(no metadata)'}")
    except:
        pass

bal = c.usdc.functions.balanceOf(c.account.address).call()
print(f"\nDeployer USDC: ${bal/1e6:.2f}")
