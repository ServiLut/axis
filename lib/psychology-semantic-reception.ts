import {decideReception,type ReceptionEvent,type ReceptionState,type ReceptionTemplates,type ReceptionResult} from './psychology-reception';
import type {Understanding} from './psychology-ai';
import {contextReception} from './psychology-reception-context';

/** AI chooses intent; approved templates and persisted state control prices and actions. */
export function semanticReception(event:ReceptionEvent,stage:string,state:ReceptionState,templates:ReceptionTemplates,policy:string,u:Understanding|null):ReceptionResult{
 const baseline=decideReception(event,stage,state,templates,policy);
 if(event.fromMe||baseline.handoff==='Atención humana urgente')return baseline;
 if(u?.intent==='urgent')return decideReception({...event,text:'me quiero morir'},stage,state,templates,policy);
 if(stage==='HUMAN')return {stage,state,messages:[]};
 const contextual=contextReception(event,stage,state);if(contextual)return contextual;
 if(!u)return baseline;
 if(u.intent==='greeting'&&stage==='NEW'&&state.context?.hasHistory)return {stage:'NEED',state,messages:['Hola 😊 ¿En qué podemos ayudarte con lo que venían conversando?']};
 if(state.resumedFrom&&u.intent==='greeting'&&stage==='NEED')return {stage,state,messages:['Hola 😊 Estoy aquí para continuar contigo. ¿Qué necesitas completar?']};
 if(u.intent==='stop')return decideReception({...event,text:'no me escriban'},stage,state,templates,policy);
 if(u.confidence<0.85){
  const next={...state,clarifications:(state.clarifications||0)+1};
  if(next.clarifications>=2)return {stage:'HUMAN',state:{...next,reason:'Contexto insuficiente'},messages:['Voy a consultarlo con Sandra para responderte correctamente 😊'],handoff:'No se pudo resolver la duda con el contexto disponible'};
  return {stage,state:next,messages:['Quiero entenderte bien 😊 ¿Me cuentas un poquito más sobre lo que necesitas?']};
 }
 state={...state,clarifications:0};
 if(u.intent==='courtesy')return {stage,state,messages:['Con gusto 😊 Aquí estamos cuando nos necesites.']};
 if(u.intent==='appointment')return {stage:'HUMAN',state:{...state,reason:'Revisar cita existente'},messages:['Gracias 😊 Voy a verificarlo con Sandra para darte la información correcta.'],handoff:'Consulta o confirmación de cita existente: verificar agenda y contexto del chat'};
 const accepted=['accept','confirm'].includes(u.intent);
 if(stage==='OFFER'&&accepted&&state.servicesOffered&&state.servicesOffered.length>1){
  if(!u.service||!state.servicesOffered.includes(u.service))return {stage,state,messages:['Claro 😊 ¿Por cuál de los servicios deseas empezar a agendar?']};
  return decideReception({...event,kind:'text',text:'sí'},stage,{...state,service:u.service,servicesOffered:[u.service]},templates,policy);
 }
 const requested=[...new Set([u.service,...(u.additionalServices||[])].filter((s):s is string=>!!s))];
 const newService=!!u.service&&u.service!==state.service;
 if(stage==='PAYMENT_FORMAT'&&u.purchase&&!newService)return decideReception({...event,kind:'text',text:{single:'una sesión',package:'paquete',prepaid:'ya tengo paquete'}[u.purchase]},stage,state,templates,policy);
 if(requested.length&&['NEW','NEED','MENU','OFFER','PAYMENT_FORMAT'].includes(stage)&&!(stage==='OFFER'&&accepted&&!newService)){
  const offers=requested.map(service=>decideReception({...event,kind:'text',text:service},'NEED',state,templates,policy));
  const missing=offers.find(d=>d.handoff);if(missing)return missing;
  const messages=offers.map(d=>d.messages[0]);
  if(stage==='NEW')messages.unshift('Hola 😊 Hablas con Luisa Fernanda de *Psicólogos en Colombia*. Espero que estés bien.');
  messages.push(requested.length>1?'¿Por cuál de estos servicios deseas empezar a agendar?':offers[0].messages[1]);
  return {stage:'OFFER',state:{...state,service:requested.length===1?requested[0]:undefined,servicesOffered:requested,offeredAt:event.id},messages};
 }
 let text:string|null=null;
 if(u.intent==='greeting'&&stage==='NEW')text='hola';
 if(u.intent==='menu'&&['NEW','NEED','MENU'].includes(stage))text='/servicios';
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
