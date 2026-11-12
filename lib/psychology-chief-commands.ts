import {SANDRA_PHONE,type ReceptionEvent} from './psychology-reception';

/** Exact command syntax is an address to the bot, only from the verified chief.
 * The handlers still validate records, permissions, dates and payment evidence.
 */
export function chiefStructuredCommand(event:ReceptionEvent):{text:string;kind:'booking'|'admin'}|null{
 if(event.fromMe||event.phone!==SANDRA_PHONE||event.kind!=='text')return null;
 // Only the current text is executable; a reply's quoted context stays evidence.
 const original=event.text.trim();
 const vocative=/^(?:(?:hola|buenos d[ií]as|buenas tardes|buenas noches|buen d[ií]a|oye|disculpa)[,!: ]+)?(?:luisa(?: fernanda)?|bot)[,!:; ]+/i.exec(original);
 const text=vocative?original.slice(vocative[0].length).trim():original;
 if(/^RESERVAR\s+\+?\d{8,15}\s+\d+\s+\d+\s+(?:\d+|VIRTUAL)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\d{2}:\d{2}$/i.test(text)
  ||/^SOPORTE\s+[A-F0-9]{12}\s+https:\/\/\S+$/i.test(text)
  ||/^CONFIRMAR\s+[A-F0-9]{12}$/i.test(text))return {text,kind:'booking'};
 if(/^(?:PAUSAR|REANUDAR)\s+\+?[1-9][\d\s-]{7,20}$/i.test(text)
  ||/^POLITICA PAGO (?:COMPLETO|MITAD CITA|ABONO 20000|REVISAR)$/i.test(text)
  ||/^(?:ESTADO BOT|AYUDA BOT)$/i.test(text))return {text,kind:'admin'};
 return null;
}
