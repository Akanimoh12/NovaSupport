import "dotenv/config";
import { logger } from "./logger.js";

const REQUIRED_ENV_VARS = ["DATABASE_URL", "DIRECT_URL"];

function redact(value: string | undefined): string {
  if (!value) return "missing";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    logger.error({ variable: key }, `Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const startupConfig = {
  databaseUrl: redact(process.env.DATABASE_URL),
  directUrl: redact(process.env.DIRECT_URL),
  jwtSecret:
    !process.env.JWT_SECRET || process.env.JWT_SECRET === "your-secret-key-change-in-production"
      ? "default"
      : "configured",
  smtp:
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          enabled: true,
          host: redact(process.env.SMTP_HOST),
          user: redact(process.env.SMTP_USER),
          pass: redact(process.env.SMTP_PASS),
          from: redact(process.env.SMTP_FROM ?? ""),
        }
      : { enabled: false },
  supabase:
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          enabled: true,
          url: redact(process.env.SUPABASE_URL),
          serviceRoleKey: redact(process.env.SUPABASE_SERVICE_ROLE_KEY),
        }
      : { enabled: false },
  horizonUrl:
    process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
};

logger.info(
  { env: startupConfig },
  "Validated backend environment configuration",
);

if (startupConfig.jwtSecret === "default") {
  logger.warn(
    "JWT_SECRET is missing or using the default placeholder — authentication tokens are not production-safe",
  );
}

if (!startupConfig.smtp.enabled) {
  logger.warn(
    "SMTP_HOST, SMTP_USER, or SMTP_PASS is missing — email delivery is disabled",
  );
}

if (!startupConfig.supabase.enabled) {
  logger.warn(
    "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing — avatar uploads are disabled",
  );
}

if (startupConfig.horizonUrl.includes("testnet")) {
  logger.warn(
    { horizonUrl: startupConfig.horizonUrl },
    "Using Horizon testnet endpoint",
  );
}

import { app } from "./app.js";
import { startDripScheduler } from "./services/drip-scheduler.js";
import { startWebhookProcessor } from "./services/webhook-processor.js";
import { EventIndexer } from "./services/event-indexer.js";
import { createSorobanRpcClient } from "./services/soroban-rpc-client.js";
import { prisma } from "./db.js";

const port = Number(process.env.PORT ?? 4000);
const indexerNetwork = process.env.INDEXER_NETWORK ?? "TESTNET";
const contractId =
  process.env.SOROBAN_CONTRACT_ID ??
  process.env.CONTRACT_ID ??
  process.env.NEXT_PUBLIC_CONTRACT_ID ??
  "";
const sorobanRpcUrl =
  process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

const eventIndexer =
  contractId.trim().length > 0
    ? new EventIndexer({
        prisma,
        rpcClient: createSorobanRpcClient(sorobanRpcUrl),
        network: indexerNetwork,
        contractId,
      })
    : null;

app.listen(port, () => {
  logger.info({ port }, `NovaSupport backend listening on http://localhost:${port}`);

  // Start the recurring drip scheduler if enabled
  startDripScheduler();

  // Start the webhook delivery processor
  startWebhookProcessor();

  if (eventIndexer) {
    eventIndexer.start();
    logger.info(
      { contractId, network: indexerNetwork, rpcUrl: sorobanRpcUrl },
      "Soroban event indexer started",
    );
  } else {
    logger.warn(
      "Soroban event indexer disabled - set SOROBAN_CONTRACT_ID to enable it",
    );
  }
});
