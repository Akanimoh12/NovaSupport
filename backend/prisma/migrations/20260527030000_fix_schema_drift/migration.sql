-- Fix schema/migration drift: create missing tables, align RecurringSupport
-- columns with schema.prisma, and add missing indexes on Profile and
-- SupportTransaction.

-- ── 1. WebhookDelivery ────────────────────────────────────────────────────
-- The Webhook model was added in 20260424000000_add_webhooks but the
-- WebhookDelivery table was never created in a migration.

CREATE TABLE "WebhookDelivery" (
    "id"           TEXT         NOT NULL,
    "webhookId"    TEXT         NOT NULL,
    "eventType"    TEXT         NOT NULL,
    "payload"      JSONB        NOT NULL,
    "status"       TEXT         NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER      NOT NULL DEFAULT 0,
    "nextRetryAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

ALTER TABLE "WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. indexer_cursors ────────────────────────────────────────────────────
-- IndexerCursor model (#281) was defined in schema.prisma but never migrated.

CREATE TABLE "indexer_cursors" (
    "id"              TEXT         NOT NULL,
    "network"         TEXT         NOT NULL,
    "contractId"      TEXT         NOT NULL,
    "lastPagingToken" TEXT         NOT NULL,
    "lastLedger"      INTEGER      NOT NULL DEFAULT 0,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexer_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "indexer_cursors_network_contractId_key"
    ON "indexer_cursors"("network", "contractId");

-- ── 3. RecurringSupport ───────────────────────────────────────────────────
-- The original migration created RecurringSupport with supporterAddress /
-- recipientAddress / assetIssuer / active (address-based model). Schema.prisma
-- was later updated to a user-foreign-key model (supporterId / nextRunAt /
-- status). Bring the migration history into alignment.

-- 3a. Drop the stale index on the column we are about to remove.
DROP INDEX IF EXISTS "RecurringSupport_supporterAddress_idx";

-- 3b. Add new columns required by schema.prisma.
--     nextRunAt and status get a DEFAULT so the column can be created even if
--     rows exist on a non-shadow database.
ALTER TABLE "RecurringSupport"
    ADD COLUMN "supporterId" TEXT,
    ADD COLUMN "nextRunAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "status"      TEXT         NOT NULL DEFAULT 'active';

-- 3c. Remove the old columns that are no longer in the schema.
ALTER TABLE "RecurringSupport"
    DROP COLUMN IF EXISTS "supporterAddress",
    DROP COLUMN IF EXISTS "recipientAddress",
    DROP COLUMN IF EXISTS "assetIssuer",
    DROP COLUMN IF EXISTS "active";

-- 3d. Restore the XLM default that the original migration omitted.
ALTER TABLE "RecurringSupport"
    ALTER COLUMN "assetCode" SET DEFAULT 'XLM';

-- 3e. Foreign keys: profileId FK was missing in the original migration;
--     supporterId FK is new.
ALTER TABLE "RecurringSupport"
    ADD CONSTRAINT "RecurringSupport_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringSupport"
    ADD CONSTRAINT "RecurringSupport_supporterId_fkey"
    FOREIGN KEY ("supporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3f. New indexes required by schema.prisma.
CREATE INDEX "RecurringSupport_supporterId_idx"        ON "RecurringSupport"("supporterId");
CREATE INDEX "RecurringSupport_nextRunAt_idx"           ON "RecurringSupport"("nextRunAt");
CREATE INDEX "RecurringSupport_nextRunAt_status_idx"    ON "RecurringSupport"("nextRunAt", "status");

-- ── 4. Profile — missing indexes ─────────────────────────────────────────
CREATE INDEX "Profile_createdAt_idx" ON "Profile"("createdAt" DESC);
CREATE INDEX "Profile_ownerId_idx"   ON "Profile"("ownerId");

-- ── 5. SupportTransaction — missing composite and single-column indexes ───
CREATE INDEX "SupportTransaction_profileId_status_createdAt_idx"
    ON "SupportTransaction"("profileId", "status", "createdAt" DESC);
CREATE INDEX "SupportTransaction_supporterAddress_createdAt_idx"
    ON "SupportTransaction"("supporterAddress", "createdAt" DESC);
CREATE INDEX "SupportTransaction_createdAt_idx"
    ON "SupportTransaction"("createdAt" DESC);
CREATE INDEX "SupportTransaction_status_idx"
    ON "SupportTransaction"("status");
