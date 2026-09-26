-- Registro de recaudos de citas y paquetes de Psicología.
-- Se instala una sola vez después de 2026-09-24-caja-diaria.sql y 2026-09-25-recepcion.sql.
-- No convierte estados CONCILIADO históricos en dinero recibido.
BEGIN;

CREATE TABLE "PagoServicioPsicologia" (
  "id" BIGSERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  "creadoPorId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "citaId" BIGINT REFERENCES "CitasPsicologos"("id") ON DELETE RESTRICT,
  "paqueteId" BIGINT REFERENCES "PaqueteAdquirido"("id") ON DELETE RESTRICT,
  "movimientoCajaId" BIGINT NOT NULL UNIQUE REFERENCES "MovimientoCaja"("id") ON DELETE RESTRICT,
  "fecha" DATE NOT NULL,
  "monto" NUMERIC(12,2) NOT NULL CHECK ("monto" > 0),
  "metodoPago" VARCHAR(13) NOT NULL CHECK ("metodoPago" IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO')),
  "referencia" VARCHAR(120) NOT NULL DEFAULT '',
  "solicitudId" UUID NOT NULL,
  "linea" SMALLINT NOT NULL CHECK ("linea" BETWEEN 1 AND 4),
  "reversado" BOOLEAN NOT NULL DEFAULT FALSE,
  "reversoMovimientoId" BIGINT UNIQUE REFERENCES "MovimientoCaja"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("citaId" IS NULL) <> ("paqueteId" IS NULL))
);
CREATE UNIQUE INDEX "PagoServicioPsicologia_solicitud_linea"
  ON "PagoServicioPsicologia" ("tenantId", "creadoPorId", "solicitudId", "linea");
CREATE INDEX "PagoServicioPsicologia_cita_activo"
  ON "PagoServicioPsicologia" ("tenantId", "citaId") WHERE NOT "reversado";
CREATE INDEX "PagoServicioPsicologia_paquete_activo"
  ON "PagoServicioPsicologia" ("tenantId", "paqueteId") WHERE NOT "reversado";
CREATE INDEX "PagoServicioPsicologia_fecha"
  ON "PagoServicioPsicologia" ("tenantId", "fecha");
ALTER TABLE "PagoServicioPsicologia" ENABLE ROW LEVEL SECURITY;

COMMIT;
