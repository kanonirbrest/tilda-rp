-- Пригласительный билет из админки: заказ без оплаты, билет уходит на почту.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "complimentary" BOOLEAN NOT NULL DEFAULT false;
