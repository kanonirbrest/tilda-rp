-- Печатные билеты: регистрация на слот тем же QR, что на входе.

CREATE TYPE "TicketSource" AS ENUM ('SALE', 'PRINT');

ALTER TABLE "Slot"
    ADD COLUMN "registrationOpen" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Ticket"
    ADD COLUMN "source" "TicketSource" NOT NULL DEFAULT 'SALE',
    ADD COLUMN "serial" INTEGER;

ALTER TABLE "Ticket" ALTER COLUMN "orderId" DROP NOT NULL;

ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_orderId_fkey";
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Ticket_serial_key" ON "Ticket"("serial");
CREATE INDEX "Ticket_source_idx" ON "Ticket"("source");

CREATE TABLE "PrintTicketSeq" (
    "id" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PrintTicketSeq_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PrintTicketSeq" ("id", "next") VALUES (1, 1);
