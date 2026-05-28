-- CreateTable: NotificationPreferences — granular email notification controls per profile (#475)
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "notifyOnSupport" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnMilestone" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one row per profile
CREATE UNIQUE INDEX "NotificationPreferences_profileId_key" ON "NotificationPreferences"("profileId");

-- AddForeignKey
ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
