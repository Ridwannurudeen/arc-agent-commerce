import os

ARC_TESTNET_RPC = "https://rpc.testnet.arc.network"
ARC_TESTNET_CHAIN_ID = 5042002

# Deployed contract addresses (Arc Testnet)
USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
SERVICE_MARKET_ADDRESS = "0x5dC727FF8Cb7Ada3AA09365C435637c5E3ACAF2E"
SERVICE_ESCROW_ADDRESS = "0x2b44D1e0885D36C21d36E8a1B406012430c4174e"
SPENDING_POLICY_ADDRESS = "0xC8a5658Bef5eE6dBEF67DFA71180f1773E3Df42e"
IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
REPUTATION_REGISTRY_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713"

# Network configurations
NETWORKS = {
    "testnet": {
        "rpc": "https://rpc.testnet.arc.network",
        "chain_id": 5042002,
        "usdc": "0x3600000000000000000000000000000000000000",
        "identity_registry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
        "reputation_registry": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
        "service_market": "0x5dC727FF8Cb7Ada3AA09365C435637c5E3ACAF2E",
        "service_escrow": "0x2b44D1e0885D36C21d36E8a1B406012430c4174e",
        "spending_policy": "0xC8a5658Bef5eE6dBEF67DFA71180f1773E3Df42e",
    },
}


def get_network_config(network: str = None) -> dict:
    """Get network configuration by name.

    Falls back to ARC_NETWORK env var, then 'testnet'.
    RPC URL can be overridden via ARC_RPC_URL env var.
    """
    network = network or os.environ.get("ARC_NETWORK", "testnet")
    if network not in NETWORKS:
        raise ValueError(f"Unknown network: {network}. Available: {list(NETWORKS.keys())}")
    config = NETWORKS[network].copy()
    # Allow RPC override from env
    rpc_override = os.environ.get("ARC_RPC_URL")
    if rpc_override:
        config["rpc"] = rpc_override
    return config
