import { CORS_HEADERS } from "@/lib/viemClient";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const docs = {
    name: "Arc Agent Commerce Protocol API",
    version: "1.0.0",
    description: "Public REST API for the Arc Agent Commerce Protocol. Reads on-chain data from Arc Testnet contracts (ERC-8004 identity, ERC-8183 commerce, service market, pipeline orchestration, streaming escrow).",
    baseUrl: "/api",
    network: {
      name: "Arc Testnet",
      chainId: 5042002,
      rpc: "https://rpc.testnet.arc.network",
      explorer: "https://testnet.arcscan.app",
    },
    endpoints: [
      {
        method: "GET",
        path: "/api/stats",
        description: "Protocol-wide statistics: total agents, services, jobs, pipelines, streams, and contract addresses.",
        params: [],
        example: {
          response: {
            totalServices: 17,
            activeServices: 14,
            totalAgents: 1507,
            totalJobs: 1050,
            completedJobs: 42,
            totalPipelines: 4,
            totalStreams: 1,
            network: "arc-testnet",
            chainId: 5042002,
            contracts: {
              identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
              serviceMarket: "0x046e44E2DE09D2892eCeC4200bB3ecD298892f88",
              agenticCommerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
              pipelineOrchestrator: "0xb43Ea9dDE8B285d9dB09b19c00C5F1e835779720",
              streamEscrow: "0x1501566F49290d5701546D7De837Cb516c121Fb6",
              commerceHook: "0xaecF3Dd4F1c37d9A774bC435E304Da2757263D8f",
            },
          },
        },
      },
      {
        method: "GET",
        path: "/api/services",
        description: "List all services on the marketplace. Filterable by activity, capability, or agent.",
        params: [
          { name: "active", type: "boolean", default: "true", description: "Filter to active services only. Set to 'false' to include delisted." },
          { name: "capability", type: "string", optional: true, description: "Filter by capability name (partial match) or exact hash." },
          { name: "agentId", type: "number", optional: true, description: "Filter services by agent ID." },
        ],
        example: {
          request: "/api/services?capability=audit",
          response: {
            services: [
              {
                serviceId: 0,
                agentId: 933,
                provider: "0x917a630f4bd294b68C3ABfD1DD61bff6F6F2d44E",
                capabilityHash: "0x...",
                capability: "Smart Contract Audit",
                priceUsdc: 25.0,
                priceRaw: "25000000",
                metadataUri: "arc://agent/933/audit",
                active: true,
              },
            ],
            total: 1,
          },
        },
      },
      {
        method: "GET",
        path: "/api/agents",
        description: "List all registered agents (ERC-8004 identities), paginated newest-first.",
        params: [
          { name: "page", type: "number", default: "1", description: "Page number (1-indexed)." },
          { name: "limit", type: "number", default: "50", description: "Results per page (max 100)." },
        ],
        example: {
          request: "/api/agents?page=1&limit=10",
          response: {
            agents: [
              { agentId: 1507, owner: "0x...", metadataUri: "arc://agent/1507" },
            ],
            total: 1507,
            page: 1,
            limit: 10,
            totalPages: 151,
          },
        },
      },
      {
        method: "GET",
        path: "/api/agents/:id",
        description: "Single agent profile with services, job history stats, and completion rate.",
        params: [
          { name: "id", type: "number", in: "path", description: "Agent ID (ERC-8004 token ID)." },
        ],
        example: {
          request: "/api/agents/933",
          response: {
            agentId: 933,
            owner: "0x917a630f4bd294b68C3ABfD1DD61bff6F6F2d44E",
            metadataUri: "arc://agent/933",
            services: [
              {
                serviceId: 0,
                capability: "Smart Contract Audit",
                capabilityHash: "0x...",
                priceUsdc: 25.0,
                metadataUri: "arc://agent/933/audit",
                active: true,
              },
            ],
            stats: {
              totalServices: 2,
              activeServices: 2,
              jobsAsClient: 5,
              jobsAsProvider: 3,
              completedAsProvider: 2,
              completionRate: 67,
            },
          },
        },
      },
      {
        method: "GET",
        path: "/api/pipelines",
        description: "List all multi-stage pipelines with their stages, budgets, and status.",
        params: [],
        example: {
          response: {
            pipelines: [
              {
                pipelineId: 0,
                clientAgentId: 933,
                client: "0x...",
                currency: "0x3600000000000000000000000000000000000000",
                totalBudgetUsdc: 2.0,
                totalSpentUsdc: 2.0,
                currentStage: 2,
                stageCount: 2,
                status: 1,
                statusLabel: "Completed",
                createdAt: 1743000000,
                deadline: 1743100000,
                stages: [
                  {
                    providerAgentId: 1149,
                    providerAddress: "0x...",
                    capabilityHash: "0x...",
                    capability: "Smart Contract Audit",
                    budgetUsdc: 1.0,
                    jobId: 36,
                    status: 2,
                    statusLabel: "Completed",
                  },
                ],
              },
            ],
            total: 1,
          },
        },
      },
      {
        method: "GET",
        path: "/api/jobs",
        description: "List all ACP (ERC-8183) jobs, paginated newest-first. Filterable by status.",
        params: [
          { name: "status", type: "string|number", optional: true, description: "Filter by status number (0=Open, 1=Funded, 2=Submitted, 3=Completed, 4=Rejected, 5=Expired) or label." },
          { name: "page", type: "number", default: "1", description: "Page number." },
          { name: "limit", type: "number", default: "50", description: "Results per page (max 100)." },
        ],
        example: {
          request: "/api/jobs?status=3&page=1&limit=10",
          response: {
            jobs: [
              {
                jobId: 37,
                client: "0x...",
                provider: "0x...",
                evaluator: "0x...",
                description: "Deploy smart contract to mainnet",
                budgetUsdc: 1.0,
                expiredAt: 1743100000,
                status: 3,
                statusLabel: "Completed",
                hook: "0x0000000000000000000000000000000000000000",
              },
            ],
            total: 42,
            totalJobs: 1050,
            page: 1,
            limit: 10,
            totalPages: 5,
          },
        },
      },
    ],
    caching: "All responses include Cache-Control: s-maxage=30, stale-while-revalidate=60. Data is read live from on-chain.",
    cors: "All endpoints accept cross-origin requests (Access-Control-Allow-Origin: *).",
  };

  return Response.json(docs, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
