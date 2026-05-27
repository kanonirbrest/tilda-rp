-- Время на билете — из slot.startsAt в Europe/Minsk, без отдельных полей заказа
ALTER TABLE "Order" DROP COLUMN IF EXISTS "visitDate";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "visitTime";
