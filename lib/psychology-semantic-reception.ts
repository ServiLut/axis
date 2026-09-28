import {decideReception,type ReceptionEvent,type ReceptionState,type ReceptionTemplates,type ReceptionResult} from './psychology-reception';
import type {Understanding} from './psychology-ai';

/** AI chooses intent; approved templates and persisted state control prices and actions. */
export function semanticReception(event:ReceptionEvent,stage:string,state:ReceptionState,templates:ReceptionTemplates,policy:string,u:Understanding|null):ReceptionResult{
 const baseline=decideReception(event,stage,state,templates,policy);
 if(event.fromMe||!u||baseline.handoff==='Atención humana urgente')return baseline;
 if(u.intent==='urgent')return decideReception({...event,text:'me quiero morir'},stage,state,templates,policy);
 if(stage==='HUMAN')return {stage,state,messages:[]};
 if(u.intent==='stop')return decideReception({...event,text:'no me escriban'},stage,state,templates,policy);
 if(u.confidence<0.85)return {stage,state,messages:['Quiero entenderte bien 😊 ¿Me cuentas un poquito más sobre lo que necesitas?']};
 let text:string|null=null;
 if(u.intent==='greeting'&&stage==='NEW')text='hola';
 if(u.intent==='menu'&&['NEW','NEED','MENU'].includes(stage))text='/servicios';
 if(u.service&&['NEW','NEED','MENU'].includes(stage))text=u.service;
 if(['accept','confirm'].includes(u.intent)&&stage==='OFFER')text='sí';
 if(stage==='PAYMENT_FORMAT'&&u.purchase)text={single:'una sesión',package:'paquete',prepaid:'ya tengo paquete'}[u.purchase];
 if(text){
  const decision=decideReception({...event,kind:'text',text},stage,state,templates,policy);
  if(stage==='NEW'&&u.service&&!decision.handoff)decision.messages.unshift('Hola 😊 Hablas con Luisa Fernanda de *Psicólogos en Colombia*. Espero que estés bien.');
  return decision;
 }
 // Questions are not sent verbatim from the model: it has no authority to quote or promise.
 if(u.intent==='reject')return {stage,state,messages:['Está bien 😊 ¿Qué opción te quedaría mejor?']};
 return decideReception(event,stage,state,templates,policy);
}
