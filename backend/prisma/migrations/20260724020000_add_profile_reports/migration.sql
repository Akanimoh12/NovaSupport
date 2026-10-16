-- CreateTable
CREATE TABLE "profile_reports" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "reporterIp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_reports_profileId_idx" ON "profile_reports"("profileId");

-- CreateIndex
CREATE INDEX "profile_reports_profileId_createdAt_idx" ON "profile_reports"("profileId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
