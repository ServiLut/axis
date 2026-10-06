import {normalize} from './config.mjs';

export const TECHNICAL_SCOPE_GUARD='literal-painting-scope-before-intake-and-pending-question-v1';
export const customerQuestionKey=text=>normalize(text).replace(/[¿?!.]+/g,' ').replace(/\s+/g,' ').trim();
export const technicalAvailabilityQuestion=text=>/^(?:tienen|ofrecen|hacen|prestan) (?:ese|este|el) servicio$/.test(customerQuestionKey(text));

export function literalPaintingRequest(e){
  if(e.kind!=='text'||e.forwarded)return null;
  const text=String(e.text??''),t=normalize(text);
  if(/\b(?:no|nunca)\b/.test(t)||! /\b(?:necesito|quiero|requiero|quisiera|solicito|busco)\b/.test(t))return null;
  if(! /\b(?:pintar|repintar|pintura|repintado|pintado)\b/.test(t)||! /\b(?:nevera|refrigerador)\b/.test(t))return null;
  return {sourceId:e.id,at:e.at,text:text.slice(0,300)};
}
