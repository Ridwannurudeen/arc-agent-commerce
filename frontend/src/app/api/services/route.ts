import { client, CONTRACTS, jsonResponse, errorResponse, CORS_HEADERS, batchRead } from "@/lib/viemClient";
import { formatUnits } from "viem";
import { capabilityName } from "@/lib/constants";
import ServiceMarketABI from "@/abi/ServiceMarket.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") !== "false";
    const capability = searchParams.get("capability");
    const agentId = searchParams.get("agentId");

    const nextId = await client.readContract({
      address: CONTRACTS.SERVICE_MARKET,
      abi: ServiceMarketABI,
      functionName: "nextServiceId",
    }) as bigint;

    const serviceCount = Number(nextId);

    if (serviceCount === 0) {
      return jsonResponse({ services: [], total: 0 });
    }

    const calls = Array.from({ length: serviceCount }, (_, i) => ({
      address: CONTRACTS.SERVICE_MARKET,
      abi: ServiceMarketABI as any,
      functionName: "getService" as const,
      args: [BigInt(i)],
    }));

    const results = await batchRead(calls as any);

    let services = results
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const d = r.result as any;
        const svc = {
          serviceId: i,
          agentId: Number(d.agentId ?? d[0] ?? 0),
          provider: (d.provider ?? d[1] ?? "") as string,
          capabilityHash: (d.capabilityHash ?? d[2] ?? "") as string,
          capability: "",
          priceUsdc: 0,
          priceRaw: (d.pricePerTask ?? d[3] ?? "0").toString(),
          metadataUri: (d.metadataURI ?? d[4] ?? "") as string,
          active: !!(d.active ?? d[5]),
        };
        svc.capability = capabilityName(svc.capabilityHash);
        svc.priceUsdc = parseFloat(formatUnits(BigInt(svc.priceRaw), 6));
        return svc;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (activeOnly) {
      services = services.filter((s) => s.active);
    }

    if (capability) {
      const q = capability.toLowerCase();
      services = services.filter(
        (s) =>
          s.capability.toLowerCase().includes(q) ||
          s.capabilityHash.toLowerCase() === q
      );
    }

    if (agentId) {
      const id = parseInt(agentId, 10);
      services = services.filter((s) => s.agentId === id);
    }

    return jsonResponse({ services, total: services.length });
  } catch (err) {
    console.error("GET /api/services error:", err);
    return errorResponse("Failed to fetch services");
  }
}
