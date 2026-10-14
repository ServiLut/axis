export type DashboardRole = "ADMIN" | "SU_ADMIN" | "ASESOR" | "TECNICO";
type MenuKey = "inicio" | "agenda" | "pacientes" | "equipo" | "pagos" | "mensajeria" | "actividad" | "configuracion";
export type NavigationLink = { href: string; label: string; adminOnly?: boolean };
export type NavigationMenu = { key: MenuKey; label: string; href?: string; items: NavigationLink[] };

const navigation: NavigationMenu[] = [
  { key: "inicio", label: "Inicio", href: "/dashboard", items: [] },
  { key: "agenda", label: "Agenda", items: [
    { href: "/dashboard/recepcion", label: "Recepción" },
    { href: "/dashboard/citas/programacion", label: "Agenda diaria" },
    { href: "/dashboard/citas", label: "Citas y reservas" },
    { href: "/dashboard/citas/nuevo", label: "Agendar cita o reserva" },
  ] },
  { key: "pacientes", label: "Pacientes", items: [
    { href: "/dashboard/clientes", label: "Lista de pacientes" },
    { href: "/dashboard/clientes/nuevo", label: "Registrar paciente" },
    { href: "/dashboard/clientes/referidos", label: "Referidos" },
    { href: "/dashboard/mi-codigo", label: "Mi enlace de referidos" },
  ] },
  { key: "equipo", label: "Equipo", items: [
    { href: "/dashboard/usuarios/tecnicos", label: "Psicólogos" },
    { href: "/dashboard/usuarios/asesores", label: "Equipo de atención" },
    { href: "/dashboard/usuarios/nuevo", label: "Registrar integrante", adminOnly: true },
    { href: "/dashboard/usuarios/aprobar", label: "Solicitudes de acceso", adminOnly: true },
    { href: "/dashboard/usuarios/accesos", label: "Usuarios y accesos", adminOnly: true },
  ] },
  { key: "pagos", label: "Pagos y contabilidad", items: [
    { href: "/dashboard/contabilidad/caja", label: "Caja diaria" },
    { href: "/dashboard/contabilidad/cuenta-cobro", label: "Cuentas de cobro por turnos" },
    { href: "/dashboard/contabilidad/anticipos", label: "Anticipos al equipo" },
    { href: "/dashboard/contabilidad/egresos", label: "Gastos" },
    { href: "/dashboard/contabilidad/nomina", label: "Liquidación del equipo", adminOnly: true },
    { href: "/dashboard/contabilidad/balances", label: "Balance de ingresos y gastos", adminOnly: true },
  ] },
  { key: "mensajeria", label: "WhatsApp", href: "/dashboard/mensajeria", items: [] },
  { key: "actividad", label: "Actividad del equipo", items: [
    { href: "/dashboard/monitoreo/actividad", label: "Actividad y sesiones", adminOnly: true },
    { href: "/dashboard/monitoreo/auditoria", label: "Historial de cambios", adminOnly: true },
  ] },
  { key: "configuracion", label: "Configuración", items: [
    { href: "/dashboard/configuracion/perfil", label: "Mi perfil" },
    { href: "/dashboard/citas/servicios-paquetes", label: "Terapias y paquetes", adminOnly: true },
    { href: "/dashboard/configuracion/metodos-pago", label: "Métodos de pago", adminOnly: true },
    { href: "/dashboard/configuracion/nomina", label: "Pagos del equipo", adminOnly: true },
    { href: "/dashboard/configuracion/permisos", label: "Permisos y autorizaciones", adminOnly: true },
  ] },
];

export function getDashboardNavigation(role: DashboardRole | null): NavigationMenu[] {
  if (!role || role === "TECNICO") return [];
  const isAdmin = role === "ADMIN" || role === "SU_ADMIN";
  return navigation.map((menu) => ({ ...menu, items: menu.items.filter((item) =>
    (!item.adminOnly || isAdmin) &&
    (item.href !== "/dashboard/recepcion" || process.env.NEXT_PUBLIC_RECEPCION_ENABLED === "true") &&
    (item.href !== "/dashboard/contabilidad/caja" || process.env.NEXT_PUBLIC_CAJA_DIARIA_ENABLED === "true" || process.env.NEXT_PUBLIC_RECEPCION_ENABLED === "true")
  ) })).filter((menu) => menu.href || menu.items.length);
}

export function getActiveNavigationHref(pathname: string, menus: NavigationMenu[]): string | undefined {
  return menus.flatMap((menu) => menu.href ? [{ href: menu.href }] : menu.items)
    .filter((item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function getDashboardPageLabel(pathname: string, role: DashboardRole | null): string {
  const menus = getDashboardNavigation(role);
  const href = getActiveNavigationHref(pathname, menus);
  for (const menu of menus) {
    if (menu.href === href && menu.href) return menu.label;
    const item = menu.items.find((link) => link.href === href);
    if (item) return item.label;
  }
  return "Psicólogos en Colombia";
}
