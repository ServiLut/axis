import { phoneDigits, PSYCHOLOGY_INSTANCE, PSYCHOLOGY_PHONE } from './psychology-reception';

const base='https://chatwoot.servilutioncrm.cloud';
const account='/api/v1/accounts/2';
export async function chatwootRequest(path: string, method='GET', body?: unknown) {
  if(!path.startsWith(account+'/')) throw new Error('CW_SCOPE');
  const token=process.env.PSICOLOGOS_CHATWOOT_TOKEN;
  if(!token) throw new Error('CW_CREDENTIAL_MISSING');
  const res=await fetch(base+path,{method,headers:{api_access_token:token,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!res.ok) throw new Error(`CW_HTTP_${res.status}`);
  return res.json();
}
export async function verifyPsychologyChannel() {
  if(!process.env.PSICOLOGOS_EVOLUTION_TOKEN) throw new Error('WA_CREDENTIAL_MISSING');
  const res=await fetch(`https://evolutionapi.servilutioncrm.cloud/instance/fetchInstances?instanceName=${PSYCHOLOGY_INSTANCE}`,{
    headers:{apikey:process.env.PSICOLOGOS_EVOLUTION_TOKEN},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!res.ok) throw new Error('WA_UNVERIFIED');
  const instances=await res.json();
  const own=Array.isArray(instances)?instances.find(x=>x.name===PSYCHOLOGY_INSTANCE):null;
  if(own?.connectionStatus!=='open'||own?.ownerJid?.split('@')[0]?.split(':')[0]!==PSYCHOLOGY_PHONE) throw new Error('WA_UNVERIFIED');
  const inboxes=await chatwootRequest(account+'/inboxes');
  const inbox=inboxes.payload?.find((x:{id:number})=>x.id===10);
  if(inbox?.name!=='WhatsApp Psicólogos 3016818845'||inbox?.channel_type!=='Channel::Api') throw new Error('CW_SCOPE');
}
export async function ensurePsychologyConversation(phone: string) {
  if(phoneDigits(phone)!==phone) throw new Error('PHONE_INVALID');
  const contacts=await chatwootRequest(account+`/contacts/search?q=${phone}`);
  const exact=(contacts.payload??[]).filter((c:{phone_number:string})=>c.phone_number==='+'+phone);
  if(exact.length>1) throw new Error('CW_CONTACT_DUPLICATE');
  let contact=exact[0];
  if(!contact) {
    const created=await chatwootRequest(account+'/contacts','POST',{inbox_id:10,phone_number:'+'+phone,name:'WhatsApp '+phone});
    contact=created.payload?.contact??created.payload??created;
  }
  if(!contact?.id||contact.phone_number!=='+'+phone) throw new Error('CW_CONTACT_UNVERIFIED');
  const conversations=await chatwootRequest(account+`/contacts/${contact.id}/conversations`);
  let conversation=(conversations.payload??[]).filter((c:{inbox_id:number})=>c.inbox_id===10)
    .sort((a:{id:number},b:{id:number})=>b.id-a.id)[0];
  if(!conversation) {
    const source=contact.contact_inboxes?.find((x:{inbox:{id:number}})=>x.inbox?.id===10)?.source_id;
    if(!source) throw new Error('CW_CONTACT_INBOX_MISSING');
    conversation=await chatwootRequest(account+'/conversations','POST',{source_id:source,inbox_id:10,contact_id:contact.id,status:'open'});
  }
  if(!Number.isSafeInteger(conversation.id)||conversation.inbox_id!==10) throw new Error('CW_CONVERSATION_UNVERIFIED');
  // The recipient is selected by exact phone AND the verified inbox, never by message text.
  return {id:conversation.id as number,contactId:contact.id as number};
}
export async function sendPsychologyMessage(conversationId:number,content:string) {
  return chatwootRequest(account+`/conversations/${conversationId}/messages`,'POST',{
    content,message_type:'outgoing',private:false,content_type:'text',
  });
}
