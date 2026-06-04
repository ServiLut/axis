"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function RegistrationForm() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || "";

  const [step, setStep] = useState<"code" | "details" | "success">("code");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
  const [formData, setFormData] = useState({
    codigoReferido: initialCode,
    nombre: "",
    apellido: "",
    telefono: ""
  });
  
  const [referrer, setReferrer] = useState<{ nombre: string; apellido: string } | null>(null);

  useEffect(() => {
    if (initialCode) {
      verifyCode(initialCode);
    }
  }, [initialCode]);

  const verifyCode = async (code: string) => {
    if (!code || code.length < 4) return;
    
    setVerifying(true);
    try {
      const res = await fetch("/api/referidos/validate", {
        method: "POST",
        body: JSON.stringify({ codigo: code }),
        headers: { "Content-Type": "application/json" }
      });
      
      const data = await res.json();
      if (data.valid) {
        setReferrer(data.usuario);
        setStep("details");
        toast.success(`Código válido de ${data.usuario.nombre}`);
      } else {
        setReferrer(null);
        toast.error("Código no válido");
      }
    } catch {
      toast.error("Error al validar código");
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/referidos/register", {
        method: "POST",
        body: JSON.stringify(formData),
        headers: { "Content-Type": "application/json" }
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStep("success");
        toast.success("Registro exitoso");
      } else {
        toast.error(data.error || "Error al registrar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <Card className="w-full max-w-md shadow-xl border-green-100">
        <CardContent className="pt-10 pb-10 flex flex-col items-center text-center space-y-4">
          <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">¡Registro Exitoso!</h2>
          <p className="text-slate-600 max-w-xs">
            Gracias por registrarte. Pronto nos pondremos en contacto contigo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Registro de Referido</CardTitle>
        <CardDescription className="text-center">
          Ingresa tus datos para completar el registro
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {step === "code" && (
            <div className="space-y-4">
               <div className="space-y-2">
                 <Label htmlFor="codigo">Código de Referido</Label>
                 <Input 
                   id="codigo" 
                   placeholder="Ej: ABC1234" 
                   value={formData.codigoReferido}
                   onChange={(e) => setFormData({...formData, codigoReferido: e.target.value.toUpperCase()})}
                   className="uppercase text-center text-lg tracking-widest"
                 />
               </div>
               <Button 
                 type="button" 
                 className="w-full" 
                 onClick={() => verifyCode(formData.codigoReferido)}
                 disabled={verifying || !formData.codigoReferido}
               >
                 {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                 Validar Código
               </Button>
            </div>
          )}

          {step === "details" && referrer && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Alert className="bg-blue-50 border-blue-200">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800">Referido por:</AlertTitle>
                <AlertDescription className="text-blue-700 font-medium">
                  {referrer.nombre} {referrer.apellido}
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input 
                    id="nombre" 
                    required 
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input 
                    id="apellido" 
                    required 
                    value={formData.apellido}
                    onChange={(e) => setFormData({...formData, apellido: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input 
                  id="telefono" 
                  type="tel" 
                  required 
                  value={formData.telefono}
                  onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                />
              </div>

              <div className="pt-2">
                 <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Registrarme"}
                 </Button>
                 <Button 
                   type="button" 
                   variant="ghost" 
                   className="w-full mt-2" 
                   onClick={() => { setStep("code"); setReferrer(null); }}
                 >
                   Cambiar código
                 </Button>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
       <Suspense fallback={<div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500"/></div>}>
          <RegistrationForm />
       </Suspense>
    </div>
  );
}
