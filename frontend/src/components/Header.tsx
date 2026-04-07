"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { arcTestnet } from "@/config";
import { useTheme } from "@/context/ThemeContext";
import { MobileSidebarToggle } from "@/components/Sidebar";
import { Droplets } from "lucide-react";

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { address, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const usdcBalance = useUsdcBalance();
  const { theme, toggleTheme } = useTheme();

  const isWrongChain = isConnected && chain?.id !== arcTestnet.id;

  return (
    <header className="header-glass">
      <div className="header-left">
        {onMenuToggle && <MobileSidebarToggle onClick={onMenuToggle} />}
        <h1 className="header-title">
          <span className="header-title-primary">Agent Commerce</span>{" "}
          <span className="header-title-accent">Protocol</span>
        </h1>
      </div>

      <div className="header-right">
        <button
          className="btn btn-outline btn-sm"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{ minWidth: "2rem", padding: "0.35rem 0.5rem" }}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>

        <span className="network-badge">
          <span className="network-dot" />
          Arc Testnet
        </span>

        {isConnected ? (
          <div className="flex-row">
            {isWrongChain ? (
              <button
                className="btn btn-sm"
                style={{ background: "var(--red)" }}
                onClick={() => switchChain({ chainId: arcTestnet.id })}
              >
                Switch to Arc Testnet
              </button>
            ) : (
              <>
                {usdcBalance !== null && (
                  <span className="usdc-pill">{usdcBalance} USDC</span>
                )}
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                  title="Get testnet USDC from Circle Faucet"
                  style={{ display: "flex", alignItems: "center", gap: "0.3rem", textDecoration: "none" }}
                >
                  <Droplets size={13} /> Faucet
                </a>
                <span className="header-addr">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </>
            )}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => disconnect()}
            >
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
