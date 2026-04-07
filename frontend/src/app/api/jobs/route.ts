import { JOB_STATUS } from "@/lib/constants";
import AgenticCommerceABI from "@/abi/AgenticCommerce.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

    const jobCounter = (await client.readContract({
      address: CONTRACTS.AGENTIC_COMMERCE,
      abi: AgenticCommerceABI as any,
      functionName: "jobCounter",
    })) as bigint;

    const totalJobs = Number(jobCounter);

    if (totalJobs === 0) {
      return jsonResponse({ jobs: [], total: 0, page, limit, totalPages: 0 });
    }

    const jobCalls = Array.from({ length: totalJobs }, (_, i) => ({
      address: CONTRACTS.AGENTIC_COMMERCE,
      abi: AgenticCommerceABI as any,
      functionName: "getJob" as const,
      args: [BigInt(i + 1)],
    }));

    const results = await batchRead(jobCalls);

    let jobs = results
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const j = r.result as any;
        const status = Number(j.status ?? j[7] ?? 0);
        return {
          jobId: i + 1,
          client: (j.client ?? j[1] ?? "") as string,
          provider: (j.provider ?? j[2] ?? "") as string,
          evaluator: (j.evaluator ?? j[3] ?? "") as string,
          description: (j.description ?? j[4] ?? "") as string,
          budgetUsdc: parseFloat(formatUnits(BigInt(j.budget ?? j[5] ?? 0), 6)),
          expiredAt: Number(j.expiredAt ?? j[6] ?? 0),
          status,
          statusLabel: JOB_STATUS[status] ?? "Unknown",
          hook: (j.hook ?? j[8] ?? "") as string,
        };
      })
      .filter((j): j is NonNullable<typeof j> => j !== null)
      .reverse(); // Newest first

    // Status filter
    if (statusFilter !== null && statusFilter !== undefined) {
      const statusNum = parseInt(statusFilter, 10);
      const statusStr = statusFilter.toLowerCase();
      if (!isNaN(statusNum)) {
        jobs = jobs.filter((j) => j.status === statusNum);
      } else {
        // Match by label
        jobs = jobs.filter((j) => j.statusLabel.toLowerCase() === statusStr);
      }
    }

    const totalFiltered = jobs.length;
    const totalPages = Math.ceil(totalFiltered / limit);
    const paged = jobs.slice((page - 1) * limit, page * limit);

    return jsonResponse({
      jobs: paged,
      total: totalFiltered,
      totalJobs,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error("GET /api/jobs error:", err);
    return errorResponse("Failed to fetch jobs");
  }
}
