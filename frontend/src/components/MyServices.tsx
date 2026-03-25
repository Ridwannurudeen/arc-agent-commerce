"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { capabilityName } from "@/lib/constants";
import type { ServiceData } from "@/lib/types";

function MyServiceCard({ serviceId }: { serviceId: number }) {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [newMetadata, setNewMetadata] = useState("");

  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as unknown as ServiceData;

  return (
    <div className={`service-item ${!svc.active ? "delisted" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="info">
          <h4>
            {capabilityName(svc.capabilityHash)}
            {!svc.active && <span className="status expired" style={{ marginLeft: "0.5rem" }}>DELISTED</span>}
          </h4>
          <div className="meta">
            Service #{serviceId} &middot; Agent #{svc.agentId.toString()}
          </div>
          <div className="meta" style={{ marginTop: "0.25rem" }}>
            {svc.metadataURI}
          </div>
        </div>
        <div className="price">{formatUnits(svc.pricePerTask, 6)} USDC</div>
      </div>

      {svc.active && !editing && (
        <div className="actions">
          <button className="btn btn-sm" onClick={() => {
            setEditing(true);
            setNewPrice(formatUnits(svc.pricePerTask, 6));
            setNewMetadata(svc.metadataURI);
          }}>
            Edit
          </button>
          <button
            className="btn btn-outline btn-sm"
            style={{ borderColor: "var(--red)", color: "var(--red)" }}
            disabled={isLoading}
            onClick={() =>
              writeContract({
                address: CONTRACTS.SERVICE_MARKET,
                abi: ServiceMarketABI,
                functionName: "delistService",
                args: [BigInt(serviceId)],
                chainId: arcTestnet.id,
              })
            }
          >
            {isLoading ? "Delisting..." : "Delist"}
          </button>
        </div>
      )}

      {editing && (
        <div style={{ marginTop: "0.75rem" }}>
          <div className="form-group">
            <label>New Price (USDC)</label>
            <input
              type="text"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>New Metadata URI</label>
            <input
              type="text"
              value={newMetadata}
              onChange={(e) => setNewMetadata(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              className="btn btn-sm"
              disabled={isLoading}
              onClick={() => {
                writeContract({
                  address: CONTRACTS.SERVICE_MARKET,
                  abi: ServiceMarketABI,
                  functionName: "updateService",
                  args: [BigInt(serviceId), parseUnits(newPrice, 6), newMetadata],
                  chainId: arcTestnet.id,
                });
                setEditing(false);
              }}
            >
              {isLoading ? "Updating..." : "Save"}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isSuccess && (
        <div style={{ marginTop: "0.5rem", color: "var(--green)", fontSize: "0.8rem" }}>
          Updated!
        </div>
      )}
    </div>
  );
}

export function MyServices() {
  const { address } = useAccount();

  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const count = Number(nextId ?? 0);

  if (!address) {
    return <div className="empty">Connect wallet to view your services.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "1rem" }}>
        Services where you are the provider
      </div>
      <div className="service-list">
        {Array.from({ length: count }, (_, i) => (
          <MyServiceCardFilter key={i} serviceId={i} ownerAddress={address} />
        ))}
      </div>
    </div>
  );
}

function MyServiceCardFilter({ serviceId, ownerAddress }: { serviceId: number; ownerAddress: string }) {
  const { data } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "getService",
    args: [BigInt(serviceId)],
    chainId: arcTestnet.id,
  });

  if (!data) return null;
  const svc = data as unknown as ServiceData;
  if (svc.provider.toLowerCase() !== ownerAddress.toLowerCase()) return null;

  return <MyServiceCard serviceId={serviceId} />;
}
