"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import QRCode from "react-qr-code";

export default function MiCodigoPage() {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchCodigo = useCallback(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);
      setCodigo(null);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");

        const res = await fetch("/api/profile/referral-code", {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (controller.signal.aborted) return;
          if (typeof data.codigo !== "string" || !data.codigo) throw new Error("No se recibió tu código. Intenta nuevamente.");
          setCodigo(data.codigo);
        } else {
          throw new Error("No se pudo cargar tu enlace de referidos. Intenta nuevamente.");
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo conectar con Axis.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void fetchCodigo();
    return () => controllerRef.current?.abort();
  }, [fetchCodigo]);

  const getShareUrl = () => {
    return `${origin}/registro-referidos?code=${codigo}`;
  };

  const copyToClipboard = async () => {
    if (!codigo || !origin || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(getShareUrl());
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar. Selecciona y copia el enlace que aparece en esta página.");
    } finally {
      setCopying(false);
    }
  };

  const shareCode = async () => {
    if (codigo && navigator.share) {
      try {
        await navigator.share({
          title: 'Psicólogos en Colombia',
          text: `Registra tus datos para que Psicólogos en Colombia te contacte. Mi código de referido es ${codigo}.`,
          url: getShareUrl()
        });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          toast.error("No se pudo compartir. Puedes copiar el enlace.");
        }
      }
    } else {
        await copyToClipboard();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto bg-slate-50 p-6">
      <Card className="my-auto w-full max-w-md shrink-0 shadow-lg border-blue-100">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
             <Ticket className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl text-blue-900">Tu enlace de referidos</CardTitle>
          <CardDescription>
            Comparte el enlace o el QR con quienes deseen recibir información de Psicólogos en Colombia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {error && (
            <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p>{error}</p>
              <Button type="button" variant="outline" onClick={() => void fetchCodigo()}>Reintentar</Button>
            </div>
          )}
          <div className="flex flex-col items-center justify-center space-y-4">
             {codigo && origin && (
               <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                 <QRCode
                   value={getShareUrl()}
                   size={180}
                   level="H"
                 />
               </div>
             )}
          </div>

          <div className="flex flex-col space-y-2">
            <Label htmlFor="code" className="text-center text-slate-500">Tu código único</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                 <Ticket className="h-5 w-5 text-slate-400" />
              </div>
              <Input
                id="code"
                readOnly
                value={codigo || "No disponible"}
                className="text-center text-2xl font-mono tracking-widest h-14 bg-slate-50 border-blue-200 pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full" disabled={!codigo || !origin || copying || !!error} onClick={() => void copyToClipboard()}>
              <Copy className="mr-2 h-4 w-4" />
              {copying ? "Copiando…" : "Copiar enlace"}
            </Button>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={!codigo || !origin || !!error} onClick={shareCode}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartir
            </Button>
          </div>

          {codigo && origin && !error && (
            <div className="space-y-2">
              <Label htmlFor="referral-link">Enlace de registro</Label>
              <Input id="referral-link" readOnly value={getShareUrl()} onFocus={(event) => event.currentTarget.select()} />
            </div>
          )}

          <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
             <p className="text-center">
               Tus referidos pueden escanear el QR o ingresar el código en el registro.
             </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
