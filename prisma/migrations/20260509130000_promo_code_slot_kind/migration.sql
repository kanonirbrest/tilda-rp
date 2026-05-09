-- PromoCode: ограничение по витрине / каналу продажи (null = все слоты).
ALTER TABLE "PromoCode" ADD COLUMN "slotKind" TEXT;
