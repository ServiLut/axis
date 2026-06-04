"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export function useActivityMonitor(userId: number | null | undefined) {
  // Estado reactivo para la UI
  const [isIdle, setIsIdle] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  
  // Referencias para lógica interna sin re-renders en cada evento
  const isIdleRef = useRef(false);
  const lastActivityTimestamp = useRef(0);
  const idleStartTimestamp = useRef<number | null>(null);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

  // Función para reportar eventos a la API
  const logEvent = useCallback(async (tipo: string, detalles?: unknown) => {
    if (!userId) return;

    try {
      await fetch("/api/monitor/log", {
        method: "POST",
        keepalive: true, // Permite que la petición sobreviva si se cierra la pestaña
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          tipo,
          ruta: window.location.pathname,
          detalles,
        }),
      });
    } catch (error) {
      console.error("Error enviando log de actividad:", error);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const INACTIVITY_LIMIT_MINUTES = 5;
    const INACTIVITY_LIMIT_MS = INACTIVITY_LIMIT_MINUTES * 60 * 1000; 
    const THROTTLE_MS = 1000; 

    const resetInactivityTimer = () => {
      const now = Date.now();

      // Throttle: ignorar eventos si ocurrieron muy cerca del último procesado
      if (now - lastActivityTimestamp.current < THROTTLE_MS) {
        return;
      }
      lastActivityTimestamp.current = now;

      // Si el usuario estaba inactivo y vuelve a moverse
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false); // Actualizar estado reactivo
        
        // Activar notificación verde de retorno
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 3000);

        logEvent("INACTIVIDAD_FIN");

        // Calcular duración ADICIONAL de la inactividad (más allá de los 5 min iniciales)
        if (idleStartTimestamp.current) {
          const durationMs = now - idleStartTimestamp.current;
          const durationMinutes = Math.floor(durationMs / 60000);
          
          // Solo enviamos si ha pasado al menos 1 minuto adicional
          if (durationMinutes > 0) {
            logEvent("INACTIVIDAD_DETECTADA", durationMinutes);
          }
          idleStartTimestamp.current = null;
        }
      }

      // Reiniciar el timer de inactividad
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }

      inactivityTimer.current = setTimeout(() => {
        isIdleRef.current = true;
        setIsIdle(true); 
        idleStartTimestamp.current = Date.now();
        // Reportar los primeros 5 minutos primero, para que el último evento sea INACTIVIDAD_INICIO
        logEvent("INACTIVIDAD_DETECTADA", INACTIVITY_LIMIT_MINUTES).then(() => {
          logEvent("INACTIVIDAD_INICIO");
        });
      }, INACTIVITY_LIMIT_MS);
    };

    // Manejo de cambio de visibilidad (pestaña oculta/visible)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logEvent("FOCO_PERDIDO");
      } else {
        logEvent("FOCO_RECUPERADO");
        // Al recuperar foco, reseteamos el timer para evitar que se dispare inmediatamente si estaba cerca
        resetInactivityTimer();
      }
    };

    // Registrar listeners
    const activityEvents = ["mousemove", "keydown", "scroll", "click", "touchstart"];
    
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer);
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Inicializar el timer por primera vez
    resetInactivityTimer();

    // Cleanup
    return () => {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, logEvent]); 

  return { isIdle, showReconnected };
}