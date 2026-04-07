import { formatUnits } from "viem";
import { client, CONTRACTS, jsonResponse, errorResponse, CORS_HEADERS } from "@/lib/viemClient";
import { capabilityName } from "@/lib/constants";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const agentId = parseInt(idParam, 10);

    if (isNaN(agentId) || agentId < 1) {
      return errorResponse("Invalid agent ID", 400);
    }

    // Fetch agent identity
    let owner: string;
    let metadataUri: string;

    try {
      const [ownerResult, uriResult] = await Promise.all([
        client.readContract({
          address: CONTRACTS.IDENTITY_REGISTRY,
          abi: IdentityRegistryABI,
          functionName: "ownerOf",
          args: [BigInt(agentId)],
        }),
        client.readContract({
          address: CONTRACTS.IDENTITY_REGISTRY,
          abi: IdentityRegistryABI,
          functionName: "tokenURI",
          args: [BigInt(agentId)],
        }),
      ]);
      owner = ownerResult as string;
      metadataUri = uriResult as string;
    } catch {
      return errorResponse("Agent not found", 404);
    }

    // Fetch services for this agent
    let serviceIds: bigint[] = [];
    try {
      serviceIds = (await client.readContract({
        address: CONTRACTS.SERVICE_MARKET,
        abi: ServiceMarketABI,
        functionName: "getServicesByAgent",
        args: [BigInt(agentId)],
      })) as bigint[];
    } catch {
      // Agent may have no services
    }

    let services: any[] = [];
    if (serviceIds.length > 0) {
      const serviceCalls = serviceIds.map((sid) => ({
        address: CONTRACTS.SERVICE_MARKET,
        abi: ServiceMarketABI as any,
        functionName: "getService" as const,
        args: [sid],
      }));

      const serviceResults = await client.multicall({ contracts: serviceCalls });

      services = serviceResults
        .map((r, i) => {
          if (r.status !== "success" || !r.result) return null;
          const d = r.result as any;
          return {
            serviceId: Number(serviceIds[i]),
            capability: capabilityName((d.capabilityHash ?? d[2] ?? "") as string),
            capabilityHash: (d.capabilityHash ?? d[2] ?? "") as string,
            priceUsdc: parseFloat(formatUnits(BigInt(d.pricePerTask ?? d[3] ?? 0), 6)),
            metadataUri: (d.metadataURI ?? d[4] ?? "") as string,
            active: !!(d.active ?? d[5]),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
    }

    // Fetch job stats involving this agent's owner
    let jobsAsClient = 0;
    let jobsAsProvider = 0;
    let completedAsProvider = 0;

    try {
      const jobCounter = (await client.readContract({
        address: CONTRACTS.AGENTIC_COMMERCE,
        abi: AgenticCommerceABI as any,
        functionName: "jobCounter",
      })) as bigint;

      const jobCount = Number(jobCounter);

      if (jobCount > 0) {
        const jobCalls = Array.from({ length: jobCount }, (_, i) => ({
          address: CONTRACTS.AGENTIC_COMMERCE,
          abi: AgenticCommerceABI as any,
          functionName: "getJob" as const,
          args: [BigInt(i + 1)],
        }));

        const jobResults = await client.multicall({ contracts: jobCalls });
        const ownerLower = owner.toLowerCase();

        for (const r of jobResults) {
          if (r.status !== "success" || !r.result) continue;
          const j = r.result as any;
          const jobClient = ((j.client ?? j[1] ?? "") as string).toLowerCase();
          const jobProvider = ((j.provider ?? j[2] ?? "") as string).toLowerCase();
          const status = Number(j.status ?? j[7] ?? 0);

          if (jobClient === ownerLower) jobsAsClient++;
          if (jobProvider === ownerLower) {
            jobsAsProvider++;
            if (status === 3) completedAsProvider++;
          }
        }
      }
    } catch {
      // Stats unavailable
    }

    return jsonResponse({
      agentId,
      owner,
      metadataUri,
      services,
      stats: {
        totalServices: services.length,
        activeServices: services.filter((s) => s.active).length,
        jobsAsClient,
        jobsAsProvider,
        completedAsProvider,
        completionRate: jobsAsProvider > 0 ? Math.round((completedAsProvider / jobsAsProvider) * 100) : 0,
      },
    });
  } catch (err) {
    console.error("GET /api/agents/[id] error:", err);
    return errorResponse("Failed to fetch agent");
  }
}
