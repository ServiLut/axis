-- Aditiva. Requiere MovimientoCaja (2026-09-24-caja-diaria.sql).
-- Probar primero en una base separada. No modifica operaciones anteriores.
BEGIN;
CREATE TABLE "ServicioRecepcion" (
  "tenantId" INTEGER NOT NULL REFERENCES "Tenant"("id"),
  "codigo" VARCHAR(20) NOT NULL CHECK ("codigo" IN ('IMPRESION','EXTRA_CORTO','EXTRA_MEDIO','EXTRA_HORA')),
  "nombre" VARCHAR(120) NOT NULL,
  "unidad" VARCHAR(30) NOT NULL,
  "precio" NUMERIC(12,2) CHECK ("precio" > 0 AND "precio" <= 999999999.99),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tenantId","codigo")
);
CREATE TABLE "CargoRecepcion" (
  "id" BIGSERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL REFERENCES "Tenant"("id"),
  "profesionalId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "citaId" BIGINT REFERENCES "CitasPsicologos"("id") ON DELETE RESTRICT,
  "creadoPorId" INTEGER NOT NULL REFERENCES "Usuario"("id"),
  "fecha" DATE NOT NULL,
  "codigo" VARCHAR(20) NOT NULL,
  "concepto" VARCHAR(120) NOT NULL,
  "cantidad" INTEGER NOT NULL CHECK ("cantidad" BETWEEN 1 AND 10000),
  "precioUnitario" NUMERIC(12,2) NOT NULL CHECK ("precioUnitario" > 0),
  "total" NUMERIC(12,2) NOT NULL CHECK ("total" > 0 AND "total" = "precioUnitario" * "cantidad"),
  "minutosExtra" INTEGER,
  "nota" VARCHAR(240) NOT NULL DEFAULT '',
  "solicitudId" UUID NOT NULL,
  "solicitud" JSONB NOT NULL,
  "anulado" BOOLEAN NOT NULL DEFAULT FALSE,
  "motivoAnulacion" VARCHAR(240),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("tenantId","codigo") REFERENCES "ServicioRecepcion"("tenantId","codigo"),
  UNIQUE ("tenantId","creadoPorId","solicitudId"),
  CHECK (("codigo" = 'IMPRESION' AND "minutosExtra" IS NULL) OR
    ("codigo" = 'EXTRA_CORTO' AND "minutosExtra" IS NOT NULL AND "minutosExtra" BETWEEN 1 AND 15 AND "citaId" IS NOT NULL AND "cantidad" = 1) OR
    ("codigo" = 'EXTRA_MEDIO' AND "minutosExtra" IS NOT NULL AND "minutosExtra" BETWEEN 16 AND 30 AND "citaId" IS NOT NULL AND "cantidad" = 1) OR
    ("codigo" = 'EXTRA_HORA' AND "minutosExtra" IS NOT NULL AND "minutosExtra" >= 31 AND "citaId" IS NOT NULL AND "cantidad" = 1))
);
CREATE UNIQUE INDEX "CargoRecepcion_extra_unico" ON "CargoRecepcion" ("tenantId","citaId")
  WHERE "codigo" IN ('EXTRA_CORTO','EXTRA_MEDIO','EXTRA_HORA') AND NOT "anulado";
CREATE INDEX "CargoRecepcion_tenant_fecha" ON "CargoRecepcion" ("tenantId","fecha");
CREATE TABLE "PagoRecepcion" (
  "id" BIGSERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL REFERENCES "Tenant"("id"),
  "creadoPorId" INTEGER NOT NULL REFERENCES "Usuario"("id"),
  "fecha" DATE NOT NULL,
  "monto" NUMERIC(12,2) NOT NULL CHECK ("monto" > 0),
  "metodoPago" VARCHAR(13) NOT NULL CHECK ("metodoPago" IN ('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO')),
  "referencia" VARCHAR(120) NOT NULL,
  "movimientoCajaId" BIGINT NOT NULL UNIQUE REFERENCES "MovimientoCaja"("id"),
  "solicitudId" UUID NOT NULL,
  "solicitud" JSONB NOT NULL,
  "reversado" BOOLEAN NOT NULL DEFAULT FALSE,
  "reversoMovimientoId" BIGINT UNIQUE REFERENCES "MovimientoCaja"("id"),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId","creadoPorId","solicitudId"),
  CHECK ("reversado" = ("reversoMovimientoId" IS NOT NULL))
);
CREATE INDEX "PagoRecepcion_tenant_fecha" ON "PagoRecepcion" ("tenantId","fecha");
CREATE UNIQUE INDEX "PagoRecepcion_referencia_no_duplicada" ON "PagoRecepcion" ("tenantId","metodoPago",lower(trim("referencia"))) WHERE NOT "reversado";
CREATE TABLE "AplicacionPagoRecepcion" (
  "pagoId" BIGINT NOT NULL REFERENCES "PagoRecepcion"("id") ON DELETE RESTRICT,
  "cargoId" BIGINT NOT NULL REFERENCES "CargoRecepcion"("id") ON DELETE RESTRICT,
  "monto" NUMERIC(12,2) NOT NULL CHECK ("monto" > 0),
  PRIMARY KEY ("pagoId","cargoId")
);
-- Tarifas nuevas; no se alteran ni se reinterpretan ventas históricas.
INSERT INTO "ServicioRecepcion" ("tenantId","codigo","nombre","unidad","precio")
SELECT "id", 'IMPRESION', 'Impresión por hoja', 'hoja', 800 FROM "Tenant" WHERE "id" = 4;
INSERT INTO "ServicioRecepcion" ("tenantId","codigo","nombre","unidad","precio")
SELECT "id", 'EXTRA_CORTO', 'Tiempo extra: 1 a 15 minutos', 'adicional', 4000 FROM "Tenant" WHERE "id" = 4;
INSERT INTO "ServicioRecepcion" ("tenantId","codigo","nombre","unidad","precio")
SELECT "id", 'EXTRA_MEDIO', 'Tiempo extra: 16 a 30 minutos', 'adicional', 8000 FROM "Tenant" WHERE "id" = 4;
INSERT INTO "ServicioRecepcion" ("tenantId","codigo","nombre","unidad","precio")
SELECT "id", 'EXTRA_HORA', 'Tiempo extra: más de 30 minutos', 'reserva normal', NULL FROM "Tenant" WHERE "id" = 4;
ALTER TABLE "ServicioRecepcion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CargoRecepcion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PagoRecepcion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AplicacionPagoRecepcion" ENABLE ROW LEVEL SECURITY;
-- Sin políticas públicas: solo el backend autenticado debe poder operar.
COMMIT;
