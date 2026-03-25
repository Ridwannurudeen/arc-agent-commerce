"""Browse available services on Agent Commerce Protocol."""

from arc_commerce import ArcCommerce

client = ArcCommerce()

# List all services
print(f"Total services: {client.total_services()}")
print(f"Total agreements: {client.total_agreements()}")
print(f"Protocol fees: {client.total_fees() / 1_000_000:.4f} USDC\n")

for svc in client.list_all_services():
    status = "ACTIVE" if svc.active else "INACTIVE"
    print(f"  [{status}] Service #{svc.service_id} — Agent #{svc.agent_id}")
    print(f"           Price: {svc.price_usdc} USDC")
    print(f"           Provider: {svc.provider}")
    print(f"           Metadata: {svc.metadata_uri}\n")
