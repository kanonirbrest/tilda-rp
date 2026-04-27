-- Nullable: старые билеты без типа; новые заполняются при создании заказа.
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "tier" "TicketTier";
