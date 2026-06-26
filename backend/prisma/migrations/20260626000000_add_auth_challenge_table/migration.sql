CREATE TABLE "auth_challenges" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_challenges_walletAddress_key" ON "auth_challenges"("walletAddress");
CREATE INDEX "auth_challenges_expiresAt_idx" ON "auth_challenges"("expiresAt");
