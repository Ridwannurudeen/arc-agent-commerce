import { client, CONTRACTS, jsonResponse, errorResponse, CORS_HEADERS, findMaxAgentId } from "@/lib/viemClient";
import ServiceMarketABI from "@/abi/ServiceMarket.json";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";
import StreamEscrowABI from "@/abi/StreamEscrow.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    // Fetch all counters in parallel. IdentityRegistry has no working
    // totalSupply(); use a binary-search probe of ownerOf instead.
    const [nextServiceId, totalAgents, jobCounter, nextPipelineId, streamCount] = await Promise.all([
      client.readContract({
        address: CONTRACTS.SERVICE_MARKET,
        abi: ServiceMarketABI,
        functionName: "nextServiceId",
      }).catch(() => BigInt(0)),
      findMaxAgentId().catch(() => 0),
      client.readContract({
        address: CONTRACTS.AGENTIC_COMMERCE,
        abi: AgenticCommerceABI as any,
        functionName: "jobCounter",
      }).catch(() => BigInt(0)),
      client.readContract({
        address: CONTRACTS.PIPELINE_ORCHESTRATOR,
        abi: PipelineOrchestratorABI,
        functionName: "nextPipelineId",
      }).catch(() => BigInt(0)),
      client.readContract({
        address: CONTRACTS.STREAM_ESCROW,
        abi: StreamEscrowABI as any,
        functionName: "streamCount",
      }).catch(() => BigInt(0)),
    ]);

    const totalJobs = Number(jobCounter as bigint);
    const totalServices = Number(nextServiceId as bigint);

    return jsonResponse({
      totalServices,
      totalAgents,
      totalJobs,
      totalPipelines: Number(nextPipelineId as bigint),
      totalStreams: Number(streamCount as bigint),
      network: "arc-testnet",
      chainId: 5042002,
      contracts: {
        identityRegistry: CONTRACTS.IDENTITY_REGISTRY,
        serviceMarket: CONTRACTS.SERVICE_MARKET,
        agenticCommerce: CONTRACTS.AGENTIC_COMMERCE,
        pipelineOrchestrator: CONTRACTS.PIPELINE_ORCHESTRATOR,
        streamEscrow: CONTRACTS.STREAM_ESCROW,
        commerceHook: CONTRACTS.COMMERCE_HOOK,
      },
    });
  } catch (err) {
    console.error("GET /api/stats error:", err);
    return errorResponse("Failed to fetch stats");
  }
}
