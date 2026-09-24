-- PROPUESTA ADITIVA. NO ejecutada por Codex.
-- Revisar y autorizar por separado antes de aplicar en cualquier base de datos.
-- Sin cambios de tablas existentes, pagos, saldos ni registros históricos.
BEGIN;
CREATE TABLE "MovimientoCaja" (
  "id" BIGSERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "creadoPorId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "fecha" DATE NOT NULL,
  "tipo" VARCHAR(7) NOT NULL CHECK ("tipo" IN ('INGRESO', 'EGRESO')),
  "metodoPago" VARCHAR(13) NOT NULL CHECK ("metodoPago" IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO')),
  "monto" NUMERIC(12,2) NOT NULL CHECK ("monto" > 0 AND "monto" <= 999999999.99),
  "concepto" VARCHAR(240) NOT NULL CHECK (length(trim("concepto")) >= 3),
  "referencia" VARCHAR(120),
  "solicitudId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MovimientoCaja_tenantId_creadoPorId_solicitudId_key"
  ON "MovimientoCaja"("tenantId", "creadoPorId", "solicitudId");
CREATE INDEX "MovimientoCaja_tenantId_fecha_idx" ON "MovimientoCaja"("tenantId", "fecha");
-- Sin políticas públicas: las acciones autenticadas del servidor son la única vía.
ALTER TABLE "MovimientoCaja" ENABLE ROW LEVEL SECURITY;
COMMIT;
