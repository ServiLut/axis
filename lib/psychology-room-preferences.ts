import {normalizeText,type ReceptionEvent} from './psychology-reception';
export type RoomPreferenceInput={roomLabel:string;preference:'prefer'|'avoid';quote:string};
export type RoomPreference={roomId:string;label:string;preference:'prefer'|'avoid';sourceEvent:string;at:string};
export type RoomPreferences={professionalId:number;entries:RoomPreference[]};
type Room={id:bigint;nombre:string};
const key=(s:string)=>normalizeText(s).replace(/^consultorio\s*/,'').trim();
/** Learn only an explicit preference from the verified professional, never from visit frequency. */
export function rememberRoomPreferences(previous:RoomPreferences|undefined,changes:RoomPreferenceInput[],rooms:Room[],professionalId:number,event:ReceptionEvent):RoomPreferences{
 const entries=previous?.professionalId===professionalId?previous.entries.map(p=>({...p})):[];
 if(event.fromMe)throw Error('ROOM_PREFERENCE_SOURCE');
 for(const c of changes){
  const quote=normalizeText(c.quote),matches=rooms.filter(r=>key(r.nombre)===key(c.roomLabel));
  if(!quote||!normalizeText(event.text).includes(quote)||matches.length!==1)throw Error('ROOM_PREFERENCE_AMBIGUOUS');
  // Quoting a room is insufficient: the speaker must express a personal preference.
  if(!/\b(prefiero|preferimos|me gusta|nos gusta|no me gusta|no nos gusta|no quiero|evitar|evito)\b/.test(quote))throw Error('ROOM_PREFERENCE_NOT_EXPLICIT');
  const rejected=/\b(no me gusta|no nos gusta|no quiero|evitar|evito)\b/.test(quote);
  if(rejected!==(c.preference==='avoid'))throw Error('ROOM_PREFERENCE_CONTRADICTORY');
  const room=matches[0];
  const literal=key(room.nombre).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!new RegExp('(?:^|\\D)'+literal+'(?:\\D|$)').test(quote))throw Error('ROOM_PREFERENCE_NOT_QUOTED');
  const next={roomId:String(room.id),label:room.nombre,preference:c.preference,sourceEvent:event.id,at:event.at};
  const index=entries.findIndex(p=>p.roomId===next.roomId);if(index>=0)entries[index]=next;else entries.push(next);
 }
 return {professionalId,entries:entries.slice(-30)};
}
export function roomChoice(free:Room[],preferences:RoomPreferences|undefined,professionalId:number){
 const entries=preferences?.professionalId===professionalId?preferences.entries:[];
 const avoided=new Set(entries.filter(p=>p.preference==='avoid').map(p=>p.roomId));
 const preferred=new Set(entries.filter(p=>p.preference==='prefer').map(p=>p.roomId));
 const suitable=free.filter(r=>!avoided.has(String(r.id)));
 const ordered=[...suitable.filter(r=>preferred.has(String(r.id))),...suitable.filter(r=>!preferred.has(String(r.id)))];
 if(!ordered.length&&free.length)return `En ese horario solo quedan ${free.map(r=>r.nombre.toLowerCase()).join(', ')}. ¿Te sirve alguno esta vez o prefieres otro horario?`;
 const favorite=ordered.filter(r=>preferred.has(String(r.id)));
 return favorite.length?`Está disponible ${favorite.map(r=>'el '+r.nombre.toLowerCase()).join(' y ')}, que prefieres 😊${ordered.length>favorite.length?' También tenemos '+ordered.filter(r=>!preferred.has(String(r.id))).map(r=>r.nombre.toLowerCase()).join(', ')+'.':''} ¿Cuál te gustaría reservar?`:`Tenemos disponibles ${ordered.map(r=>r.nombre.toLowerCase()).join(', ')} 😊 ¿Cuál prefieres?`;
}
