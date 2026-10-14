import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import {
  isPsychologyDashboardPath,
  isPsychologyTenant,
  RETIRED_DASHBOARD_PATHS,
} from "./psychology";

describe("psychology workspace", () => {
  it("accepts only the existing numeric psychology tenant", () => {
    expect(isPsychologyTenant(4)).toBe(true);
    for (const tenantId of [1, 2, 3, null, undefined, "4", NaN]) {
      expect(isPsychologyTenant(tenantId)).toBe(false);
    }
  });

  it.each(RETIRED_DASHBOARD_PATHS)("retires %s and nested URLs", (path) => {
    expect(isPsychologyDashboardPath(path)).toBe(false);
    expect(isPsychologyDashboardPath(`${path}/nuevo`)).toBe(false);
    expect(isPsychologyDashboardPath(`${path}/15/editar`)).toBe(false);
  });

  it("keeps the psychology catalog and shared patient/team sections available", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/citas",
      "/dashboard/citas/servicios-paquetes",
      "/dashboard/citas/servicios-paquetes/nuevo",
      "/dashboard/clientes",
      "/dashboard/clientes/referidos",
      "/dashboard/mi-codigo",
      "/dashboard/usuarios/tecnicos",
      "/dashboard/contabilidad/balances",
      "/dashboard/contabilidad/cuenta-cobro",
      "/dashboard/configuracion/metodos-pago",
      "/dashboard/configuracion/perfil",
    ]) {
      expect(isPsychologyDashboardPath(path)).toBe(true);
    }
  });

  it("redirects retired server routes before their pages load", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toHaveLength(RETIRED_DASHBOARD_PATHS.length);
    expect(redirects).toEqual(
      RETIRED_DASHBOARD_PATHS.map((path) => ({
        source: `${path}/:path*`,
        destination: "/dashboard",
        permanent: false,
      })),
    );
  });
});
