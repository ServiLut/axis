BEGIN;
SET LOCAL lock_timeout='5s';
-- Internal reference, resolved from the authenticated provider's reply edge.
-- Never supplied by the public event payload and never inferred from repeated text.
ALTER TABLE "PsicologiaBotEvent" ADD COLUMN IF NOT EXISTS "quotedOutboxId" TEXT;
COMMIT;
