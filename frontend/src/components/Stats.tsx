"use client";

import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import ServiceEscrowABI from "@/abi/ServiceEscrow.json";

export function Stats() {
  const { data: nextServiceId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const { data: nextAgreementId } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "nextAgreementId",
    chainId: arcTestnet.id,
  });

  const { data: totalFees } = useReadContract({
    address: CONTRACTS.SERVICE_ESCROW,
    abi: ServiceEscrowABI,
    functionName: "totalFeesCollected",
    chainId: arcTestnet.id,
  });

  return (
    <div className="stats">
      <div className="stat-card">
        <div className="label">Services Listed</div>
        <div className="value">{nextServiceId?.toString() ?? "\u2014"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Agreements Created</div>
        <div className="value">{nextAgreementId?.toString() ?? "\u2014"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Protocol Fees (USDC)</div>
        <div className="value">
          {totalFees ? formatUnits(totalFees as bigint, 6) : "\u2014"}
        </div>
      </div>
      <div className="stat-card">
        <div className="label">Network</div>
        <div className="value" style={{ fontSize: "1rem" }}>
          Arc Testnet
        </div>
      </div>
    </div>
  );
}
