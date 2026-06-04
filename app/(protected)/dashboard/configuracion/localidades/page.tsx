"use client";

import { municipiosAntioquia } from "@/lib/constants/municipios";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRole } from "@/hooks/use-user-role";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function LocalidadesPage() {
  const { role, loading } = useUserRole();
  const router = useRouter();

  useEffect(() => {
    if (!loading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado. Solo administradores pueden ver localidades.");
      router.push("/dashboard");
    }
  }, [role, loading, router]);

  if (loading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Localidades de Antioquia</h1>
          <div className="text-sm text-muted-foreground">
            Total: {municipiosAntioquia.length} municipios
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(new Map(municipiosAntioquia.map(m => [m.nombre, m])).values()).map((municipio) => (
            <MunicipioCard key={municipio.nombre} municipio={municipio} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MunicipioCard({ municipio }: { municipio: typeof municipiosAntioquia[0] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="h-fit">
      <CardHeader className="p-4">
        <Button
          variant="ghost"
          className="w-full justify-between p-0 h-auto hover:bg-transparent"
          onClick={() => setIsOpen(!isOpen)}
        >
          <CardTitle className="text-lg font-medium">{municipio.nombre}</CardTitle>
          {isOpen ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      </CardHeader>
      {isOpen && (
        <CardContent className="p-4 pt-0">
          <div className="h-[200px] w-full rounded-md border p-4 overflow-y-auto">
            <ul className="space-y-2">
              {municipio.barrios.map((barrio, index) => (
                <li key={`${barrio}-${index}`} className="text-sm text-muted-foreground">
                  {barrio}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}