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

/** Answers to another person's case must never be inherited by this conversation. */
export async function readChiefCaseAnswers(tx:Prisma.TransactionClient,phone:string,before:Date){
 return tx.$queryRaw<{questionId:string;question:string;answerEvent:string;answer:string;answeredAt:Date}[]>`
  SELECT q.id AS "questionId",q.content AS question,a.id AS "answerEvent",
    COALESCE(NULLIF(a.transcript,''),a.text) AS answer,a."eventAt" AS "answeredAt"
  FROM "PsicologiaBotEvent" a JOIN "PsicologiaBotOutbox" q
    ON a."quotedText"=q.content AND q."tenantId"=4 AND q.phone=${SANDRA_PHONE}
  JOIN "PsicologiaBotEvent" request ON q.id=request.id||':handoff' AND request."tenantId"=4
  WHERE a."tenantId"=4 AND a.phone=${SANDRA_PHONE} AND a."fromMe"=false
    AND q.status='ACCEPTED' AND q."attemptedAt"<=a."eventAt" AND length(a."quotedText")>=40
    AND a."eventAt"<=${before} AND request.phone=${phone} AND request."fromMe"=false
    AND (a.kind='text' OR a.kind='audio' AND NULLIF(a.transcript,'') IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" other WHERE other."tenantId"=4
      AND other.phone=${SANDRA_PHONE} AND other.status='ACCEPTED' AND other.content=q.content
      AND other."attemptedAt"<=a."eventAt" AND other.id<>q.id)
  ORDER BY a."eventAt" DESC,a.id DESC LIMIT 6`;
}
