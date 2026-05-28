-- Add optional Stellar memo storage to support transactions.
ALTER TABLE "SupportTransaction" ADD COLUMN "memo" TEXT;
