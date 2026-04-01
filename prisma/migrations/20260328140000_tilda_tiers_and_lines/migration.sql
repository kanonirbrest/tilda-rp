-- CreateEnum
CREATE TYPE "TicketTier" AS ENUM ('ADULT', 'CHILD', 'CONCESSION');

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN "priceAdultCents" INTEGER;
ALTER TABLE "Slot" ADD COLUMN "priceChildCents" INTEGER;
ALTER TABLE "Slot" ADD COLUMN "priceConcessionCents" INTEGER;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "admissionCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tier" "TicketTier" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
