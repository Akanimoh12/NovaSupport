-- #608: Replace cascade delete on RecurringSupport.supporterId with SET NULL
--       and add a soft-delete timestamp column.
--
-- Previously, deleting a User cascaded to all their RecurringSupport rows,
-- permanently erasing subscription history with no recovery path and no
-- notification reaching creators whose active subscriptions were silently
-- cancelled.
--
-- With SET NULL:
--   - The RecurringSupport row is preserved when the supporter's User row
--     is deleted. supporterId becomes NULL.
--   - Application code (drip-scheduler) detects a NULL supporterId on the
--     next processing run and writes status = 'cancelled' + cancelledAt = now(),
--     giving creators a visible record of the cancellation.

-- 1. Allow supporterId to be NULL (reverting the NOT NULL added in
--    20260531000000_fix_recurring_support_supporter_id).
ALTER TABLE "RecurringSupport" ALTER COLUMN "supporterId" DROP NOT NULL;

-- 2. Add soft-delete timestamp so application code can record when the
--    subscription was implicitly cancelled by account deletion.
ALTER TABLE "RecurringSupport" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- 3. Swap the CASCADE foreign key for SET NULL.
ALTER TABLE "RecurringSupport"
    DROP CONSTRAINT "RecurringSupport_supporterId_fkey";

ALTER TABLE "RecurringSupport"
    ADD CONSTRAINT "RecurringSupport_supporterId_fkey"
    FOREIGN KEY ("supporterId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
