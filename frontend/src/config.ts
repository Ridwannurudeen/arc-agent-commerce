import { defineChain } from "viem";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network", {
      timeout: 15_000,
      retryCount: 3,
      retryDelay: 1000,
    }),
  },
});

// Contract addresses — configurable via env vars with testnet defaults
export const CONTRACTS = {
  USDC: (process.env.NEXT_PUBLIC_USDC ?? "0x3600000000000000000000000000000000000000") as `0x${string}`,
  IDENTITY_REGISTRY: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY ?? "0x8004A818BFB912233c491871b3d84c89A494BD9e") as `0x${string}`,
  REPUTATION_REGISTRY: (process.env.NEXT_PUBLIC_REPUTATION_REGISTRY ?? "0x8004B663056A597Dffe9eCcC1965A193B7388713") as `0x${string}`,
  SERVICE_MARKET: (process.env.NEXT_PUBLIC_SERVICE_MARKET ?? "0x046e44E2DE09D2892eCeC4200bB3ecD298892f88") as `0x${string}`,
  SERVICE_ESCROW: (process.env.NEXT_PUBLIC_SERVICE_ESCROW ?? "0x365889e057a3ddABADB542e19f8199650B4df4Cf") as `0x${string}`,
  SPENDING_POLICY: (process.env.NEXT_PUBLIC_SPENDING_POLICY ?? "0x072bFf95A62Ef1109dBE0122f734D6bC649E2634") as `0x${string}`,
  // V3 pipeline contracts
  PIPELINE_ORCHESTRATOR: (process.env.NEXT_PUBLIC_PIPELINE_ORCHESTRATOR ?? "0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720") as `0x${string}`,
  COMMERCE_HOOK: (process.env.NEXT_PUBLIC_COMMERCE_HOOK ?? "0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f") as `0x${string}`,
  AGENT_POLICY: (process.env.NEXT_PUBLIC_AGENT_POLICY ?? "0xB172b27Af9E084D574817b080C04a7629c606c0E") as `0x${string}`,
  // ERC-8183 (Arc native)
  AGENTIC_COMMERCE: (process.env.NEXT_PUBLIC_AGENTIC_COMMERCE ?? "0x0747EEf0706327138c69792bF28Cd525089e4583") as `0x${string}`,
  // Additional tokens
  EURC: (process.env.NEXT_PUBLIC_EURC ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`,
} as const;
