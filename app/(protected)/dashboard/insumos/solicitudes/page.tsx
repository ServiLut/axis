"use client";

import { useEffect, useState, useCallback } from "react";
import { getProductRequests, updateProductRequestStatus } from "../actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, User, Package } from "lucide-react";
import { toast } from "sonner";

interface ProductRequest {
  id: string | number;
  created_at: string;
  cantidad: string;
  unidadMedida: string;
  estado: "PENDIENTE" | "ACEPTADA" | "RECHAZADA";
  Usuario: {
    nombre: string;
    apellido: string;
  } | null;
  ProductosFumigacion: {
    nombre: string;
  } | null;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const data = await getProductRequests(token);
      setRequests(data as ProductRequest[]);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleStatusUpdate = async (id: string, status: "ACEPTADA" | "RECHAZADA") => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const result = await updateProductRequestStatus(token, id, status);
      if (result.success) {
        toast.success(`Solicitud ${status === "ACEPTADA" ? "aceptada" : "rechazada"} correctamente`);
        fetchRequests();
      } else {
        toast.error("Error al actualizar la solicitud");
      }
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Error al actualizar la solicitud");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACEPTADA":
        return <Badge className="bg-green-500 text-white hover:bg-green-600">Aceptada</Badge>;
      case "RECHAZADA":
        return <Badge variant="destructive">Rechazada</Badge>;
      default:
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700">Pendiente</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Solicitudes de Insumos</h1>
          <p className="text-muted-foreground">
            Gestión de peticiones de materiales de técnicos y fumigadores.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    Cargando solicitudes...
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    No hay solicitudes registradas.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{new Date(request.created_at).toLocaleDateString()}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{request.Usuario?.nombre} {request.Usuario?.apellido}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span>{request.ProductosFumigacion?.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {request.cantidad} {request.unidadMedida}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.estado)}</TableCell>
                    <TableCell className="text-right">
                      {request.estado === "PENDIENTE" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleStatusUpdate(request.id.toString(), "ACEPTADA")}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Aceptar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleStatusUpdate(request.id.toString(), "RECHAZADA")}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Rechazar
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
