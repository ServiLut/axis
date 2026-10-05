import {normalize,SANDRA,internalName} from './config.mjs';
import {currentPriceEntries} from './prices.mjs';

export function chiefStatusTopic(text) {
  const t=normalize(text).replace(/[¿?!.]+$/,'').trim();
  if(/^(?:cuantos (?:chats|mensajes|clientes) (?:has|haz) (?:respondido|atendido|contestado)(?: (?:de|en) (?:ambas|las dos) lineas(?: de whatsapp)?)?(?: (?:hoy|en total))?|a cuantos (?:chats|clientes) (?:has )?(?:respondido|atendido)(?: hoy)?)$/.test(t))return 'counts';
  if(/^(?:(?:estas|sigues) (?:respondiendo|repsondiendo|contestando|atendiendo)|respondes|atiendes) (?:los |a los )?(?:mensajes|chats|clientes)(?: (?:de|en) (?:ambas|las dos) lineas(?: de whatsapp)?)?$/.test(t))return 'customer-status';
  if(/^(?:estas (?:ahi|presente|funcionando|disponible)|me escuchas|puedes responder|sigues ahi)$/.test(t))return 'presence';
  return null;
}

export function customerActivity(store,config,today=false,now=Date.now()) {
  const day=new Date(now-5*3600000).toISOString().slice(0,10),from=today?Date.parse(day+'T05:00:00Z'):0;
  const rows=store.db.prepare("SELECT phone,line,state,mid FROM outbox WHERE internal=0 AND created>=? AND created<=?").all(from,now);
  const lines=config.lines.map(l=>({phone:l.phone,chats:new Set(),pending:new Set()}));
  const total=new Set(),pending=new Set();
  for(const row of rows){const line=lines.find(l=>l.phone===row.line);if(!line||!row.mid)continue;
    if(['DELIVERED','READ'].includes(row.state)){line.chats.add(row.phone);total.add(row.phone);}
    else if(['ACCEPTED','UNCERTAIN','SENDING'].includes(row.state)){line.pending.add(row.phone);pending.add(row.phone);}
  }
  return {checkedAt:new Date(now).toISOString(),scope:today?'today-America/Bogota':'own-stored-outbox',from:new Date(from).toISOString(),to:new Date(now).toISOString(),deliveredChats:total.size,unverifiedDeliveryChats:pending.size,lines:lines.map(l=>({phone:l.phone,deliveredChats:l.chats.size,unverifiedDeliveryChats:l.pending.size})),staffRepliesIncluded:false,businessCompletionVerified:false};
}

export function chiefStatusReply(store,config,phone,topic,text,now=Date.now()) {
  const recipient=internalName(phone);
  const priceReady=config.company==='fumigacion'&&currentPriceEntries(store.approvedPriceCatalogs()).length>0;
  const mode=config.enabled?(priceReady?'La recepción de solicitudes está activa en mis dos líneas. Puedo cotizar servicios que coincidan con tarifas verificadas; los casos especiales y la programación necesitan confirmación. Todavía no creo servicios ni registro pagos.':'La recepción de solicitudes de clientes está activa en mis dos líneas. Las cotizaciones y la programación aún requieren confirmación; todavía no creo servicios ni registro pagos.'):'La atención a clientes está pausada en mis dos líneas. Puedo responderte por aquí; aún falta completar las respuestas y la cotización antes de reanudar.';
  if(topic!=='counts')return (topic==='presence'?'Sí, '+recipient+'. Soy '+config.bot+'. ':recipient+', ')+mode;
  const today=/\bhoy\b/.test(normalize(text)),activity=customerActivity(store,config,today,now);
  const label=today?'Hoy':'En mis registros';
  const perLine=activity.lines.map(l=>'línea '+l.phone.slice(-4)+': '+l.deliveredChats).join('; ');
  let reply=recipient+', '+label.toLowerCase()+' tengo respuestas con entrega comprobada a '+activity.deliveredChats+' chats de clientes ('+perLine+'). Un chat presente en ambas líneas se cuenta una sola vez en el total.';
  if(activity.unverifiedDeliveryChats)reply+=' Además, '+activity.unverifiedDeliveryChats+' chats tienen alguna salida cuya entrega aún no está comprobada; esas salidas no se suman como entregadas.';
  return reply+' '+(config.enabled?'La recepción sigue activa.':'Ahora la atención a clientes está pausada.');
}
