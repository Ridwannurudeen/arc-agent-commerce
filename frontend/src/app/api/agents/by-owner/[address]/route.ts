import { client, CONTRACTS, jsonResponse, errorResponse, CORS_HEADERS, batchRead } from "@/lib/viemClient";
import { parseAbiItem } from "viem";
import IdentityRegistryABI from "@/abi/IdentityRegistry.json";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);

const CHUNK_SIZE = BigInt(500_000);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const MAX_CHUNKS = 80; // safety bound — covers ~40M blocks

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const owner = address.toLowerCase();

    if (!/^0x[0-9a-f]{40}$/.test(owner)) {
      return errorResponse("Invalid address", 400);
    }

    const ownerTyped = owner as `0x${string}`;

    // How many NFTs should we expect?
    const balance = (await client.readContract({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: IdentityRegistryABI,
      functionName: "balanceOf",
      args: [ownerTyped],
    })) as bigint;

    if (balance === ZERO) {
      return jsonResponse({ owner: ownerTyped, agentIds: [] });
    }

    const latest = await client.getBlockNumber();

    // Scan Transfer(*, owner) in reverse chunks until we've collected
    // enough candidates. Stop early if we clearly have >= balance * 2
    // (2x gives headroom for transfers-in that were later sent out).
    const candidates = new Set<bigint>();
    let toBlock = latest;

    for (let i = 0; i < MAX_CHUNKS; i++) {
      const fromBlock = toBlock > CHUNK_SIZE ? toBlock - CHUNK_SIZE : ZERO;
      try {
        const logs = await client.getLogs({
          address: CONTRACTS.IDENTITY_REGISTRY,
          event: TRANSFER_EVENT,
          args: { to: ownerTyped },
          fromBlock,
          toBlock,
        });
        for (const log of logs) {
          if (log.args.tokenId !== undefined) {
            candidates.add(log.args.tokenId);
          }
        }
      } catch (err) {
        console.error(`getLogs chunk ${fromBlock}-${toBlock} failed:`, err);
      }

      if (BigInt(candidates.size) >= balance * TWO) break;
      if (fromBlock === ZERO) break;
      toBlock = fromBlock - ONE;
    }

    if (candidates.size === 0) {
      return jsonResponse({ owner: ownerTyped, agentIds: [] });
    }

    // Verify each candidate via ownerOf — filter to those still owned.
    const candidateIds = [...candidates];
    const ownerCalls = candidateIds.map((id) => ({
      address: CONTRACTS.IDENTITY_REGISTRY,
      abi: IdentityRegistryABI as any,
      functionName: "ownerOf" as const,
      args: [id],
    }));

    const results = await batchRead(ownerCalls);

    const agentIds = candidateIds
      .map((id, i) => {
        if (results[i].status !== "success") return null;
        const addr = (results[i].result as string).toLowerCase();
        return addr === owner ? Number(id) : null;
      })
      .filter((x): x is number => x !== null)
      .sort((a, b) => b - a);

    return jsonResponse({ owner: ownerTyped, agentIds });
  } catch (err) {
    console.error("GET /api/agents/by-owner error:", err);
    return errorResponse("Failed to fetch owned agents");
  }
}
