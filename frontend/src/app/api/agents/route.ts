import IdentityRegistryABI from "@/abi/IdentityRegistry.json";

export const dynamic = "force-dynamic";

const totalSupplyAbi = [
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

    const totalSupply = await client.readContract({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: totalSupplyAbi,
      functionName: "totalSupply",
    }) as bigint;

    const totalAgents = Number(totalSupply);

    if (totalAgents === 0) {
      return jsonResponse({ agents: [], total: 0, page, limit, totalPages: 0 });
    }

    // Paginate from newest to oldest
    const startId = totalAgents - (page - 1) * limit;
    const endId = Math.max(1, startId - limit + 1);
    const ids = startId > 0
      ? Array.from({ length: Math.max(0, startId - endId + 1) }, (_, i) => startId - i)
      : [];

    if (ids.length === 0) {
      return jsonResponse({ agents: [], total: totalAgents, page, limit, totalPages: Math.ceil(totalAgents / limit) });
    }

    const ownerCalls = ids.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: IdentityRegistryABI as any,
      functionName: "ownerOf" as const,
      args: [BigInt(id)],
    }));

    const uriCalls = ids.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: IdentityRegistryABI as any,
      functionName: "tokenURI" as const,
      args: [BigInt(id)],
    }));

    const [ownerResults, uriResults] = await Promise.all([
      batchRead(ownerCalls),
      batchRead(uriCalls),
    ]);

    const agents = ids
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
