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

// Arc RPC caps eth_getLogs at a 10,000-block range, so we scan in 10k chunks.
// We fan out PARALLEL chunks per batch and bail out early as soon as the
// verified agent count matches the wallet's balance.
const CHUNK_SIZE = BigInt(10_000);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const PARALLEL = 5;
const MAX_BATCHES = 8; // 8 * 5 * 10k = 400,000 blocks ~ last few days on Arc

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

    // Precompute chunk ranges, newest first.
    const ranges: Array<[bigint, bigint]> = [];
    let cursor = latest;
    for (let i = 0; i < MAX_BATCHES * PARALLEL; i++) {
      const toBlock = cursor;
      const fromBlock = toBlock > CHUNK_SIZE ? toBlock - CHUNK_SIZE + ONE : ZERO;
      ranges.push([fromBlock, toBlock]);
      if (fromBlock === ZERO) break;
      cursor = fromBlock - ONE;
    }

    const candidates = new Set<bigint>();
    const verified: number[] = [];
    const seenVerified = new Set<number>();

    for (let i = 0; i < ranges.length; i += PARALLEL) {
      const batch = ranges.slice(i, i + PARALLEL);

      const logResults = await Promise.allSettled(
        batch.map(([fromBlock, toBlock]) =>
          client.getLogs({
            address: CONTRACTS.IDENTITY_REGISTRY,
            event: TRANSFER_EVENT,
            args: { to: ownerTyped },
            fromBlock,
            toBlock,
          })
        )
      );

      const newCandidates: bigint[] = [];
      for (const r of logResults) {
        if (r.status === "fulfilled") {
          for (const log of r.value) {
            const tokenId = log.args.tokenId;
            if (tokenId !== undefined && !candidates.has(tokenId)) {
              candidates.add(tokenId);
              newCandidates.push(tokenId);
            }
          }
        } else {
          console.error("by-owner getLogs batch failed:", r.reason?.shortMessage ?? r.reason);
        }
      }

      // Verify any new candidates via ownerOf — the candidate may have been
      // transferred out since the Transfer-in event we just matched.
      if (newCandidates.length > 0) {
        const ownerCalls = newCandidates.map((id) => ({
          address: CONTRACTS.IDENTITY_REGISTRY,
          abi: IdentityRegistryABI as any,
          functionName: "ownerOf" as const,
          args: [id],
        }));
        const ownerResults = await batchRead(ownerCalls);
        newCandidates.forEach((id, idx) => {
          if (ownerResults[idx]?.status !== "success") return;
          const holder = (ownerResults[idx].result as string).toLowerCase();
          if (holder === owner) {
            const idNum = Number(id);
            if (!seenVerified.has(idNum)) {
              seenVerified.add(idNum);
              verified.push(idNum);
            }
          }
        });
      }

      if (BigInt(verified.length) >= balance) break;
    }

    const agentIds = verified.sort((a, b) => b - a);
    return jsonResponse({ owner: ownerTyped, agentIds });
  } catch (err) {
    console.error("GET /api/agents/by-owner error:", err);
    return errorResponse("Failed to fetch owned agents");
  }
}
