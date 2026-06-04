"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setOrigin(window.location.origin);
    const fetchCodigo = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await fetch("/api/profile/referral-code", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setCodigo(data.codigo);
        } else {
          toast.error("Error al obtener el código");
        }
      } catch (error) {
        console.error(error);
        toast.error("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    fetchCodigo();
  }, []);

  const getShareUrl = () => {
    return `${origin}/registro-referidos?code=${codigo}`;
  };

  const copyToClipboard = () => {
    if (codigo) {
      navigator.clipboard.writeText(getShareUrl());
      toast.success("Enlace copiado al portapapeles");
    }
  };

  const shareCode = async () => {
    if (codigo && navigator.share) {
      try {
        await navigator.share({
          title: 'Únete con mi código',
          text: `Usa mi código de referido: ${codigo} para registrarte.`,
          url: getShareUrl()
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
        copyToClipboard();
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
    <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50">
      <Card className="w-full max-w-md shadow-lg border-blue-100">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
             <Ticket className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl text-blue-900">Tu Código de Referido</CardTitle>
          <CardDescription>
            Comparte este código o el QR para que tus referidos se registren.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
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
                value={codigo || "Generando..."}
                className="text-center text-2xl font-mono tracking-widest h-14 bg-slate-50 border-blue-200 pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full" onClick={copyToClipboard}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar Link
            </Button>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={shareCode}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartir
            </Button>
          </div>

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
