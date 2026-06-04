"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function RealtimeNotifications() {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-notifications")
      .on("broadcast", { event: "service-arrival" }, (payload) => {
        console.log("Arrival notification received:", payload);
        const { serviceId, technicianName, clientName, clientPhone } =
          payload.payload;
        toast.info("Llegada registrada", {
          description: (
            <span
              className="text-base block mt-1 dark:text-stone-100"
              style={{ color: "var(--toast-desc-color, #1c1917)" }}
            >
              Técnico {technicianName || "Desconocido"} llegó al servicio #
              {serviceId} de {clientName || "Cliente"}.
              <style jsx global>{`
                :root {
                  --toast-desc-color: #1c1917;
                }
                .dark {
                  --toast-desc-color: #f5f5f4;
                }
              `}</style>
            </span>
          ),
          action: {
            label: "Ver",
            onClick: () =>
              router.push(
                `/dashboard/servicios?term=${clientPhone || serviceId}`,
              ),
          },
          duration: 10000,
        });
      })
      .on("broadcast", { event: "service-finalized" }, (payload) => {
        console.log("Finalize notification received:", payload);
        const { serviceId, technicianName, clientName, clientPhone } =
          payload.payload;
        toast.success("Servicio finalizado", {
          description: (
            <span
              className="text-base block mt-1 dark:text-stone-100"
              style={{ color: "var(--toast-desc-color, #1c1917)" }}
            >
              Técnico {technicianName || "Desconocido"} finalizó el servicio #
              {serviceId} de {clientName || "Cliente"}.
            </span>
          ),
          action: {
            label: "Ver",
            onClick: () =>
              router.push(
                `/dashboard/servicios?term=${clientPhone || serviceId}`,
              ),
          },
          duration: 10000,
        });
      })
      .on("broadcast", { event: "product-requested" }, (payload) => {
        console.log("Product request notification received:", payload);
        const { technicianName, productName, amount, unit } = payload.payload;
        toast.info("Solicitud de insumo", {
          description: (
            <span
              className="text-base block mt-1 dark:text-stone-100"
              style={{ color: "var(--toast-desc-color, #1c1917)" }}
            >
              Técnico {technicianName || "Desconocido"} solicitó {amount} {unit}{" "}
              de {productName}.
            </span>
          ),
          action: {
            label: "Ver",
            onClick: () => router.push(`/dashboard/insumos/solicitudes`),
          },
          duration: 10000,
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
