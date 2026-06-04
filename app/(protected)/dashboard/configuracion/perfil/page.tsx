"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, Save, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UsuarioPerfil {
  id: number;
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  rol: string;
  CuentasPago?: {
    id: string;
    banco: string | null;
    tipoCuenta: string | null;
    numeroCuenta: string | null;
    valorHora: number | null;
  }[];
}

export default function PerfilPage() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [usuario, setUsuario] = useState<UsuarioPerfil | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    nombre: "",
    apellido: "",
    telefono: "",
    tipoDocumento: "",
    numeroDocumento: "",
    password: "",
    cuentaPago: {
      banco: "",
      tipoCuenta: "",
      numeroCuenta: "",
      valorHora: "",
    }
  });

  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      try {
        const response = await fetch("/api/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || "Error cargando perfil");
          if (response.status === 401) router.push("/sign-in");
        } else if (data.usuario) {
          setUsuario(data.usuario);
          const cuenta = data.usuario.CuentasPago?.[0] || {};
          setFormData({
            username: data.usuario.username || "",
            email: data.usuario.email || "",
            nombre: data.usuario.nombre || "",
            apellido: data.usuario.apellido || "",
            telefono: data.usuario.telefono || "",
            tipoDocumento: data.usuario.tipoDocumento || "",
            numeroDocumento: data.usuario.numeroDocumento || "",
            password: "",
            cuentaPago: {
              banco: cuenta.banco || "",
              tipoCuenta: cuenta.tipoCuenta || "",
              numeroCuenta: cuenta.numeroCuenta || "",
              valorHora: cuenta.valorHora ? cuenta.valorHora.toString() : "",
            }
          });
        }
      } catch {
        toast.error("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "Error al actualizar perfil");
      } else {
        toast.success(result.message);
        // Clear password field after successful update
        setFormData(prev => ({ ...prev, password: "" }));
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setIsSaving(false);
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
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto py-10 px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-blue-100 rounded-full">
            <User className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Mi Perfil</h1>
            <p className="text-slate-500">Gestiona tu información personal y de cuenta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6">
            {/* Personal Information Card */}
            <Card>
              <CardHeader>
                <CardTitle>Información Personal</CardTitle>
                <CardDescription>
                  Actualiza tus datos de identificación y contacto.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input
                    id="apellido"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipoDocumento">Tipo de Documento</Label>
                  <Select
                    value={formData.tipoDocumento}
                    onValueChange={(val) => setFormData({ ...formData, tipoDocumento: val })}
                  >
                    <SelectTrigger id="tipoDocumento">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                      <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                      <SelectItem value="NIT">NIT</SelectItem>
                      <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                      <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numeroDocumento">Número de Documento</Label>
                  <Input
                    id="numeroDocumento"
                    value={formData.numeroDocumento}
                    onChange={(e) => setFormData({ ...formData, numeroDocumento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono / Celular</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Information Card */}
            <Card>
              <CardHeader>
                <CardTitle>Información Bancaria</CardTitle>
                <CardDescription>
                  Cuenta para recibir pagos de nómina.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="banco">Banco</Label>
                  <Select
                    value={formData.cuentaPago.banco}
                    onValueChange={(val) => setFormData({ ...formData, cuentaPago: { ...formData.cuentaPago, banco: val } })}
                  >
                    <SelectTrigger id="banco">
                      <SelectValue placeholder="Seleccione banco..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bancolombia">Bancolombia</SelectItem>
                      <SelectItem value="Nequi">Nequi</SelectItem>
                      <SelectItem value="Davivienda">Davivienda</SelectItem>
                      <SelectItem value="PSE">PSE</SelectItem>
                      <SelectItem value="PayPal">PayPal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipoCuenta">Tipo de Cuenta</Label>
                   <Select
                    value={formData.cuentaPago.tipoCuenta}
                    onValueChange={(val) => setFormData({ ...formData, cuentaPago: { ...formData.cuentaPago, tipoCuenta: val } })}
                  >
                    <SelectTrigger id="tipoCuenta">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AHORROS">Ahorros</SelectItem>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numeroCuenta">Número de Cuenta</Label>
                  <Input
                    id="numeroCuenta"
                    value={formData.cuentaPago.numeroCuenta}
                    onChange={(e) => setFormData({ ...formData, cuentaPago: { ...formData.cuentaPago, numeroCuenta: e.target.value } })}
                    placeholder="Ej: 1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valorHora">Valor Hora</Label>
                  <Input
                    id="valorHora"
                    type="number"
                    value={formData.cuentaPago.valorHora}
                    onChange={(e) => setFormData({ ...formData, cuentaPago: { ...formData.cuentaPago, valorHora: e.target.value } })}
                    placeholder="Ej: 5000"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Account Information Card */}
            <Card>
              <CardHeader>
                <CardTitle>Información de Cuenta</CardTitle>
                <CardDescription>
                  Gestiona tus credenciales de acceso.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="username">Usuario</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Dejar en blanco para mantener la actual"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rol (No editable)</Label>
                  <div className="flex items-center h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed">
                    <Lock className="h-4 w-4 mr-2 opacity-50" />
                    {usuario?.rol}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 flex justify-end p-4 rounded-b-lg border-t border-slate-100">
                <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
}
