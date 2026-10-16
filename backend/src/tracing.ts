/**
 * OpenTelemetry SDK initialisation — must be imported before any other
 * application module so that auto-instrumentation patches Express, Prisma,
 * http, and fetch before those modules are loaded.
 *
 * Tracing is silently skipped when OTEL_EXPORTER_OTLP_ENDPOINT is not set
 * so local development without a collector still works without errors.
 *
 * Issue: #779
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "novasupport-backend",
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduce noise from filesystem polling used by tsx watch
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Flush spans on graceful shutdown
  process.once("SIGTERM", () => sdk.shutdown());
  process.once("SIGINT", () => sdk.shutdown());
}
