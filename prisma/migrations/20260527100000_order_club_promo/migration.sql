-- Промокоды клуба DEI (NR-*) из rp_bot после успешного redeem
ALTER TABLE "Order" ADD COLUMN "clubPromoCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "clubPromoTelegramUserId" TEXT;
