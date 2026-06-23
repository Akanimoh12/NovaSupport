-- #609: Add a partial index on WebhookDelivery for status = 'pending'.
--
-- The webhook processor queries:
--   WHERE status = 'pending' AND nextRetryAt <= now AND attemptCount < 3
--
-- The existing composite index (status, nextRetryAt) covers every status value,
-- so as completed and failed rows accumulate over time the index grows
-- unboundedly and the processor scan stays slow.
--
-- This partial index contains only pending rows, keeping it small and ensuring
-- the processor query is fast regardless of how large the delivery history grows.
CREATE INDEX "WebhookDelivery_pending_nextRetryAt_idx"
    ON "WebhookDelivery" ("nextRetryAt")
    WHERE (status = 'pending');
