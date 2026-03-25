import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";

export function useIsOwner(): boolean {
  const { address } = useAccount();

  const { data: owner } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "owner",
    chainId: arcTestnet.id,
  });

  if (!address || !owner) return false;
  return (owner as string).toLowerCase() === address.toLowerCase();
}
