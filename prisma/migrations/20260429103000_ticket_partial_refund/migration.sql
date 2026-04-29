-- Частичный возврат по билетам: учёт суммы на заказе и метка на билете.
ALTER TABLE "Order" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "refundedAt" TIMESTAMP(3);
