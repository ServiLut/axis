import { Recepcion } from "@/components/contabilidad/recepcion";

export default function RecepcionPage() {
  if (process.env.NEXT_PUBLIC_RECEPCION_ENABLED !== "true") return <div className="p-8">
    <h1 className="text-2xl font-bold">Recepción</h1><p className="mt-3">Esta sección está pendiente de habilitación.</p></div>;
  return <Recepcion />;
}
