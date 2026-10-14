import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardNavigation, getActiveNavigationHref, getDashboardPageLabel } from "./dashboard-navigation";
import { isPsychologyDashboardPath } from "./psychology";

describe("navegación de Psicólogos", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ["false", "false", false, false],
    ["true", "false", true, false],
    ["false", "true", true, true],
  ])("conserva habilitación de caja %s y recepción %s", (caja, recepcion, showsCaja, showsRecepcion) => {
    vi.stubEnv("NEXT_PUBLIC_CAJA_DIARIA_ENABLED", caja);
    vi.stubEnv("NEXT_PUBLIC_RECEPCION_ENABLED", recepcion);
    const links = getDashboardNavigation("ADMIN").flatMap((menu) => menu.items.map((item) => item.href));
    expect(links.includes("/dashboard/contabilidad/caja")).toBe(showsCaja);
    expect(links.includes("/dashboard/recepcion")).toBe(showsRecepcion);
  });
  it("conserva gestión de accesos para administración", () => {
    for (const role of ["ADMIN", "SU_ADMIN", "ASESOR"] as const) {
      const links = getDashboardNavigation(role).flatMap((menu) => menu.items.map((item) => item.href));
      expect(links.includes("/dashboard/usuarios/accesos")).toBe(role !== "ASESOR");
    }
  });
  it("todos los enlaces administrativos apuntan a módulos vigentes", () => {
    const menus = getDashboardNavigation("SU_ADMIN");
    const links = menus.flatMap((menu) => menu.href ? [menu.href] : menu.items.map((item) => item.href));
    expect(links.length).toBeGreaterThan(10);
    expect(links.every(isPsychologyDashboardPath)).toBe(true);
    expect(new Set(links).size).toBe(links.length);
    expect(links).toContain("/dashboard/citas/programacion");
    expect(links).toContain("/dashboard/citas/servicios-paquetes");
  });
  it("el equipo de atención no ve administración restringida", () => {
    const menus = getDashboardNavigation("ASESOR");
    const links = menus.flatMap((menu) => menu.items);
    expect(links.some((item) => item.adminOnly)).toBe(false);
    expect(links.some((item) => item.href === "/dashboard/usuarios/aprobar")).toBe(false);
    expect(links.some((item) => item.href === "/dashboard/clientes/nuevo")).toBe(true);
    expect(menus.some((menu) => menu.key === "actividad")).toBe(false);
  });
  it("elige la ruta más específica sin activar dos secciones", () => {
    const menus = getDashboardNavigation("ADMIN");
    expect(getActiveNavigationHref("/dashboard/citas/nuevo", menus)).toBe("/dashboard/citas/nuevo");
    expect(getActiveNavigationHref("/dashboard/citas/servicios-paquetes", menus)).toBe("/dashboard/citas/servicios-paquetes");
    expect(getDashboardPageLabel("/dashboard/citas/12/editar", "ADMIN")).toBe("Citas y reservas");
    expect(getActiveNavigationHref("/dashboard/citas-otra", menus)).toBeUndefined();
  });
  it("espera una sesión con acceso al panel", () => {
    expect(getDashboardNavigation(null)).toEqual([]);
    expect(getDashboardNavigation("TECNICO")).toEqual([]);
  });
});
