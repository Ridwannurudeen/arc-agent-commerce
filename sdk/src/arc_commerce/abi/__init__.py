import json
from pathlib import Path

_dir = Path(__file__).parent

SERVICE_MARKET_ABI = json.loads((_dir / "ServiceMarket.json").read_text())
SERVICE_ESCROW_ABI = json.loads((_dir / "ServiceEscrow.json").read_text())
SPENDING_POLICY_ABI = json.loads((_dir / "spending_policy.json").read_text())
IDENTITY_REGISTRY_ABI = json.loads((_dir / "identity_registry.json").read_text())
PIPELINE_ORCHESTRATOR_ABI = json.loads((_dir / "PipelineOrchestrator.json").read_text())
COMMERCE_HOOK_ABI = json.loads((_dir / "CommerceHook.json").read_text())
STREAM_ESCROW_ABI = json.loads((_dir / "StreamEscrow.json").read_text())

ERC20_ABI = [
    {
        "type": "function",
        "name": "approve",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"type": "bool"}],
        "stateMutability": "nonpayable",
    },
    {
        "type": "function",
        "name": "balanceOf",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "allowance",
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
    },
]
