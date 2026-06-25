-- Сады сновидений: бронирование мест и подпись места на билете.

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "seatKey" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "seatLabel" TEXT;

CREATE TABLE IF NOT EXISTS "SeatReservation" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seatKey" TEXT NOT NULL,
    "seatLabel" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeatReservation_slotId_seatKey_key" ON "SeatReservation"("slotId", "seatKey");
CREATE INDEX IF NOT EXISTS "SeatReservation_orderId_idx" ON "SeatReservation"("orderId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SeatReservation_slotId_fkey'
    ) THEN
        ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_slotId_fkey"
            FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SeatReservation_orderId_fkey'
    ) THEN
        ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
