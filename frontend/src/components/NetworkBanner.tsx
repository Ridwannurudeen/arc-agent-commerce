"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { arcTestnet } from "@/config";
import { AlertTriangle } from "lucide-react";

export function NetworkBanner() {
  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || chain?.id === arcTestnet.id) return null;

  return (
    <div className="network-banner-slim">
      <AlertTriangle size={14} />
      <span>Connected to {chain?.name ?? "unsupported network"} — Arc Testnet required</span>
      <button onClick={() => switchChain({ chainId: arcTestnet.id })}>
        Switch Network
      </button>
    </div>
  );
}
