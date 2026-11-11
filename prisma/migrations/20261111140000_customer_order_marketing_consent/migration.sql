-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "marketingOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
