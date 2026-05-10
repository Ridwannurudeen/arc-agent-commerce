import { createConfig } from "ponder";
import PipelineOrchestratorAbi from "./abis/PipelineOrchestrator.json" with { type: "json" };
import CommerceHookAbi from "./abis/CommerceHook.json" with { type: "json" };

const ARC_TESTNET = {
  id: 5042002,
  rpc: process.env.PONDER_RPC_URL_5042002 ?? "https://rpc.testnet.arc.network",
};

const ORCHESTRATOR = "0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7" as const;
const HOOK = "0x792170848bEcFf0B90c5095E58c08F35F5efB72c" as const;
const START_BLOCK = 41171293;

export default createConfig({
  chains: {
    arcTestnet: ARC_TESTNET,
  },
  contracts: {
    PipelineOrchestrator: {
      chain: "arcTestnet",
      abi: PipelineOrchestratorAbi as readonly unknown[],
      address: ORCHESTRATOR,
      startBlock: START_BLOCK,
    },
    CommerceHook: {
      chain: "arcTestnet",
      abi: CommerceHookAbi as readonly unknown[],
      address: HOOK,
      startBlock: START_BLOCK,
    },
  },
});
