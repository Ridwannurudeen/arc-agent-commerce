import os

ARC_TESTNET_RPC = "https://rpc.testnet.arc.network"
ARC_TESTNET_CHAIN_ID = 5042002

# Deployed contract addresses (Arc Testnet)
USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
SERVICE_MARKET_ADDRESS = "0x046e44E2DE09D2892eCeC4200bB3ecD298892f88"
SERVICE_ESCROW_ADDRESS = "0x365889e057a3ddABADB542e19f8199650B4df4Cf"
SPENDING_POLICY_ADDRESS = "0x072bFf95A62Ef1109dBE0122f734D6bC649E2634"
IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
REPUTATION_REGISTRY_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713"

# V3 contracts (Arc Testnet)
PIPELINE_ORCHESTRATOR_ADDRESS = "0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7"
COMMERCE_HOOK_ADDRESS = "0x792170848bEcFf0B90c5095E58c08F35F5efB72c"

# ERC-8183 (Arc native)
AGENTIC_COMMERCE_ADDRESS = "0x0747EEf0706327138c69792bF28Cd525089e4583"

# V4 contracts (Arc Testnet)
STREAM_ESCROW_ADDRESS = "0x1501566F49290d5701546D7De837Cb516c121Fb6"

# Additional tokens
EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"

# Network configurations
NETWORKS = {
    "testnet": {
        "rpc": "https://rpc.testnet.arc.network",
        "chain_id": 5042002,
        "usdc": "0x3600000000000000000000000000000000000000",
        "identity_registry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
        "reputation_registry": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
        "service_market": "0x046e44E2DE09D2892eCeC4200bB3ecD298892f88",
        "service_escrow": "0x365889e057a3ddABADB542e19f8199650B4df4Cf",
        "spending_policy": "0x072bFf95A62Ef1109dBE0122f734D6bC649E2634",
        "pipeline_orchestrator": "0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7",
        "commerce_hook": "0x792170848bEcFf0B90c5095E58c08F35F5efB72c",
        "agentic_commerce": "0x0747EEf0706327138c69792bF28Cd525089e4583",
        "eurc": "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        "stream_escrow": "0x1501566F49290d5701546D7De837Cb516c121Fb6"
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
