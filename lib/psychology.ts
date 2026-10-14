/** The existing psychology workspace. Keep historical tenant data separate. */
import { PSYCHOLOGY_TENANT_ID } from "./constants/tenants";
export { PSYCHOLOGY_TENANT_ID };
export const PSYCHOLOGY_NAME = "Psicólogos en Colombia";

export function isPsychologyTenant(tenantId: unknown): tenantId is number {
  return tenantId === PSYCHOLOGY_TENANT_ID;
}

export const RETIRED_DASHBOARD_PATHS = [
  "/dashboard/servicios",
  "/dashboard/insumos",
  "/dashboard/serv-tecnico",
  "/dashboard/servilution",
  "/dashboard/usuarios/ranking",
  "/dashboard/contabilidad/recaudo",
  "/dashboard/configuracion/empresas",
  "/dashboard/configuracion/pico-placa",
  "/dashboard/configuracion/tipos-servicio",
  "/dashboard/configuracion/zonas",
  "/dashboard/configuracion/servicios",
] as const;

export function isPsychologyDashboardPath(pathname: string): boolean {
  return !RETIRED_DASHBOARD_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
