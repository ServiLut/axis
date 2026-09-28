BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE "PsicologiaBotConfig" ADD COLUMN IF NOT EXISTS "marketingNextAt" TIMESTAMPTZ;
ALTER TABLE "PsicologiaBotOutreach" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "PsicologiaBotOutreach" ADD COLUMN IF NOT EXISTS "professionalId" INTEGER REFERENCES "Usuario"(id);
ALTER TABLE "PsicologiaBotOutreach" DROP CONSTRAINT IF EXISTS "outreach_one_recipient";
ALTER TABLE "PsicologiaBotOutreach" ADD CONSTRAINT "outreach_one_recipient" CHECK (("clientId" IS NULL) <> ("professionalId" IS NULL));
COMMIT;
