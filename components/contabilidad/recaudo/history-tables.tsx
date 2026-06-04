"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Edit2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { 
  ConsignacionHistoryItem, 
  DeclaracionHistoryItem, 
  updateConsignacion, 
  updateDeclaracion 
} from "@/app/(protected)/dashboard/contabilidad/recaudo/actions";

interface ConsignacionHistoryTableProps {
  data: ConsignacionHistoryItem[];
  onRefresh: () => void;
}

export function ConsignacionHistoryTable({ data, onRefresh }: ConsignacionHistoryTableProps) {
  const [editingItem, setEditingItem] = useState<ConsignacionHistoryItem | null>(null);
  const [viewingServices, setViewingServices] = useState<ConsignacionHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Edit State
  const [status, setStatus] = useState("");
  const [observation, setObservation] = useState("");

  const handleEdit = (item: ConsignacionHistoryItem) => {
    setEditingItem(item);
    setStatus(item.estado);
    setObservation(item.observacion || "");
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    if (token) {
        const res = await updateConsignacion(token, editingItem.id, { 
            estado: status as "PENDIENTE" | "VALIDADA" | "OBSERVADA", 
            observacion: observation 
        });
        if (res.success) {
            toast.success("Actualizado correctamente");
            setEditingItem(null);
            onRefresh();
        } else {
            toast.error(res.error);
        }
    }
    setLoading(false);
  };

  return (
    <>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Servicios</TableHead>
              <TableHead>Diferencia</TableHead>
              <TableHead>Banco/Ref</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Evidencia</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                        No hay historial de consignaciones.
                    </TableCell>
                </TableRow>
            ) : (
                data.map((item) => (
                <TableRow key={item.id}>
                    <TableCell className="text-sm">
                    {format(new Date(item.fecha), "dd MMM yyyy", { locale: es })}
                    </TableCell>
                    <TableCell className="font-medium">{item.tecnicoNombre}</TableCell>
                    <TableCell className="font-bold">${item.valor.toLocaleString()}</TableCell>
                    <TableCell>
                        <div 
                          className="flex flex-col gap-1 cursor-pointer hover:opacity-80"
                          onClick={() => setViewingServices(item)}
                        >
                            <Badge variant="outline" className="w-fit text-[10px] py-0">
                                {item.servicios?.length || 0} {(item.servicios?.length || 0) === 1 ? 'servicio' : 'servicios'}
                            </Badge>
                            <div className="text-[10px] text-slate-500 max-w-[150px] truncate">
                                {item.servicios?.map(s => s.numeroOrden || `#${s.id}`).join(", ") || "N/A"}
                            </div>
                        </div>
                    </TableCell>
                    <TableCell>
                        {item.diferencia ? (
                            <span className={item.diferencia < 0 ? "text-red-600 font-bold" : "text-green-600"}>
                                ${item.diferencia.toLocaleString()}
                            </span>
                        ) : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                        {item.banco} <br /> {item.referencia}
                    </TableCell>
                    <TableCell>
                    <Badge variant={item.estado === "VALIDADA" ? "default" : item.estado === "OBSERVADA" ? "destructive" : "secondary"}>
                        {item.estado}
                    </Badge>
                    </TableCell>
                    <TableCell>
                        {item.comprobantePath && item.comprobantePath !== "PENDIENTE_UPLOAD" ? (
                            <a 
                                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comprobantePago/${item.comprobantePath}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-blue-600 hover:underline flex items-center text-xs"
                            >
                                Ver <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                        ) : (
                            <span className="text-xs text-slate-400">Sin archivo</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    </TableCell>
                </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal para ver Servicios */}
      <Dialog open={!!viewingServices} onOpenChange={(open) => !open && setViewingServices(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Servicios de la Consignación #{viewingServices?.id}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingServices?.servicios?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.numeroOrden || `#${s.id}`}</TableCell>
                      <TableCell className="text-right font-bold">${s.valor.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell>Total Cubierto</TableCell>
                    <TableCell className="text-right">
                      ${viewingServices?.servicios?.reduce((sum, s) => sum + s.valor, 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingServices(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Consignación #{editingItem?.id}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDIENTE">PENDIENTE</SelectItem>
                  <SelectItem value="VALIDADA">VALIDADA</SelectItem>
                  <SelectItem value="OBSERVADA">OBSERVADA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Observación</Label>
              <Textarea value={observation} onChange={(e) => setObservation(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface DeclaracionHistoryTableProps {
  data: DeclaracionHistoryItem[];
  onRefresh: () => void;
}

export function DeclaracionHistoryTable({ data, onRefresh }: DeclaracionHistoryTableProps) {
  const [editingItem, setEditingItem] = useState<DeclaracionHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [observacion, setObservacion] = useState("");
  const [consignado, setConsignado] = useState(false);

  const handleEdit = (item: DeclaracionHistoryItem) => {
    setEditingItem(item);
    setObservacion(item.observacion || "");
    setConsignado(item.consignado);
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    if (token) {
        const res = await updateDeclaracion(token, editingItem.id, { observacion, consignado });
        if (res.success) {
            toast.success("Declaración actualizada");
            setEditingItem(null);
            onRefresh();
        } else {
            toast.error(res.error);
        }
    }
    setLoading(false);
  };

  return (
    <>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Valor Declarado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Evidencia</TableHead>
              <TableHead>Observación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        No hay declaraciones de efectivo registradas.
                    </TableCell>
                </TableRow>
            ) : (
                data.map((item) => (
                <TableRow key={item.id}>
                    <TableCell className="text-sm">
                    {format(new Date(item.fecha), "dd MMM yyyy HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell className="font-medium">{item.tecnicoNombre}</TableCell>
                    <TableCell>{item.ordenNumero}</TableCell>
                    <TableCell className="font-bold text-emerald-600">
                        ${item.valor.toLocaleString()}
                    </TableCell>
                    <TableCell>
                    <Badge variant={item.consignado ? "default" : "outline"} className={item.consignado ? "bg-green-600" : "text-orange-600 border-orange-200 bg-orange-50"}>
                        {item.consignado ? "Consignado" : "Pendiente"}
                    </Badge>
                    </TableCell>
                    <TableCell>
                        {item.evidenciaPath ? (
                             <a 
                             href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/evidenciaDeclaracion/${item.evidenciaPath}`} 
                             target="_blank" 
                             rel="noreferrer"
                             className="text-blue-600 hover:underline flex items-center text-xs"
                         >
                             Ver Foto <ExternalLink className="h-3 w-3 ml-1" />
                         </a>
                        ) : (
                            <span className="text-xs text-slate-400">No hay foto</span>
                        )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={item.observacion || ""}>
                        {item.observacion || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    </TableCell>
                </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Declaración #{editingItem?.id}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
                <input 
                    type="checkbox" 
                    id="consignado" 
                    checked={consignado} 
                    onChange={(e) => setConsignado(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
                <Label htmlFor="consignado">Marcar como Consignado/Procesado</Label>
            </div>
            <div className="grid gap-2">
              <Label>Observación (Admin)</Label>
              <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}