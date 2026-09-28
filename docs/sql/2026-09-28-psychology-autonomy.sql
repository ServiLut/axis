BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE "PsicologiaBotConfig" ADD COLUMN IF NOT EXISTS "aiLeaseUntil" TIMESTAMPTZ;
ALTER TABLE "PsicologiaBotConfig" ADD COLUMN IF NOT EXISTS "aiLeaseToken" TEXT;
ALTER TABLE "PsicologiaBotEvent" ADD COLUMN IF NOT EXISTS analysis JSONB;
ALTER TABLE "PsicologiaBotEvent" ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE "PsicologiaBotEvent" ADD COLUMN IF NOT EXISTS "analysisError" TEXT;
CREATE TABLE IF NOT EXISTS "PsicologiaBotKnowledge" (
 id TEXT PRIMARY KEY,
 "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK("tenantId"=4),
 instruction TEXT NOT NULL,
 "sourceEvent" TEXT NOT NULL UNIQUE REFERENCES "PsicologiaBotEvent"(id),
 "approvedBy" TEXT NOT NULL CHECK("approvedBy"='573016803926'),
 active BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "PsicologiaBotOutreach" (
 id TEXT PRIMARY KEY,
 "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK("tenantId"=4),
 phone TEXT NOT NULL,
 "clientId" INTEGER NOT NULL REFERENCES "Cliente"(id),
 "sourceEvent" TEXT NOT NULL REFERENCES "PsicologiaBotEvent"(id),
 "lastCompletedAt" TIMESTAMPTZ NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(phone,"sourceEvent")
);
CREATE TABLE IF NOT EXISTS "PsicologiaBotContactPermission" (
 phone TEXT PRIMARY KEY,
 "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK("tenantId"=4),
 marketing BOOLEAN NOT NULL DEFAULT false,
 "optedOut" BOOLEAN NOT NULL DEFAULT false,
 "sourceEvent" TEXT NOT NULL REFERENCES "PsicologiaBotEvent"(id),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "PsicologiaBotKnowledge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotOutreach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotContactPermission" ENABLE ROW LEVEL SECURITY;
COMMIT;
