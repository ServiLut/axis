"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  User,
  Building2,
  Shield,
  Lock,
  Mail,
  Phone,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUsuario, getEmpresasOptions } from "../actions";
import { useUserRole } from "@/hooks/use-user-role";

interface Empresa {
  id: number;
  nombre: string;
}

export default function NuevoUsuarioPage() {
  const router = useRouter();
  const { role, loading: roleLoading } = useUserRole();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    tipoDocumento: "CC",
    numeroDocumento: "",
    telefono: "",
    username: "",
    email: "",
    password: "",
    rol: "TECNICO",
    empresaId: "",
    activo: true,
  });

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error(
        "Acceso denegado. Solo administradores pueden crear usuarios.",
      );
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    const fetchOptions = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }
      const res = await getEmpresasOptions(token);
      if (res.empresas) {
        setEmpresas(res.empresas);
      }
    };

    if (role === "ADMIN" || role === "SU_ADMIN") {
      fetchOptions();
    }
  }, [router, role]);

  if (roleLoading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key === "activo") {
        if (value) data.append(key, "on");
      } else if (key === "empresaId" && value === "null") {
        data.append(key, "");
      } else {
        data.append(key, value.toString());
      }
    });

    const result = await createUsuario(token, data);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      // Redirigir a la lista de usuarios (cuando exista) o limpiar
      // Por ahora redirigimos atrás o a un dashboard
      router.back();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5 text-slate-500" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Nuevo Usuario
              </h1>
              <p className="text-sm text-slate-600">
                Registra un nuevo usuario en el sistema
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Información Personal */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-2">
                <User className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Información Personal
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="nombre">
                    Nombres <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nombre"
                    placeholder="Ej. Juan Andrés"
                    value={formData.nombre}
                    onChange={(e) => handleChange("nombre", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">
                    Apellidos <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="apellido"
                    placeholder="Ej. Pérez López"
                    value={formData.apellido}
                    onChange={(e) => handleChange("apellido", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipoDocumento">Tipo Documento</Label>
                  <Select
                    value={formData.tipoDocumento}
                    onValueChange={(val) => handleChange("tipoDocumento", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                      <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                      <SelectItem value="NIT">NIT</SelectItem>
                      <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numeroDocumento">Número Documento</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="numeroDocumento"
                      className="pl-9"
                      placeholder="Ej. 123456789"
                      value={formData.numeroDocumento}
                      onChange={(e) =>
                        handleChange("numeroDocumento", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="telefono"
                      className="pl-9"
                      placeholder="Ej. 300 123 4567"
                      value={formData.telefono}
                      onChange={(e) => handleChange("telefono", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Datos de Cuenta */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-2">
                <Lock className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Datos de la Cuenta
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="username">
                    Usuario <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="username"
                    placeholder="Ej. jperez"
                    value={formData.username}
                    onChange={(e) => handleChange("username", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Correo Electrónico <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      className="pl-9"
                      placeholder="juan.perez@empresa.com"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    Contraseña <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    required
                    minLength={6}
                  />
                  <p className="text-xs text-slate-500">Mínimo 6 caracteres</p>
                </div>
              </div>
            </div>

            {/* Configuración y Permisos */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Permisos y Asignación
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="rol">
                    Rol <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.rol}
                    onValueChange={(val) => handleChange("rol", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SU_ADMIN">Super Administrador</SelectItem>
                      <SelectItem value="ADMIN">Administrador</SelectItem>
                      <SelectItem value="ASESOR">Asesor</SelectItem>
                      <SelectItem value="TECNICO">Técnico</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Define el nivel de acceso al sistema.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa Asociada</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Select
                      value={formData.empresaId}
                      onValueChange={(val) => handleChange("empresaId", val)}
                    >
                      <SelectTrigger className="pl-9">
                        <SelectValue placeholder="Seleccione una empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {empresas.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {emp.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-slate-500">
                    Empresa a la que pertenece el usuario.
                  </p>
                  <p className="text-xs text-slate-500">
                    Si es un asesor, cualquier empresa esta bien.
                  </p>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <div className="flex items-center space-x-2 bg-slate-50 p-4 rounded-md border border-slate-100">
                    <Checkbox
                      id="activo"
                      checked={formData.activo}
                      onCheckedChange={(checked) =>
                        handleChange("activo", checked)
                      }
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="activo"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Usuario Activo
                      </label>
                      <p className="text-sm text-muted-foreground">
                        Si está desactivado, el usuario no podrá ingresar al
                        sistema.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    <span>Guardar Usuario</span>
                  </div>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
