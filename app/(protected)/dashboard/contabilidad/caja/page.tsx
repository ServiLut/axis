import { CajaDiaria } from "@/components/contabilidad/caja-diaria";

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ citaId?: string | string[] }> }) {
  if (process.env.NEXT_PUBLIC_CAJA_DIARIA_ENABLED !== "true" && process.env.NEXT_PUBLIC_RECEPCION_ENABLED !== "true") {
    return <div className="p-8"><h1 className="text-2xl font-bold">Caja diaria</h1>
      <p className="mt-3 text-slate-600">Esta sección está pendiente de habilitación.</p></div>;
  }
  const params = await searchParams;
  return <CajaDiaria citaId={typeof params.citaId === "string" ? params.citaId : undefined} />;
}
