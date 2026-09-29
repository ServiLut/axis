import type {Prisma} from '@/prisma/generated/prisma/client';
import type {ReceptionState} from './psychology-reception';
import type {Understanding} from './psychology-ai';

type IdleSource={id:string;phone:string;eventAt:Date;kind:string;text:string;transcript:string|null;quotedText:string|null;state:ReceptionState};

/** Staff ownership ends only on an explicit authorized handback, never a timer. */
export async function idleChatSources(_tx:Prisma.TransactionClient,_minutes=15,_sourceId:string|null=null):Promise<IdleSource[]>{return [];}
export async function enqueueIdleChatResumes(_tx:Prisma.TransactionClient,_minutes=15){return 0;}
export function idleResumeDecision(_state:ReceptionState,_u:Understanding|null,_sourceId:string):{stage:string;state:ReceptionState}|null{return null;}

/** Cancel already queued legacy continuations too. Reports and other replies use their own gates. */
export async function idleReplyStillCurrent(_tx:Prisma.TransactionClient,id:string,_phone:string){
 return !id.startsWith('idle-resume:');
}
