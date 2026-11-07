-- Каким магазином bePaid оплачен заказ: default | dr. NULL — заказы до разделения, возврат в основной магазин.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "bepaidShop" TEXT;
