import { defineChain, type Address } from 'viem';

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

export const DEFAULT_RPC = 'https://rpc.testnet.arc.network';

export const CONTRACTS = {
  SERVICE_MARKET: '0x046e44E2DE09D2892eCeC4200bB3ecD298892f88' as Address,
  PIPELINE_ORCHESTRATOR: '0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7' as Address,
  COMMERCE_HOOK: '0x792170848bEcFf0B90c5095E58c08F35F5efB72c' as Address,
  STREAM_ESCROW: '0x1501566F49290d5701546D7De837Cb516c121Fb6' as Address,
  USDC: '0x3600000000000000000000000000000000000000' as Address,
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as Address,
} as const;

/** Minimal ERC-20 ABI for approve + allowance */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
