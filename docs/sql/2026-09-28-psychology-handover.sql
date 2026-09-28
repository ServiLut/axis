BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE "PsicologiaBotConfig" ADD COLUMN IF NOT EXISTS "staffIdleMinutes" INTEGER NOT NULL DEFAULT 15 CHECK ("staffIdleMinutes" BETWEEN 1 AND 240);
-- A timer continuation references the real message; original text, timestamp and processing remain intact.
ALTER TABLE "PsicologiaBotEvent" ADD COLUMN IF NOT EXISTS "resumeOf" TEXT REFERENCES "PsicologiaBotEvent"(id);
ALTER TABLE "PsicologiaBotEvent" ADD COLUMN IF NOT EXISTS "quotedText" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS psychology_one_idle_resume_per_event ON "PsicologiaBotEvent" ("resumeOf") WHERE "resumeOf" IS NOT NULL;
COMMIT;
