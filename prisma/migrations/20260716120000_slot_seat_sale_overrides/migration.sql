-- Сады сновидений: админ может выставлять/снимать места с продажи без деплоя.
ALTER TABLE "Slot" ADD COLUMN IF NOT EXISTS "seatSaleOverrides" JSONB;
