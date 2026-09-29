export type ReceptionHistoryItem={direction:string;text:string;at:string;source:string;messageId?:number};
export type BotHistoryReference={id:string;content:string;messageId:string|null;attemptedAt:Date|null};

/** Observation is limited to this conversation; it does not create approved knowledge. */
export function classifyReceptionHistory(history:ReceptionHistoryItem[],bot:BotHistoryReference[]){
 return history.map(h=>{
  if(!h.direction.startsWith('outbound'))return h;
  const own=bot.some(b=>b.id===h.source||(h.messageId!==undefined&&b.messageId===String(h.messageId))
   ||(h.messageId===undefined&&!!b.attemptedAt&&h.text===b.content&&Math.abs(Date.parse(h.at)-b.attemptedAt.getTime())<=120000));
  return {...h,direction:own?'outbound_bot':'outbound_staff'};
 });
}

export function staffObservation(history:ReceptionHistoryItem[],stage?:string){
 return {mode:stage==='HUMAN'?'observe_without_reply':'use_reviewed_tone',
  scope:'same_conversation_only_not_new_business_rules',
  examples:history.filter(h=>h.direction==='outbound_staff'&&h.text&&!h.text.startsWith('[Archivo o audio'))
   .slice(-8).map(h=>({source:h.source,at:h.at,text:h.text}))};
}
