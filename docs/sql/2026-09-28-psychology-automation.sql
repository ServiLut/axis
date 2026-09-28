-- Durable, tenant-specific reception. Additive; never rewrites appointments/payments.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "PsicologiaBotConfig" (
  id INTEGER PRIMARY KEY CHECK (id = 4),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  "activatedAt" TIMESTAMPTZ,
  templates JSONB NOT NULL DEFAULT '{}',
  "paymentPolicy" TEXT NOT NULL DEFAULT 'REVIEW'
    CHECK ("paymentPolicy" IN ('REVIEW','FULL','HALF_SESSION_FULL_PACKAGE','DEPOSIT_20000'))
);
ALTER TABLE "PsicologiaBotConfig" DROP CONSTRAINT IF EXISTS "PsicologiaBotConfig_paymentPolicy_check";
ALTER TABLE "PsicologiaBotConfig" ADD CONSTRAINT "PsicologiaBotConfig_paymentPolicy_check"
 CHECK ("paymentPolicy" IN ('REVIEW','FULL','HALF_SESSION_FULL_PACKAGE','DEPOSIT_20000'));
INSERT INTO "PsicologiaBotConfig" (id) VALUES (4) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "PsicologiaBotConversation" (
  phone TEXT PRIMARY KEY CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
  "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK ("tenantId" = 4),
  stage TEXT NOT NULL DEFAULT 'NEW',
  state JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "PsicologiaBotEvent" (
  id TEXT PRIMARY KEY,
  "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK ("tenantId" = 4),
  phone TEXT NOT NULL REFERENCES "PsicologiaBotConversation"(phone),
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "eventAt" TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  "fromMe" BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','REVIEW')),
  "processedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "psychology_bot_event_queue" ON "PsicologiaBotEvent" (status,"receivedAt");
CREATE TABLE IF NOT EXISTS "PsicologiaBotOutbox" (
  id TEXT PRIMARY KEY,
  "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK ("tenantId" = 4),
  phone TEXT NOT NULL CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','ACCEPTED','UNCERTAIN','CANCELLED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "attemptedAt" TIMESTAMPTZ,
  "messageId" BIGINT,
  "conversationId" BIGINT,
  "lastError" TEXT
);
CREATE INDEX IF NOT EXISTS "psychology_bot_outbox_queue" ON "PsicologiaBotOutbox" (status,"createdAt");
CREATE TABLE IF NOT EXISTS "PsicologiaBotProposal" (
  code TEXT PRIMARY KEY,
  "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK ("tenantId" = 4),
  "customerPhone" TEXT NOT NULL,
  "professionalPhone" TEXT NOT NULL,
  details JSONB NOT NULL,
  "customerConfirmedAt" TIMESTAMPTZ,
  "professionalConfirmedAt" TIMESTAMPTZ,
  "evidencePath" TEXT,
  "evidenceApprovedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "citaId" BIGINT UNIQUE REFERENCES "CitasPsicologos"(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','BOOKED','EXPIRED','CANCELLED','CONFLICT'))
);
-- No Supabase anonymous/authenticated browser reads: access only via the scoped server.
ALTER TABLE "PsicologiaBotConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotProposal" ENABLE ROW LEVEL SECURITY;
COMMIT;
