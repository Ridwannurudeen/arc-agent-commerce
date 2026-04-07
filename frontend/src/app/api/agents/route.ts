import { client, CONTRACTS, jsonResponse, errorResponse, CORS_HEADERS, batchRead } from "@/lib/viemClient";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import ServiceMarketABI from "@/abi/ServiceMarket.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

    // Discover agent IDs from listed services (IdentityRegistry has no totalSupply)
    const nextServiceId = await client.readContract({
      address: CONTRACTS.SERVICE_MARKET,
      abi: ServiceMarketABI,
      functionName: "nextServiceId",
    }) as bigint;

    const serviceCount = Number(nextServiceId);
    const agentIdSet = new Set<number>();

    if (serviceCount > 0) {
      const serviceCalls = Array.from({ length: serviceCount }, (_, i) => ({
        address: CONTRACTS.SERVICE_MARKET,
        abi: ServiceMarketABI as any,
        functionName: "getService" as const,
        args: [BigInt(i)],
      }));

      const serviceResults = await batchRead(serviceCalls);
      for (const r of serviceResults) {
        if (r.status !== "success" || !r.result) continue;
        const d = r.result as any;
        const agentId = Number(d.agentId ?? d[0] ?? 0);
        if (agentId > 0) agentIdSet.add(agentId);
      }
    }

    const allIds = [...agentIdSet].sort((a, b) => b - a);
    const totalAgents = allIds.length;

    if (totalAgents === 0) {
      return jsonResponse({ agents: [], total: 0, page, limit, totalPages: 0 });
    }

    // Paginate
    const startIdx = (page - 1) * limit;
    const pageIds = allIds.slice(startIdx, startIdx + limit);

    if (pageIds.length === 0) {
      return jsonResponse({ agents: [], total: totalAgents, page, limit, totalPages: Math.ceil(totalAgents / limit) });
    }

    // Fetch owner + tokenURI for each agent
    const ownerCalls = pageIds.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: IdentityRegistryABI as any,
      functionName: "ownerOf" as const,
      args: [BigInt(id)],
    }));

    const uriCalls = pageIds.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: IdentityRegistryABI as any,
      functionName: "tokenURI" as const,
      args: [BigInt(id)],
    }));

    const [ownerResults, uriResults] = await Promise.all([
      batchRead(ownerCalls),
      batchRead(uriCalls),
    ]);

    const agents = pageIds
      .map((id, i) => {
        if (ownerResults[i]?.status !== "success") return null;
        return {
          agentId: id,
          owner: ownerResults[i].result as string,
          metadataUri: uriResults[i]?.status === "success" ? (uriResults[i].result as string) : "",
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    return jsonResponse({
      agents,
      total: totalAgents,
      page,
      limit,
      totalPages: Math.ceil(totalAgents / limit),
    });
  } catch (err) {
    console.error("GET /api/agents error:", err);
    return errorResponse("Failed to fetch agents");
  }
}
