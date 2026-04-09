import { findMaxAgentId, jsonResponse, errorResponse, CORS_HEADERS } from "@/lib/viemClient";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const totalAgents = await findMaxAgentId();
    return jsonResponse({ totalAgents });
  } catch (err) {
    console.error("GET /api/agents/count error:", err);
    return errorResponse("Failed to count agents");
  }
}
