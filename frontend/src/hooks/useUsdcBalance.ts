import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import USDCABI from "@/abi/USDC.json";

export function useUsdcBalance(): string | null {
  const { address } = useAccount();

  const { data } = useReadContract({
    address: CONTRACTS.USDC,
    abi: USDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  return formatUnits(data as bigint, 6);
}
