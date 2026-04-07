"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, arcTestnet } from "@/config";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import { capabilityName } from "@/lib/constants";
import { formatUnits, parseUnits } from "viem";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";
import { parseContractError } from "@/lib/errors";
import { motion } from "framer-motion";
import { ShoppingBag, Edit3, Trash2, Save, Wallet, PackageSearch, CircleDollarSign } from "lucide-react";

type Props = {
  onViewAgent: (agentId: number) => void;
};

function agentColor(id: number): string {
  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
  return colors[id % colors.length];
}

export function MyServicesProvider({ onViewAgent }: Props) {
  const { address, isConnected } = useAccount();
  const { addToast } = useToast();

  const { data: nextId } = useReadContract({
    address: CONTRACTS.SERVICE_MARKET,
    abi: ServiceMarketABI,
    functionName: "nextServiceId",
    chainId: arcTestnet.id,
  });

  const serviceCount = Number(nextId ?? 0);

  const { data: servicesRaw, isLoading, refetch } = useReadContracts({
    contracts: Array.from({ length: serviceCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_MARKET as `0x${string}`,
      abi: ServiceMarketABI as any,
      functionName: "getService",
      args: [BigInt(i)],
      chainId: arcTestnet.id,
    })),
    query: { enabled: serviceCount > 0 },
  });

  const myServices = useMemo(() => {
    if (!servicesRaw || !address) return [];
    return servicesRaw
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const d = r.result as any[];
        if (!d || !d[1]) return null;
        return {
          serviceId: i,
          agentId: Number(d[0] ?? 0),
          provider: ((d[1] ?? "") as string) || "",
          capabilityHash: ((d[2] ?? "") as string) || "",
          pricePerTask: BigInt(d[3] ?? 0),
          metadataURI: ((d[4] ?? "") as string) || "",
          active: !!d[5],
        };
      })
      .filter(
        (s): s is NonNullable<typeof s> =>
          s !== null && !!s.provider && s.provider.toLowerCase() === address!.toLowerCase()
      );
  }, [servicesRaw, address]);

  // Delist action
  const { writeContract: delistService, data: delistHash, error: delistError, reset: resetDelist } = useWriteContract();
  const { isSuccess: delistSuccess } = useWaitForTransactionReceipt({ hash: delistHash });

  useEffect(() => {
    if (delistSuccess) { addToast("Service delisted", "success", delistHash); refetch(); }
  }, [delistSuccess]);

  useEffect(() => {
    if (delistError) { addToast(parseContractError(delistError), "error"); resetDelist(); }
  }, [delistError]);

  // Update price
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const { writeContract: updateService, data: updateHash, error: updateError, reset: resetUpdate } = useWriteContract();
  const { isSuccess: updateSuccess } = useWaitForTransactionReceipt({ hash: updateHash });

  useEffect(() => {
    if (updateSuccess) { addToast("Price updated", "success", updateHash); setEditingId(null); setNewPrice(""); refetch(); }
  }, [updateSuccess]);

  useEffect(() => {
    if (updateError) { addToast(parseContractError(updateError), "error"); resetUpdate(); }
  }, [updateError]);

  if (!isConnected) {
    return (
      <div className="empty-state">
        <Wallet size={40} className="empty-icon" />
        <p>Connect your wallet to view your services.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2>My Services</h2>
        <p className="section-subtitle">{myServices.length} service{myServices.length !== 1 ? "s" : ""} listed</p>
      </div>

      {isLoading && <Skeleton />}

      {!isLoading && myServices.length === 0 && (
        <div className="empty-state">
          <PackageSearch size={40} className="empty-icon" />
          <p>No services listed yet</p>
          <p className="secondary">Register an agent and list your first service</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {myServices.map((s, idx) => (
          <motion.div
            key={s.serviceId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: idx * 0.03 }}
            className={`glass-card ${!s.active ? "delisted" : ""}`}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                <div
                  className="agent-avatar"
                  style={{ background: agentColor(s.agentId), width: 36, height: 36, minWidth: 36, fontSize: "0.65rem" }}
                >
                  A{s.agentId}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.15rem" }}>
                    <button className="agent-link" onClick={() => onViewAgent(s.agentId)} style={{ fontWeight: 700, background: "none", border: "none", padding: 0, fontSize: "0.9rem" }}>
                      Agent #{s.agentId}
                    </button>
                    <span className="pill pill-blue">{capabilityName(s.capabilityHash)}</span>
                    {!s.active && <span className="pill pill-red">Delisted</span>}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                    Service #{s.serviceId}
                    {s.metadataURI && <> &middot; {s.metadataURI}</>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                <span className="price-pill">{formatUnits(s.pricePerTask, 6)} USDC</span>
                {s.active && (
                  <>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setEditingId(editingId === s.serviceId ? null : s.serviceId);
                        setNewPrice(formatUnits(s.pricePerTask, 6));
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    <button
                      className="btn-danger"
                      style={{ padding: "0.35rem 0.65rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                      onClick={() => {
                        delistService({
                          address: CONTRACTS.SERVICE_MARKET,
                          abi: ServiceMarketABI,
                          functionName: "delistService",
                          args: [BigInt(s.serviceId)],
                          chainId: arcTestnet.id,
                        });
                      }}
                    >
                      <Trash2 size={12} /> Delist
                    </button>
                  </>
                )}
              </div>
            </div>

            {editingId === s.serviceId && (
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.75rem", background: "rgba(18,18,26,0.3)", borderRadius: "8px" }}>
                <CircleDollarSign size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                <input
                  className="glass-input"
                  type="number"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  style={{ width: "120px", padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                />
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>USDC</span>
                <button
                  className="btn-primary"
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => {
                    updateService({
                      address: CONTRACTS.SERVICE_MARKET,
                      abi: ServiceMarketABI,
                      functionName: "updateService",
                      args: [BigInt(s.serviceId), parseUnits(newPrice, 6), s.metadataURI],
                      chainId: arcTestnet.id,
                    });
                  }}
                >
                  <Save size={12} /> Save
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
