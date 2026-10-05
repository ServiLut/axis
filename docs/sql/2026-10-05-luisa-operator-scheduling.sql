-- Additive server-only infrastructure. Does not create patients, appointments or payments.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS "PsicologiaBotOperator" (
 id INTEGER PRIMARY KEY CHECK(id=4),
 "usuarioId" INTEGER NOT NULL UNIQUE REFERENCES "Usuario"(id),
 "authorization" TEXT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "PsicologiaBotAppointmentRequest" (
 id TEXT PRIMARY KEY,
 "tenantId" INTEGER NOT NULL DEFAULT 4 CHECK("tenantId"=4),
 "companyId" INTEGER NOT NULL DEFAULT 3 CHECK("companyId"=3),
 "customerPhone" TEXT NOT NULL,
 "professionalPhone" TEXT NOT NULL,
 details JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'WAIT_PROFESSIONAL'
 CHECK(status IN ('WAIT_PROFESSIONAL','AVAILABLE','READY','PROPOSED','DECLINED','REVIEW','EXPIRED')),
 "sourceEvent" TEXT NOT NULL,
 "questionOutboxId" TEXT NOT NULL UNIQUE,
 "availabilityEvent" TEXT,
 "proposalCode" TEXT UNIQUE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS luisa_one_open_request_per_customer ON "PsicologiaBotAppointmentRequest"("customerPhone")
 WHERE status IN ('WAIT_PROFESSIONAL','AVAILABLE','READY');
ALTER TABLE "PsicologiaBotOperator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PsicologiaBotAppointmentRequest" ENABLE ROW LEVEL SECURITY;
COMMIT;
