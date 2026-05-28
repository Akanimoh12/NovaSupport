-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" DECIMAL(18,7) NOT NULL,
    "currentAmount" DECIMAL(18,7) NOT NULL DEFAULT 0,
    "assetCode" TEXT NOT NULL DEFAULT 'XLM',
    "status" TEXT NOT NULL DEFAULT 'active',
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Milestone_profileId_idx" ON "Milestone"("profileId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
