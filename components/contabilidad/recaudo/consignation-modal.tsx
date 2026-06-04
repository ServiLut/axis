"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Loader2, DollarSign } from "lucide-react";
import { 
  getPendingCashOrders, 
  registerConsignation, 
  registerAdvanceFromOrders,
  uploadConsignationProof,
  PendingOrder 
} from "@/app/(protected)/dashboard/contabilidad/recaudo/actions";

interface ConsignationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tecnicoId: number | null;
  tecnicoNombre: string;
}

export function ConsignationModal({
  isOpen,
  onClose,
  tecnicoId,
  tecnicoNombre,
}: ConsignationModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmiting] = useState(false);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  
  // Mode State
  const [isAdvance, setIsAdvance] = useState(false);

  // Form State
  const [amount, setAmount] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState(""); // Nuevo campo para adelanto parcial
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [observation, setObservacion] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadOrders = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (token && tecnicoId) {
        try {
          const res = await getPendingCashOrders(token, tecnicoId);
          if (!ignore) {
            if (res.ordenes) {
              setOrders(res.ordenes);
              setSelectedOrders(res.ordenes.map(o => o.id));
              
              // Initialize amount with total of all orders
              const total = res.ordenes.reduce((sum, o) => sum + o.valorPagado, 0);
              setAmount(total.toString());
              setAdvanceAmount("");
              setFile(null);
            } else {
              toast.error(res.error || "Error al cargar órdenes");
            }
          }
        } catch (error) {
          console.error(error);
          toast.error("Error de conexión");
        }
      }
      if (!ignore) setLoading(false);
    };

    if (isOpen && tecnicoId) {
      loadOrders();
    }

    return () => { ignore = true; };
  }, [isOpen, tecnicoId]);

  const calculateTotal = (selectedIds: number[], allOrders: PendingOrder[]) => {
      return allOrders
        .filter(o => selectedIds.includes(o.id))
        .reduce((sum, o) => sum + o.valorPagado, 0);
  };

  const toggleOrder = (id: number) => {
    const newSelection = selectedOrders.includes(id) 
        ? selectedOrders.filter(o => o !== id) 
        : [...selectedOrders, id];
    
    setSelectedOrders(newSelection);
    setAmount(calculateTotal(newSelection, orders).toString());
    setAdvanceAmount("");
  };

  const toggleAll = () => {
    let newSelection: number[] = [];
    if (selectedOrders.length !== orders.length) {
      newSelection = orders.map(o => o.id);
    }
    
    setSelectedOrders(newSelection);
    setAmount(calculateTotal(newSelection, orders).toString());
    setAdvanceAmount("");
  };

  const totalSelected = calculateTotal(selectedOrders, orders);

  // La diferencia ahora contempla lo consignado + lo que se toma como adelanto
  const difference = (Number(amount) || 0) + (Number(advanceAmount) || 0) - totalSelected;

  const handleSubmit = async () => {
    if (!amount || !date) {
      toast.error("Complete el monto y la fecha");
      return;
    }
    
    if (!isAdvance && !bank) {
        toast.error("Ingrese el Banco o Medio de pago");
        return;
    }

    if (selectedOrders.length === 0) {
        toast.error("Debe seleccionar al menos un servicio");
        return;
    }

    setSubmiting(true);
    const token = localStorage.getItem("token");
    if (token && tecnicoId) {
      let res;
      
      if (isAdvance) {
        res = await registerAdvanceFromOrders(token, tecnicoId, {
            monto: Number(amount),
            ordenesIds: selectedOrders,
            razon: observation || "Adelanto generado desde recaudo",
            fecha: new Date(date)
        });
      } else {
        let uploadedPath: string | undefined;

        if (file) {
            const formData = new FormData();
            formData.append("file", file);
            
            const uploadRes = await uploadConsignationProof(token, formData);
            if (uploadRes.error) {
                toast.error(uploadRes.error);
                setSubmiting(false);
                return;
            }
            uploadedPath = uploadRes.path;
        }

        res = await registerConsignation(token, tecnicoId, {
            monto: Number(amount),
            adelanto: Number(advanceAmount) || 0,
            banco: bank,
            referencia: reference,
            fecha: new Date(date),
            observacion: observation,
            ordenesIds: selectedOrders,
            comprobantePath: uploadedPath
        });
      }

      if (res.success) {
        toast.success(res.message);
        onClose();
      } else {
        toast.error(res.error);
      }
    }
    setSubmiting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>
            {isAdvance ? "Registrar Anticipo de Nómina" : "Registrar Consignación"} - {tecnicoNombre}
          </DialogTitle>
          <DialogDescription>
            {isAdvance 
                ? "El dinero recaudado se registrará como un adelanto para el técnico."
                : "Ingrese los detalles de la transferencia bancaria o entrega de efectivo."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Formulario */}
            <div className="space-y-4 border p-4 rounded-lg bg-slate-50 h-fit">
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                <Checkbox 
                    id="mode-advance" 
                    checked={isAdvance}
                    onCheckedChange={(c) => {
                        setIsAdvance(c as boolean);
                        setAdvanceAmount("");
                        setFile(null);
                    }}
                />
                <Label htmlFor="mode-advance" className="cursor-pointer font-medium text-indigo-700">
                    Registrar como Anticipo / Adelanto
                </Label>
              </div>

              <h3 className="font-medium text-slate-900 flex items-center pt-2">
                <DollarSign className="h-4 w-4 mr-2" />
                {isAdvance ? "Detalles del Anticipo" : "Datos de Transferencia"}
              </h3>
              
              <div className="grid gap-2">
                <Label>Monto {isAdvance ? "Adelantado" : "Transferido"}</Label>
                <Input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  placeholder="0"
                  className="font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!isAdvance && (
                    <div className="grid gap-2">
                        <Label>Banco / Medio</Label>
                        <Input 
                            value={bank} 
                            onChange={e => setBank(e.target.value)} 
                            placeholder="Ej. Bancolombia"
                        />
                    </div>
                )}
                <div className="grid gap-2">
                    <Label>Fecha</Label>
                    <Input 
                        type="date" 
                        value={date} 
                        onChange={e => setDate(e.target.value)} 
                    />
                </div>
              </div>

              {!isAdvance && (
                  <div className="grid gap-2">
                    <Label>Referencia (Opcional)</Label>
                    <Input 
                        value={reference} 
                        onChange={e => setReference(e.target.value)} 
                        placeholder="Ref. Transacción"
                    />
                  </div>
              )}

              {!isAdvance && (
                  <div className="grid gap-2">
                    <Label>Comprobante (Opcional)</Label>
                    <Input 
                        type="file" 
                        accept="image/*,.pdf"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </div>
              )}

              <div className="grid gap-2">
                <Label>{isAdvance ? "Motivo / Razón" : "Observación"}</Label>
                <Textarea 
                    value={observation} 
                    onChange={e => setObservacion(e.target.value)} 
                    placeholder={isAdvance ? "Ej. Adelanto de quincena" : "Notas adicionales..."}
                    className="h-20"
                />
              </div>

              {!isAdvance && (
                  <div className="grid gap-2 pt-2 border-t border-slate-200">
                    <Label className="text-indigo-600 font-bold">Anticipo / Adelanto (Opcional)</Label>
                    <Input 
                        type="number"
                        value={advanceAmount} 
                        onChange={e => setAdvanceAmount(e.target.value)} 
                        placeholder="Monto no consignado que queda como adelanto"
                        className="border-indigo-200 focus:border-indigo-400"
                    />
                    <p className="text-[10px] text-slate-500">
                        Use este campo si el técnico no consignó el total y el resto se tomará de su nómina.
                    </p>
                  </div>
              )}
            </div>

            {/* Lista de Servicios */}
            <div className="space-y-4 flex flex-col h-full">
               <div className="flex justify-between items-center">
                 <h3 className="font-medium text-slate-900">Servicios (Origen del Dinero)</h3>
                 <span className="text-xs text-slate-500">{selectedOrders.length} seleccionados</span>
               </div>

               <div className="border rounded-md flex-1 overflow-auto bg-white min-h-[300px]">
                 {loading ? (
                   <div className="flex justify-center items-center h-full">
                     <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                   </div>
                 ) : orders.length === 0 ? (
                   <div className="flex justify-center items-center h-full text-slate-500 text-sm">
                     No hay órdenes pendientes en efectivo.
                   </div>
                 ) : (
                   <Table>
                     <TableHeader className="bg-slate-50 sticky top-0 z-10">
                       <TableRow>
                         <TableHead className="w-[40px]">
                           <Checkbox 
                             checked={orders.length > 0 && selectedOrders.length === orders.length}
                             onCheckedChange={toggleAll}
                           />
                         </TableHead>
                         <TableHead>Fecha</TableHead>
                         <TableHead>Cliente</TableHead>
                         <TableHead className="text-right">Valor</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {orders.map((order) => (
                         <TableRow key={order.id} className={selectedOrders.includes(order.id) ? "bg-blue-50/50" : ""}>
                           <TableCell>
                             <Checkbox 
                               checked={selectedOrders.includes(order.id)}
                               onCheckedChange={() => toggleOrder(order.id)}
                             />
                           </TableCell>
                           <TableCell className="text-xs">
                             {order.fechaVisita ? format(new Date(order.fechaVisita), "dd/MM/yy", { locale: es }) : "-"}
                             <div className="text-[10px] text-slate-400">{order.numeroOrden || `INT-${order.id}`}</div>
                           </TableCell>
                           <TableCell className="text-xs">
                             <div className="font-medium truncate max-w-[120px]" title={order.clienteNombre}>{order.clienteNombre}</div>
                             <div className="text-slate-500 truncate max-w-[120px]" title={order.direccion}>{order.direccion}</div>
                           </TableCell>
                           <TableCell className="text-right text-xs font-medium">
                             ${order.valorPagado.toLocaleString()}
                           </TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 )}
               </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50">
            <div className="w-full flex justify-between items-center">
                <div className="flex flex-col text-sm">
                    <div className="flex gap-4">
                        <span>Total Seleccionado: <span className="font-bold">${totalSelected.toLocaleString()}</span></span>
                        <span className={difference < 0 ? "text-red-600" : difference > 0 ? "text-green-600" : "text-slate-600"}>
                            Diferencia: <span className="font-bold">${difference.toLocaleString()}</span>
                        </span>
                    </div>
                    {advanceAmount && Number(advanceAmount) > 0 && (
                        <p className="text-[10px] text-indigo-600 font-medium">
                            Se registrará un anticipo por ${Number(advanceAmount).toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={submitting || loading} className={isAdvance ? "bg-indigo-600 hover:bg-indigo-700" : ""}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isAdvance ? "Confirmar Anticipo" : "Registrar Liquidación"}
                    </Button>
                </div>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
