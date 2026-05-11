import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  getContract,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type GetContractReturnType,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { arcTestnet, CONTRACTS, DEFAULT_RPC, ERC20_ABI } from './constants.js';
import IdentityRegistryABI from './abi/IdentityRegistry.json';
import type {
  Service,
  Pipeline,
  Stage,
  Stream,
  StageParam,
  CreateStreamParams,
  PipelineOpts,
  ArcCommerceConfig,
} from './types.js';
import { PipelineStatus, StageStatus, StreamStatus } from './types.js';

import ServiceMarketABI from './abi/ServiceMarket.json';
import PipelineOrchestratorABI from './abi/PipelineOrchestrator.json';
import CommerceHookABI from './abi/CommerceHook.json';
import StreamEscrowABI from './abi/StreamEscrow.json';

const USDC_DECIMALS = 6;
const toUnits = (usdc: number): bigint => BigInt(Math.round(usdc * 10 ** USDC_DECIMALS));

export class ArcCommerce {
  readonly publicClient: PublicClient<Transport, Chain>;
  readonly walletClient: WalletClient | null;
  readonly account: ReturnType<typeof privateKeyToAccount> | null;

  private readonly addresses: {
    serviceMarket: Address;
    orchestrator: Address;
    hook: Address;
    streamEscrow: Address;
    identityRegistry: Address;
    usdc: Address;
    eurc: Address;
  };

  constructor(config: ArcCommerceConfig = {}) {
    const rpcUrl = config.rpcUrl ?? DEFAULT_RPC;

    this.publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl),
    }) as PublicClient<Transport, Chain>;

    this.addresses = {
      serviceMarket: config.contracts?.serviceMarket ?? CONTRACTS.SERVICE_MARKET,
      orchestrator: config.contracts?.pipelineOrchestrator ?? CONTRACTS.PIPELINE_ORCHESTRATOR,
      hook: config.contracts?.commerceHook ?? CONTRACTS.COMMERCE_HOOK,
      streamEscrow: config.contracts?.streamEscrow ?? CONTRACTS.STREAM_ESCROW,
      identityRegistry: config.contracts?.identityRegistry ?? CONTRACTS.IDENTITY_REGISTRY,
      usdc: config.contracts?.usdc ?? CONTRACTS.USDC,
      eurc: config.contracts?.eurc ?? CONTRACTS.EURC,
    };

    if (config.privateKey) {
      this.account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: arcTestnet,
        transport: http(rpcUrl),
      });
    } else {
      this.account = null;
      this.walletClient = null;
    }
  }

  // ── Helpers ──

  private requireWallet(): asserts this is { walletClient: WalletClient; account: NonNullable<ArcCommerce['account']> } {
    if (!this.walletClient || !this.account) {
      throw new Error('Private key required for write operations. Pass { privateKey } to constructor.');
    }
  }

  private resolveCurrency(currency: string): Address {
    if (currency.startsWith('0x')) return currency as Address;
    const map: Record<string, Address> = {
      USDC: this.addresses.usdc,
      EURC: this.addresses.eurc,
    };
    const addr = map[currency.toUpperCase()];
    if (!addr) throw new Error(`Unknown currency: ${currency}. Use 'USDC', 'EURC', or a hex address.`);
    return addr;
  }

  private async ensureAllowance(spender: Address, needed: bigint): Promise<void> {
    this.requireWallet();
    const allowance = await this.publicClient.readContract({
      address: this.addresses.usdc,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account!.address, spender],
    }) as bigint;

    if (allowance < needed) {
      const hash = await this.walletClient!.writeContract({
        address: this.addresses.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, needed],
        chain: arcTestnet,
        account: this.account!,
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
    }
  }

  // ── IdentityRegistry writes ──

  async registerAgent(metadataUri = ''): Promise<number> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.identityRegistry,
      abi: IdentityRegistryABI,
      functionName: 'register',
      args: [metadataUri],
      chain: arcTestnet,
      account: this.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    // ERC-721 Transfer(from, to, tokenId): topic[1]=from, topic[2]=to, topic[3]=tokenId
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const ZERO_TOPIC = '0x' + '0'.repeat(64);
    const ownerTopic = '0x' + this.account!.address.slice(2).toLowerCase().padStart(64, '0');
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === this.addresses.identityRegistry.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC &&
        log.topics[1] === ZERO_TOPIC &&
        log.topics[2]?.toLowerCase() === ownerTopic &&
        log.topics[3]
      ) {
        return Number(BigInt(log.topics[3]));
      }
    }
    return -1;
  }

  // ── ServiceMarket reads ──

  async getService(serviceId: number): Promise<Service> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.serviceMarket,
      abi: ServiceMarketABI,
      functionName: 'getService',
      args: [BigInt(serviceId)],
    }) as any;
    return {
      serviceId,
      agentId: Number(raw.agentId),
      provider: raw.provider,
      capabilityHash: raw.capabilityHash,
      pricePerTask: raw.pricePerTask,
      priceUsdc: Number(raw.pricePerTask) / 10 ** USDC_DECIMALS,
      metadataUri: raw.metadataURI,
      active: raw.active,
    };
  }

  async listAllServices(): Promise<Service[]> {
    const count = await this.publicClient.readContract({
      address: this.addresses.serviceMarket,
      abi: ServiceMarketABI,
      functionName: 'nextServiceId',
    }) as bigint;
    const promises = [];
    for (let i = 0; i < Number(count); i++) {
      promises.push(this.getService(i));
    }
    return Promise.all(promises);
  }

  async findServices(capability: string): Promise<Service[]> {
    const capHash = keccak256(toHex(capability));
    const ids = await this.publicClient.readContract({
      address: this.addresses.serviceMarket,
      abi: ServiceMarketABI,
      functionName: 'getServicesByCapability',
      args: [capHash],
    }) as bigint[];
    const services = await Promise.all(ids.map((id) => this.getService(Number(id))));
    return services.filter((s) => s.active);
  }

  // ── ServiceMarket writes ──

  async listService(agentId: number, capability: string, priceUsdc: number, metadataUri: string): Promise<number> {
    this.requireWallet();
    const capHash = keccak256(toHex(capability));
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.serviceMarket,
      abi: ServiceMarketABI,
      functionName: 'listService',
      args: [BigInt(agentId), capHash, toUnits(priceUsdc), metadataUri],
      chain: arcTestnet,
      account: this.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === this.addresses.serviceMarket.toLowerCase());
    // ServiceListed event: topic[1] = serviceId
    if (log && log.topics[1]) return Number(BigInt(log.topics[1]));
    return -1;
  }

  // ── Pipeline reads ──

  async getPipeline(pipelineId: number): Promise<Pipeline> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.orchestrator,
      abi: PipelineOrchestratorABI,
      functionName: 'pipelines',
      args: [BigInt(pipelineId)],
    }) as any[];
    return {
      pipelineId,
      clientAgentId: Number(raw[0]),
      client: raw[1] as Address,
      currency: raw[2] as Address,
      totalBudget: raw[3] as bigint,
      totalSpent: raw[4] as bigint,
      currentStage: Number(raw[5]),
      stageCount: Number(raw[6]),
      status: Number(raw[7]) as PipelineStatus,
      createdAt: Number(raw[8]),
      deadline: Number(raw[9]),
    };
  }

  async getStages(pipelineId: number): Promise<Stage[]> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.orchestrator,
      abi: PipelineOrchestratorABI,
      functionName: 'getStages',
      args: [BigInt(pipelineId)],
    }) as any[];
    return raw.map((s: any) => ({
      providerAgentId: Number(s.providerAgentId),
      providerAddress: s.providerAddress as Address,
      capabilityHash: s.capabilityHash as Hex,
      budget: s.budget as bigint,
      jobId: Number(s.jobId),
      status: Number(s.status) as StageStatus,
    }));
  }

  // ── Pipeline writes ──

  async createPipeline(
    clientAgentId: number,
    stages: StageParam[],
    opts: PipelineOpts = {},
  ): Promise<number> {
    this.requireWallet();
    const currency = this.resolveCurrency(opts.currency ?? 'USDC');
    const deadlineHours = opts.deadlineHours ?? 24;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineHours * 3600);

    const stageParams: Array<readonly [bigint, Address, Hex, bigint]> = [];
    let total = 0n;
    for (const s of stages) {
      const budget = toUnits(s.budgetUsdc);
      total += budget;
      stageParams.push([
        BigInt(s.providerAgentId),
        s.providerAddress,
        keccak256(toHex(s.capability)),
        budget,
      ] as const);
    }

    if (opts.autoApproveUsdc !== false) {
      await this.ensureAllowance(this.addresses.orchestrator, total);
    }

    const hash = await this.walletClient!.writeContract({
      address: this.addresses.orchestrator,
      abi: PipelineOrchestratorABI,
      functionName: 'createPipeline',
      args: [BigInt(clientAgentId), stageParams, currency, deadline],
      chain: arcTestnet,
      account: this.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find(
      (l) => l.address.toLowerCase() === this.addresses.orchestrator.toLowerCase() && l.topics[0] !== undefined,
    );
    if (log && log.topics[1]) return Number(BigInt(log.topics[1]));
    return -1;
  }

  async fundStage(pipelineId: number): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.orchestrator,
      abi: PipelineOrchestratorABI,
      functionName: 'fundStage',
      args: [BigInt(pipelineId)],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async cancelPipeline(pipelineId: number): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.orchestrator,
      abi: PipelineOrchestratorABI,
      functionName: 'cancelPipeline',
      args: [BigInt(pipelineId)],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async approveStage(jobId: number): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.hook,
      abi: CommerceHookABI,
      functionName: 'approveStage',
      args: [BigInt(jobId)],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async rejectStage(jobId: number, reason = 'rejected'): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.hook,
      abi: CommerceHookABI,
      functionName: 'rejectStage',
      args: [BigInt(jobId), reason],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async setAutoApprove(pipelineId: number, enabled = true): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.hook,
      abi: CommerceHookABI,
      functionName: 'setAutoApprove',
      args: [BigInt(pipelineId), enabled],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ── Stream reads ──

  async getStream(streamId: number): Promise<Stream> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'getStream',
      args: [BigInt(streamId)],
    }) as any;
    return {
      streamId,
      client: raw.client,
      provider: raw.provider,
      clientAgentId: Number(raw.clientAgentId),
      providerAgentId: Number(raw.providerAgentId),
      currency: raw.currency,
      deposit: raw.deposit,
      withdrawn: raw.withdrawn,
      startTime: Number(raw.startTime),
      endTime: Number(raw.endTime),
      heartbeatInterval: Number(raw.heartbeatInterval),
      lastHeartbeat: Number(raw.lastHeartbeat),
      missedBeats: Number(raw.missedBeats),
      pausedAt: Number(raw.pausedAt),
      totalPausedTime: Number(raw.totalPausedTime),
      status: Number(raw.status) as StreamStatus,
    };
  }

  async streamBalance(streamId: number): Promise<number> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'balanceOf',
      args: [BigInt(streamId)],
    }) as bigint;
    return Number(raw) / 10 ** USDC_DECIMALS;
  }

  async streamRemaining(streamId: number): Promise<number> {
    const raw = await this.publicClient.readContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'remainingBalance',
      args: [BigInt(streamId)],
    }) as bigint;
    return Number(raw) / 10 ** USDC_DECIMALS;
  }

  // ── Stream writes ──

  async createStream(params: CreateStreamParams): Promise<number> {
    this.requireWallet();
    const amount = toUnits(params.amountUsdc);
    await this.ensureAllowance(this.addresses.streamEscrow, amount);

    const hash = await this.walletClient!.writeContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'createStream',
      args: [
        BigInt(params.clientAgentId),
        BigInt(params.providerAgentId),
        params.providerAddress,
        this.addresses.usdc,
        amount,
        BigInt(params.durationSeconds),
        BigInt(params.heartbeatInterval ?? 60),
      ],
      chain: arcTestnet,
      account: this.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    // Parse streamId from first log topic
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === this.addresses.streamEscrow.toLowerCase() && log.topics[1]) {
        return Number(BigInt(log.topics[1]));
      }
    }
    return -1;
  }

  async heartbeat(streamId: number): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'heartbeat',
      args: [BigInt(streamId)],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async withdrawStream(streamId: number): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'withdraw',
      args: [BigInt(streamId)],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async cancelStream(streamId: number): Promise<Hex> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'cancel',
      args: [BigInt(streamId)],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async topUpStream(streamId: number, amountUsdc: number): Promise<Hex> {
    this.requireWallet();
    const amount = toUnits(amountUsdc);
    await this.ensureAllowance(this.addresses.streamEscrow, amount);

    const hash = await this.walletClient!.writeContract({
      address: this.addresses.streamEscrow,
      abi: StreamEscrowABI,
      functionName: 'topUp',
      args: [BigInt(streamId), amount],
      chain: arcTestnet,
      account: this.account!,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }
}
