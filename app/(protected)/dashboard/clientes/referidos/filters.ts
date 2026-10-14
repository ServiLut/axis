import { getBogotaDateRange } from "@/lib/bogota-date";

type Referral = {
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  codigo: string | null;
  created_at: Date | string;
  Usuario: { nombre: string; apellido: string } | null;
};

export function filterReferrals<T extends Referral>(records: T[], searchTerm: string, startDate: string, endDate: string): { rows: T[]; error: string | null } {
  try {
    const range = getBogotaDateRange(startDate, endDate);
    const search = searchTerm.trim().toLocaleLowerCase("es");
    const rows = records.filter((record) => {
      const registered = new Date(record.created_at).getTime();
      if (range.gte && !(registered >= range.gte.getTime())) return false;
      if (range.lt && !(registered < range.lt.getTime())) return false;
      return [
        `${record.nombre || ""} ${record.apellido || ""}`,
        record.telefono || "",
        record.codigo || "",
        `${record.Usuario?.nombre || ""} ${record.Usuario?.apellido || ""}`,
      ].some((value) => value.toLocaleLowerCase("es").includes(search));
    });
    return { rows, error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Revisa el rango de fechas." };
  }
}
