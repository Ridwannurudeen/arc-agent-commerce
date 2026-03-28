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
} as const;
