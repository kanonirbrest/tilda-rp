-- Статус возврата и UID транзакции списания для API refund (parent_uid).
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

ALTER TABLE "Order" ADD COLUMN "bepaidPaymentUid" TEXT;
ALTER TABLE "Order" ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_bepaidPaymentUid_key" ON "Order"("bepaidPaymentUid");
