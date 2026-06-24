-- #592: Add scheduler_jobs table to persist the last-run timestamp for
-- recurring server-side jobs (e.g. weekly digest).
--
-- Without this table, every process restart (rolling deploy, crash recovery,
-- or scale-up) triggers an immediate job run regardless of when the previous
-- run occurred. Persisting lastRunAt lets each job skip its run if the
-- required interval has not yet elapsed since the last successful execution.
CREATE TABLE "scheduler_jobs" (
    "name"      TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_jobs_pkey" PRIMARY KEY ("name")
);
