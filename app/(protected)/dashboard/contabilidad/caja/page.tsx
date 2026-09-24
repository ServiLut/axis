import { CajaDiaria } from "@/components/contabilidad/caja-diaria";

export default function CajaPage() {
  if (process.env.NEXT_PUBLIC_CAJA_DIARIA_ENABLED !== "true") {
    return <div className="p-8"><h1 className="text-2xl font-bold">Caja diaria</h1>
      <p className="mt-3 text-slate-600">Esta sección está pendiente de habilitación.</p></div>;
  }
  return <CajaDiaria />;
}
