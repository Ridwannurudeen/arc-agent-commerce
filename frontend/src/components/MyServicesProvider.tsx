"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { capabilityName } from "@/lib/constants";
import { formatUnits } from "viem";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";

type Props = {
  onViewAgent: (agentId: number) => void;
};

export function MyServicesProvider({ onViewAgent }: Props) {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
  });

  const serviceCount = Number(nextId ?? 0);

  const { data: servicesRaw, isLoading, refetch } = useReadContracts({
    contracts: Array.from({ length: serviceCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_MARKET as `0x${string}`,
      abi: ServiceMarketABI as any,
      functionName: "getService",
      args: [BigInt(i)],
    })),
    query: { enabled: serviceCount > 0 },
  });

  const myServices = useMemo(() => {
    if (!servicesRaw || !address) return [];
    return servicesRaw
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const d = r.result as any[];
        return {
          serviceId: i,
          agentId: Number(d[0]),
          provider: d[1] as string,
          capabilityHash: d[2] as string,
          pricePerTask: BigInt(d[3]),
          metadataURI: d[4] as string,
          active: d[5] as boolean,
        };
      })
      .filter(
        (s): s is NonNullable<typeof s> =>
          s !== null && s.provider.toLowerCase() === address.toLowerCase()
      );
  }, [servicesRaw, address]);

  // Delist action
  const { writeContract: delistService, data: delistHash, error: delistError, reset: resetDelist } = useWriteContract();
  const { isSuccess: delistSuccess } = useWaitForTransactionReceipt({ hash: delistHash });

  useEffect(() => {
    if (delistSuccess) {
      addToast("Service delisted", "success", delistHash);
      refetch();
    }
  }, [delistSuccess]);

  useEffect(() => {
    if (delistError) {
      addToast(parseContractError(delistError), "error");
      resetDelist();
    }
  }, [delistError]);

  // Update price
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const { writeContract: updateService, data: updateHash, error: updateError, reset: resetUpdate } = useWriteContract();
  const { isSuccess: updateSuccess } = useWaitForTransactionReceipt({ hash: updateHash });

  useEffect(() => {
    if (updateSuccess) {
      addToast("Price updated", "success", updateHash);
      setEditingId(null);
      setNewPrice("");
      refetch();
    }
  }, [updateSuccess]);

  useEffect(() => {
    if (updateError) {
      addToast(parseContractError(updateError), "error");
      resetUpdate();
    }
  }, [updateError]);

  if (!isConnected) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
        <p style={{ color: "var(--text-dim)" }}>Connect your wallet to view your services.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1.5rem" }}>My Services</h2>

      {isLoading && <Skeleton />}

      {!isLoading && myServices.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-dim)" }}>No services listed yet. Register an agent and list your first service.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {myServices.map((s) => (
          <div
            key={s.serviceId}
            className={`card${!s.active ? " delisted" : ""}`}
            style={{ padding: "1rem 1.25rem" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                  <button className="agent-link" onClick={() => onViewAgent(s.agentId)} style={{ fontWeight: 600, background: "none", border: "none", padding: 0 }}>
                    Agent #{s.agentId}
                  </button>
                  <span className="status active" style={{ fontSize: "0.75rem" }}>
                    {capabilityName(s.capabilityHash)}
                  </span>
                  {!s.active && (
                    <span className="status expired" style={{ fontSize: "0.75rem" }}>Delisted</span>
                  )}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  Service #{s.serviceId}
                  {s.metadataURI && <> &middot; {s.metadataURI}</>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 600 }}>{formatUnits(s.pricePerTask, 6)} USDC</span>
                {s.active && (
                  <>
                    <button
                      className="btn-sm btn-outline"
                      onClick={() => {
                        setEditingId(editingId === s.serviceId ? null : s.serviceId);
                        setNewPrice(formatUnits(s.pricePerTask, 6));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-sm"
                      style={{ background: "var(--red)", color: "#fff" }}
                      onClick={() => {
                        delistService({
                          address: CONTRACTS.SERVICE_MARKET,
                          abi: ServiceMarketABI,
                          functionName: "delistService",
                          args: [BigInt(s.serviceId)],
                        });
                      }}
                    >
                      Delist
                    </button>
                  </>
                )}
              </div>
            </div>

            {editingId === s.serviceId && (
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="number"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  style={{
                    padding: "0.4rem 0.6rem",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--text)",
                    fontSize: "0.85rem",
                    width: "120px",
                  }}
                />
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>USDC</span>
                <button
                  className="btn-sm"
                  onClick={() => {
                    updateService({
                      address: CONTRACTS.SERVICE_MARKET,
                      abi: ServiceMarketABI,
                      functionName: "updateService",
                      args: [BigInt(s.serviceId), BigInt(Math.round(Number(newPrice) * 1_000_000)), s.metadataURI],
                    });
                  }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
