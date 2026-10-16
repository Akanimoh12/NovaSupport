CREATE TABLE "circuit_breaker_states" (
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_breaker_states_pkey" PRIMARY KEY ("name")
);
