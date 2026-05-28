import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { randomUUID } from "node:crypto";
import type {
  EventIndexerRpcClient,
  RpcEventPage,
  SupportEventRecord,
} from "./event-indexer.js";

type RpcEvent = {
  ledger: number;
  pagingToken?: string;
  txHash: string;
  ledgerClosedAt: string;
  topic: string[];
  value: string;
  contractId: string;
  id: string;
};

type RpcResponse =
  | {
      result: {
        latestLedger: number;
        events: RpcEvent[];
        cursor?: string;
      };
    }
  | {
      error: { code: number; message: string; data?: unknown };
    };

function asAddress(value: unknown): string {
  if (value instanceof Address) {
    return value.toString();
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value ?? "");
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function decodeSupportEvent(event: RpcEvent): SupportEventRecord | null {
  if (!event.topic.length) return null;

  const native = scValToNative(xdr.ScVal.fromXDR(event.value, "base64")) as
    | Record<string, unknown>
    | unknown[];

  if (!native || Array.isArray(native)) return null;

  const supporter = native.supporter;
  const recipient = native.recipient;

  if (!supporter || !recipient) return null;

  return {
    txHash: event.txHash,
    ledger: event.ledger,
    pagingToken: event.pagingToken ?? event.id,
    amount: String(native.amount ?? "0"),
    assetCode: String(native.asset_code ?? native.assetCode ?? ""),
    assetIssuer: null,
    recipientAddress: asAddress(recipient),
    supporterAddress: asAddress(supporter),
    message: native.message == null ? null : String(native.message),
    emittedAt: new Date(toNumber(native.timestamp) * 1000),
  };
}

export function createSorobanRpcClient(
  rpcUrl: string,
  pageSize = 100,
): EventIndexerRpcClient {
  return {
    async fetchEvents({ contractId, cursor }): Promise<RpcEventPage> {
      const requestBody: Record<string, unknown> = {
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "getEvents",
        params: {
          filters: [
            {
              type: "contract",
              contractIds: [contractId],
            },
          ],
          pagination: {
            limit: pageSize,
            ...(cursor ? { cursor } : {}),
          },
          ...(cursor ? {} : { startLedger: await getLatestLedger(rpcUrl) }),
        },
      };

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Soroban RPC request failed: ${response.status}`);
      }

      const json = (await response.json()) as RpcResponse;
      if ("error" in json) {
        throw new Error(`Soroban RPC error: ${json.error.message}`);
      }

      const events = json.result.events
        .map((event) => decodeSupportEvent(event))
        .filter((event): event is SupportEventRecord => event !== null);

      return {
        events,
        nextPagingToken: json.result.cursor ?? null,
      };
    },
  };
}

async function getLatestLedger(rpcUrl: string): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "getLatestLedger",
    }),
  });

  if (!response.ok) {
    throw new Error(`Soroban RPC ledger lookup failed: ${response.status}`);
  }

  const json = (await response.json()) as {
    result?: { sequence?: number; latestLedger?: number };
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`Soroban RPC error: ${json.error.message ?? "unknown error"}`);
  }

  return json.result?.sequence ?? json.result?.latestLedger ?? 0;
}
