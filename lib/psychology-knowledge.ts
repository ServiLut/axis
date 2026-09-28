import type {Prisma} from '@/prisma/generated/prisma/client';
import {SANDRA_PHONE} from './psychology-reception';

const ignored=new Set('hola gracias buenos buenas dias tardes noches quiero necesito favor puede puedes dime seria tengo tenemos para como cuando donde porque sobre este esta estos estas una uno unos unas del las los que con por mas muy soy son sea sus nos hay'.split(' '));
export function knowledgeSearch(text:string):string{
 const words=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z]{4,30}/g)||[];
 // Only letter tokens enter the tsquery syntax; the entire query is also parameter-bound.
 return [...new Set(words.filter(w=>!ignored.has(w)))].slice(0,24).join(' | ');
}

/** Search all active chief instructions, so useful older answers do not disappear after twelve lessons. */
export async function readChiefKnowledge(tx:Prisma.TransactionClient,topic:string){
 const search=knowledgeSearch(topic);
 return tx.$queryRaw<{id:string;instruction:string;sourceEvent:string;createdAt:Date}[]>`
  SELECT id,instruction,"sourceEvent","createdAt" FROM "PsicologiaBotKnowledge"
  WHERE "tenantId"=4 AND active=true AND "approvedBy"=${SANDRA_PHONE}
  ORDER BY CASE WHEN ${search}<>'' AND to_tsvector('spanish',instruction) @@ to_tsquery('spanish',${search}) THEN 0 ELSE 1 END,
    "createdAt" DESC,id DESC LIMIT 24`;
}
