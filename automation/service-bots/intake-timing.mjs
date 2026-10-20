import {normalize} from './config.mjs';
import {literalProgramPreference,calendarProgramPreferenceIssue} from './maria-program.mjs';

export const MARIA_INTAKE_TIMING_GUARD='own-current-literal-requested-timing-before-quotation-v1';
const day='(?:pasado mañana|pasado manana|mañana|manana|hoy|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)';
const period='(?:(?:en|por) la (?:mañana|manana|tarde|noche)|a las?\\s*\\d{1,2}(?::\\d{2})?(?:\\s*[ap]\\.?\\s*m\\.?)?)';
const temporal=new RegExp('\\b'+day+'\\b(?:\\s+'+period+')?','iu');

// A requested day is an intake fact, never acceptance or confirmed availability.
// The caller retains ordinary new-service routing and the existing human hold.
export function literalIntakeTiming(company,e){
 if(company!=='fumigacion'||e?.kind!=='text'||e.fromMe||e.forwarded||typeof e.id!=='string'||!e.id||!Number.isSafeInteger(e.at)||e.at<=0||typeof e.text!=='string'||e.text.length>8000)return null;
 const raw=e.text.trim();
 if(!raw||/["“”«»]|https?:|www\./i.test(raw))return null;
 // A punctuated or accented affirmative may accompany a preference. An
 // unpunctuated conditional remains unsupported, including "si mañana...".
 const asserted=raw.replace(/^(?:sí(?=[\s,.!;])|si\s*[,.;!])\s*[,.;!]?\s*/iu,'');
 const t=normalize(asserted);
 if(/\b(?:no|nunca|sin|si|quizas|tal vez|posiblemente|en caso de|supongamos|hipotetic\w*|hubiera|tuviera|dijo|dice|dijeron|segun|mi vecin[oa]|su vecin[oa]|mi amig[oa]|un tercero|otra persona)\b/.test(t))return null;
 if(/\b(?:el|la|mi|su|un|una) (?:vecin[oa]|amig[oa]|client[ae]?|mama|madre|papa|padre|herman[oa]|tecnic[oa])\b/.test(t))return null;
 const context=t.replace(/\blo antes posible\b/g,'');
 if(/\b(?:ayer|anteayer|anterior|antes|ya|fumigaron|hicieron|realizaron|aplicaron|agendaron|programaron|agendad[oa]|programad[oa]|esperando|llegada|refuerz\w*|garantia|reclam\w*|queja|seguimiento|revisit\w*|reprogram\w*|cancel\w*|posservicio|pague|pago|comprobante|transfer\w*|consign\w*|abono|comprar|adquirir|vend\w*|ofrezco|ofrecemos)\b/.test(context)||/\b(?:hace|despues|(?:semana|mes|año|ano|lunes|martes|miercoles|jueves|viernes|sabado|domingo) pasad[oa])\b/.test(context))return null;
 // Reuse the accepted standalone timing grammar, correcting only recognition
 // of a common spelling. The stored value always comes from the native text.
 const recognized=literalProgramPreference(raw,e.at);
 if(calendarProgramPreferenceIssue(raw,e.at))return null;
 if(recognized&&(/\bhorario\s*:/iu.test(raw)||/\b\d{1,2}(?:\/\d{1,2}|\s+de\s+\p{L})/iu.test(recognized)))return {preference:recognized,source:{sourceId:e.id,at:e.at,guard:MARIA_INTAKE_TIMING_GUARD,context:'literal-customer-preference-not-confirmed-availability'}};
 const match=raw.match(temporal);
 const urgency=raw.match(/\b(?:urgente|urgencia|lo antes posible)\b/iu);
 if(!match&&!urgency)return null;
 const at=match?.index??urgency.index,prefix=normalize(raw.slice(0,at));
 const request=/\b(?:para|prefiero|preferiria|me sirve|me queda bien|tienen disponibilidad|(?:lo )?(?:necesito|requiero|quiero|quisiera|solicito)|(?:pueden|podrian|puedes|podrias) (?:venir|atender|fumigar))\b[^.!?;,\r\n]{0,100}$/.test(prefix);
 const dayLed=match?.index===0&&new RegExp('^'+day+'\\b\\s+(?:necesito|requiero|quiero|quisiera|solicito|pueden venir)\\b','iu').test(raw);
 if(!recognized&&!request&&!dayLed)return null;
 // Multiple incompatible days require clarification rather than selection.
 const days=[...raw.matchAll(new RegExp('\\b'+day+'\\b(?:\\s+'+period+')?','giu'))].map(m=>normalize(m[0].match(new RegExp('^'+day+'\\b','iu'))[0]));
 if(new Set(days).size>1)return null;
 const preference=match?.[0]||null;
 return {preference,...(!preference?{urgency:urgency[0]}:{}),source:{sourceId:e.id,at:e.at,guard:MARIA_INTAKE_TIMING_GUARD,context:preference?'literal-customer-preference-not-confirmed-availability':'literal-customer-urgency-not-confirmed-availability'}};
}

export function currentIntakeTimingAcknowledgement(state){
 const key=['preference','urgency'].find(field=>state?.intakeSources?.[field]?.guard===MARIA_INTAKE_TIMING_GUARD&&state.intakeSources[field].sourceId===state.lastHandledSourceId);
 const ref=key&&state.intakeSources[key];
 if(ref?.guard!==MARIA_INTAKE_TIMING_GUARD||ref.sourceId!==state.lastHandledSourceId)return null;
 const timing=literalIntakeTiming('fumigacion',{id:ref.sourceId,at:ref.at,kind:'text',fromMe:false,forwarded:false,text:state.lastText});
 if(!timing||timing[key]!==state.slots?.[key])return null;
 if(key==='urgency')return 'Entiendo que lo necesitas con urgencia.';
 return 'Entiendo que lo necesitas '+timing.preference+'.';
}
