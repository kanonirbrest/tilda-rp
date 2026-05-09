-- Add logical slot identifier for channel-specific sales pages.
ALTER TABLE "Slot"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'NEBO_REKA';

-- Backfill pre-existing rows to explicit default storefront.
UPDATE "Slot" SET "kind" = 'NEBO_REKA' WHERE "kind" IS DISTINCT FROM 'NIGHT_OF_MUSEUMS';
