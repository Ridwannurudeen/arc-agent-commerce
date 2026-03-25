"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const usdcBalance = useUsdcBalance();

  return (
    <header>
      <h1>
        Agent Commerce <span>Protocol</span>
      </h1>
      <div className="flex-row">
        <span className="addr" style={{ fontSize: "0.7rem" }}>
          Arc Testnet
        </span>
        {isConnected ? (
          <div className="flex-row">
            {usdcBalance !== null && (
              <span className="usdc-balance">{usdcBalance} USDC</span>
            )}
            <span className="addr">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button className="btn btn-outline btn-sm" onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        ) : (
          <button
            className="connect-btn"
            onClick={() => connect({ connector: injected() })}
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
