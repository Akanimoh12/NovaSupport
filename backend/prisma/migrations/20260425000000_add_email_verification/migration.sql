-- AlterTable: add email verification fields to Profile
ALTER TABLE "Profile" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "Profile" ADD COLUMN "emailVerificationExpiry" TIMESTAMP(3);

-- CreateIndex: unique token lookup
CREATE UNIQUE INDEX "Profile_emailVerificationToken_key" ON "Profile"("emailVerificationToken");
