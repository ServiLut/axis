-- Apply before deploying the user-access release. Additive and idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;
COMMIT;

-- Suspend/reactivate/password reset increments authVersion in the same transaction
-- as its audit record. Never backfill historical SesionActividad.fechaFin to revoke
-- access: that would destroy the distinction between logout and administration.
