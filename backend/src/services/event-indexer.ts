// #321: Contract event indexing service.
//
// Polls Soroban RPC for `SupportEvent`s emitted by the configured contract
// and persists them as `SupportTransaction` rows so the backend stays in
// sync with on-chain state without trusting the client to report
// completions. Cursor state lives in the `indexer_cursors` table; idempotency
// is enforced by the unique constraint on `SupportTransaction.txHash`.
//
// The service is intentionally storage-only inside the worker loop — fetch
// + parse logic is split into pure functions so unit tests can drive it
// without a real RPC endpoint.
//
// Orphan resolution: after each poll, orphaned transactions (profileId =
// "__orphan__") are resolved by matching recipientAddress to a Profile's
// walletAddress. This keeps the indexer eventually consistent with the
// profile registry without blocking the hot path.

import type { PrismaClient } from "@prisma/client";
import { logger } from "../logger.js";

export interface SupportEventRecord {
  /** Stellar tx hash of the transaction that emitted the event. */
  txHash: string;
  ledger: number;
  pagingToken: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  recipientAddress: string;
  supporterAddress: string | null;
  message: string | null;
  emittedAt: Date;
}

export interface RpcEventPage {
  events: SupportEventRecord[];
  /**
   * The cursor to pass back into the next call. When `null`, the page was
   * the last one available.
   */
  nextPagingToken: string | null;
}

/**
 * Abstract RPC client. Production wires this up to `@stellar/stellar-sdk`'s
 * SorobanRpc.Server.getEvents; tests pass a fake to drive the indexer
 * deterministically.
 */
export interface EventIndexerRpcClient {
  fetchEvents(args: {
    contractId: string;
    cursor: string;
  }): Promise<RpcEventPage>;
}

export interface EventIndexerOptions {
  prisma: PrismaClient;
  rpcClient: EventIndexerRpcClient;
  network: string;
  contractId: string;
  /** Milliseconds between polls. Defaults to 10s. */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;

/**
 * Long-running event indexer. Construct it, call `.start()` from the worker
 * boot path, and call `.stop()` on shutdown. `pollOnce()` is exposed for
 * testing and for manual reconciliation operators may run from a CLI.
 */
export class EventIndexer {
  private readonly prisma: PrismaClient;
  private readonly rpcClient: EventIndexerRpcClient;
  private readonly network: string;
  private readonly contractId: string;
  private readonly pollIntervalMs: number;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: EventIndexerOptions) {
    this.prisma = options.prisma;
    this.rpcClient = options.rpcClient;
    this.network = options.network;
    this.contractId = options.contractId;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  start(): void {
    this.stopped = false;
    this.scheduleNextTick(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Process a single page of events. Returns the number of events ingested
   * so callers (and tests) can assert progress.
   */
  async pollOnce(): Promise<{ ingested: number; nextCursor: string | null }> {
    const cursor = await this.readCursor();
    const page = await this.rpcClient.fetchEvents({
      contractId: this.contractId,
      cursor,
    });

    if (page.events.length === 0) {
      // Idle tick — nothing to persist; advance the cursor only if RPC
      // reported one (some RPC providers return a cursor on empty pages so
      // we don't re-scan the same range every tick).
      if (page.nextPagingToken) {
        await this.writeCursor(page.nextPagingToken, cursor);
      }
      return { ingested: 0, nextCursor: page.nextPagingToken };
    }

    const lastEvent = page.events[page.events.length - 1]!;
    const nextCursor = page.nextPagingToken ?? lastEvent.pagingToken;

    let ingested = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const event of page.events) {
        // Use the contract event's tx hash as the natural idempotency key.
        // SupportTransaction.txHash has a unique index so a duplicate insert
        // (e.g. from re-processing the same range during recovery) is a no-op.
        const result = await tx.supportTransaction.upsert({
          where: { txHash: event.txHash },
          update: {
            status: "SUCCESS",
            assetCode: event.assetCode,
            assetIssuer: event.assetIssuer,
            recipientAddress: event.recipientAddress,
            supporterAddress: event.supporterAddress,
            updatedAt: new Date(),
          },
          create: {
            txHash: event.txHash,
            amount: event.amount,
            assetCode: event.assetCode,
            assetIssuer: event.assetIssuer,
            supporterAddress: event.supporterAddress,
            recipientAddress: event.recipientAddress,
            stellarNetwork: this.network,
            message: event.message,
            // The indexer doesn't yet know which Profile to attach the tx
            // to without a recipient↔profile lookup; that's handled in a
            // follow-up. For now we mark the row as orphaned so the
            // resolver job can claim it.
            profileId: "__orphan__",
            status: "SUCCESS",
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          ingested += 1;
        }
      }

      await this.writeCursorWithinTx(tx, nextCursor, lastEvent.ledger);
    });

    return { ingested, nextCursor };
  }

  /**
   * Resolve orphaned transactions by matching recipientAddress to a Profile's
   * walletAddress. Called after each successful poll to keep the database
   * eventually consistent with the profile registry.
   *
   * Returns the number of transactions resolved.
   */
  async resolveOrphans(): Promise<number> {
    const orphans = await this.prisma.supportTransaction.findMany({
      where: { profileId: "__orphan__" },
      select: { id: true, recipientAddress: true },
    });

    if (orphans.length === 0) return 0;

    // Collect unique recipient addresses to look up in one query
    const addresses = [...new Set(orphans.map((o) => o.recipientAddress))];
    const profiles = await this.prisma.profile.findMany({
      where: { walletAddress: { in: addresses } },
      select: { id: true, walletAddress: true },
    });

    const addressToProfileId = new Map(
      profiles.map((p) => [p.walletAddress, p.id]),
    );

    let resolved = 0;
    for (const orphan of orphans) {
      const profileId = addressToProfileId.get(orphan.recipientAddress);
      if (!profileId) continue;

      await this.prisma.supportTransaction.update({
        where: { id: orphan.id },
        data: { profileId },
      });
      resolved += 1;
    }

    if (resolved > 0) {
      logger.info({ resolved }, "resolved orphaned transactions to profiles");
    }

    return resolved;
  }

  private async readCursor(): Promise<string> {
    const row = await this.prisma.indexerCursor.findUnique({
      where: {
        network_contractId: {
          network: this.network,
          contractId: this.contractId,
        },
      },
    });
    return row?.lastPagingToken ?? "";
  }

  private async writeCursor(token: string, _previous: string): Promise<void> {
    await this.prisma.indexerCursor.upsert({
      where: {
        network_contractId: {
          network: this.network,
          contractId: this.contractId,
        },
      },
      create: {
        network: this.network,
        contractId: this.contractId,
        lastPagingToken: token,
        lastLedger: 0,
      },
      update: { lastPagingToken: token },
    });
  }

  private async writeCursorWithinTx(
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    token: string,
    ledger: number,
  ): Promise<void> {
    await tx.indexerCursor.upsert({
      where: {
        network_contractId: {
          network: this.network,
          contractId: this.contractId,
        },
      },
      create: {
        network: this.network,
        contractId: this.contractId,
        lastPagingToken: token,
        lastLedger: ledger,
      },
      update: { lastPagingToken: token, lastLedger: ledger },
    });
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "event indexer tick failed");
      });
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const { ingested } = await this.pollOnce();
      if (ingested > 0) {
        logger.info({ ingested, contractId: this.contractId }, "indexed events");
        // Resolve orphaned transactions after ingesting new events
        await this.resolveOrphans().catch((err) => {
          logger.warn({ err }, "orphan resolution failed — will retry next tick");
        });
      }
    } finally {
      this.scheduleNextTick(this.pollIntervalMs);
    }
  }
}
