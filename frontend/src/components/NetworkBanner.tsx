"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { arcTestnet } from "@/config";

export function NetworkBanner() {
  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || chain?.id === arcTestnet.id) return null;

  return (
    <div
      style={{
        background: "var(--red)",
        color: "#fff",
        padding: "0.6rem 1rem",
        textAlign: "center",
        fontSize: "0.85rem",
        fontWeight: 600,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <span>You are connected to {chain?.name ?? "an unsupported network"}. This app requires Arc Testnet.</span>
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        style={{
          background: "#fff",
          color: "var(--red)",
          border: "none",
          borderRadius: "4px",
          padding: "0.3rem 0.75rem",
          fontSize: "0.8rem",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Switch Network
      </button>
    </div>
  );
}
