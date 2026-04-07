import { client, CONTRACTS, jsonResponse, errorResponse, CORS_HEADERS, batchRead } from "@/lib/viemClient";
import { formatUnits } from "viem";
import { capabilityName, PIPELINE_STATUS, STAGE_STATUS } from "@/lib/constants";
import PipelineOrchestratorABI from "@/abi/PipelineOrchestrator.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const nextId = await client.readContract({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR,
      abi: PipelineOrchestratorABI,
      functionName: "nextPipelineId",
    }) as bigint;

    const pipelineCount = Number(nextId);

    if (pipelineCount === 0) {
      return jsonResponse({ pipelines: [], total: 0 });
    }

    // Fetch all pipeline structs
    const pipelineCalls = Array.from({ length: pipelineCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR,
      abi: PipelineOrchestratorABI as any,
      functionName: "pipelines" as const,
      args: [BigInt(i)],
    }));

    const pipelineResults = await batchRead(pipelineCalls);

    // Fetch stages for each pipeline
    const stageCalls = Array.from({ length: pipelineCount }, (_, i) => ({
      address: CONTRACTS.PIPELINE_ORCHESTRATOR,
      abi: PipelineOrchestratorABI as any,
      functionName: "getStages" as const,
      args: [BigInt(i)],
    }));

    const stageResults = await batchRead(stageCalls);

    const pipelines = pipelineResults
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const p = r.result as any;
        // pipelines() returns flat tuple: clientAgentId, client, currency, totalBudget, totalSpent, currentStage, stageCount, status, createdAt, deadline
        const clientAgentId = Number(p[0] ?? p.clientAgentId ?? 0);
        const clientAddr = (p[1] ?? p.client ?? "") as string;
        const currency = (p[2] ?? p.currency ?? "") as string;
        const totalBudget = BigInt(p[3] ?? p.totalBudget ?? 0);
        const totalSpent = BigInt(p[4] ?? p.totalSpent ?? 0);
        const currentStage = Number(p[5] ?? p.currentStage ?? 0);
        const stageCount = Number(p[6] ?? p.stageCount ?? 0);
        const status = Number(p[7] ?? p.status ?? 0);
        const createdAt = Number(p[8] ?? p.createdAt ?? 0);
        const deadline = Number(p[9] ?? p.deadline ?? 0);

        // Parse stages
        let stages: any[] = [];
        if (stageResults[i]?.status === "success" && stageResults[i].result) {
          const rawStages = stageResults[i].result as any[];
          stages = rawStages.map((s: any) => ({
            providerAgentId: Number(s.providerAgentId ?? s[0] ?? 0),
            providerAddress: (s.providerAddress ?? s[1] ?? "") as string,
            capabilityHash: (s.capabilityHash ?? s[2] ?? "") as string,
            capability: capabilityName((s.capabilityHash ?? s[2] ?? "") as string),
            budgetUsdc: parseFloat(formatUnits(BigInt(s.budget ?? s[3] ?? 0), 6)),
            jobId: Number(s.jobId ?? s[4] ?? 0),
            status: Number(s.status ?? s[5] ?? 0),
            statusLabel: STAGE_STATUS[Number(s.status ?? s[5] ?? 0)] ?? "Unknown",
          }));
        }

        return {
          pipelineId: i,
          clientAgentId,
          client: clientAddr,
          currency,
          totalBudgetUsdc: parseFloat(formatUnits(totalBudget, 6)),
          totalSpentUsdc: parseFloat(formatUnits(totalSpent, 6)),
          currentStage,
          stageCount,
          status,
          statusLabel: PIPELINE_STATUS[status] ?? "Unknown",
          createdAt,
          deadline,
          stages,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return jsonResponse({ pipelines, total: pipelines.length });
  } catch (err) {
    console.error("GET /api/pipelines error:", err);
    return errorResponse("Failed to fetch pipelines");
  }
}
