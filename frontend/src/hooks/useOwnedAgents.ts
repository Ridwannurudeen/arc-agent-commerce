"use client";

import { useEffect, useState } from "react";

type State = {
  agentIds: number[];
  isLoading: boolean;
  error: string | null;
};

const initial: State = { agentIds: [], isLoading: false, error: null };

/**
 * Fetches the list of IdentityRegistry token IDs currently owned by `address`.
 * Backed by /api/agents/by-owner/[address] which scans Transfer events and
 * verifies ownership via ownerOf. Returns an empty list when the address is
 * unset or owns no agents.
 */
export function useOwnedAgents(address: string | undefined): State & { refetch: () => void } {
  const [state, setState] = useState<State>(initial);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!address) {
      setState(initial);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    fetch(`/api/agents/by-owner/${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.agentIds)) {
          setState({ agentIds: data.agentIds, isLoading: false, error: null });
        } else {
          setState({ agentIds: [], isLoading: false, error: data?.error ?? "Unknown response" });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ agentIds: [], isLoading: false, error: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [address, tick]);

  return { ...state, refetch: () => setTick((t) => t + 1) };
}
