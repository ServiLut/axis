import {createHash} from 'node:crypto';
import {aiConfiguration,aiStatus,ownAiScope,ownAiScopeMatches} from './ai-settings.mjs';
import {probeOwnAi} from './conversational-ai.mjs';
export const OWN_AI_SETUP_GUARD='own-admin-initial-setup-encrypted-after-verified-connection-v1';
export const MIGUEL_OWN_AI_SETUP_GUARD='own-technical-admin-initial-setup-encrypted-after-verified-connection-v1';
export const ownAiSetupGuard=company=>company==='fumigacion'?OWN_AI_SETUP_GUARD:company==='servicio-tecnico'?MIGUEL_OWN_AI_SETUP_GUARD:null;
const metaKey='own-ai-initial-setup';
const names=['BOT_AI_PROVIDER','BOT_AI_SCOPE','BOT_OPENAI_API_KEY','BOT_AI_MODEL','BOT_AI_MONTHLY_CALL_LIMIT','BOT_AI_ENABLED_FROM','BOT_OPENAI_PROJECT_ID'];
const fingerprint=(env,company)=>createHash('sha256').update(JSON.stringify(company==='fumigacion'?names.map(n=>[n,env[n]]):{company,scope:ownAiScope(company),fields:names.map(n=>[n,env[n]])})).digest('hex');
function requireScope(config,store){if(!ownAiScope(config.company)||store.company!==config.company)throw Error('AI_SETUP_OWN_SCOPE_REQUIRED');}
function validate(env,company){
 if(!env||typeof env!=='object'||Array.isArray(env)||Object.keys(env).length!==names.length||names.some(n=>typeof env[n]!=='string')||Object.keys(env).some(n=>!names.includes(n)))throw Error('AI_SETUP_FIELDS_REQUIRED');
 if(env.BOT_AI_SCOPE!==ownAiScope(company))throw Error('AI_SETUP_OWN_SCOPE_REQUIRED');
 if(env.BOT_AI_PROVIDER!=='openai'||!/^sk-[A-Za-z0-9_-]{20,512}$/.test(env.BOT_OPENAI_API_KEY)||!/^proj_[A-Za-z0-9_-]{4,100}$/.test(env.BOT_OPENAI_PROJECT_ID))throw Error('AI_SETUP_OWN_CREDENTIAL_REQUIRED');
 const ai=aiConfiguration(env,company);
 if(!ai.ready)throw Error('AI_SETUP_CONFIGURATION_REQUIRED');
 return ai;
}
export function restoreOwnAiSetup(config,store){
 if(!ownAiScope(config.company))return false;
 requireScope(config,store);
 const saved=store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey);
 if(!saved)return false;
 const record=store.open(saved.value);
 if(record.guard!==ownAiSetupGuard(config.company)||record.fingerprint!==fingerprint(record.env,config.company)||record.health?.company!==ownAiScope(config.company)||!record.health?.connectionVerifiedAt)throw Error('AI_SETUP_STORED_CONFIGURATION_INVALID');
 const ai=validate(record.env,config.company);
 if(config.conversationalAi?.ready)throw Error('AI_SETUP_ENVIRONMENT_CONFLICT');
 config.conversationalAi=ai;
 return true;
}
export async function installOwnAiSetup(config,store,env,fetcher){
 requireScope(config,store);
 const ai=validate(env,config.company),hash=fingerprint(env,config.company),guard=ownAiSetupGuard(config.company),company=ownAiScope(config.company);
 const saved=store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey);
 if(saved){
  const record=store.open(saved.value);
  if(record.guard!==guard||record.fingerprint!==hash||record.health?.company!==company||!record.health?.connectionVerifiedAt)throw Error('AI_SETUP_ALREADY_CONFIGURED');
  if(config.conversationalAi?.ready&&!ownAiScopeMatches(config,store))throw Error('AI_SETUP_ENVIRONMENT_CONFLICT');
  if(!config.conversationalAi?.ready)config.conversationalAi=ai;
  return {company,guard,duplicate:true,configured:true,health:record.health,status:aiStatus(config)};
 }
 if(config.conversationalAi?.ready)throw Error('AI_SETUP_ALREADY_CONFIGURED');
 const now=Date.now();
 if(ai.enabledFrom<now-120000||ai.enabledFrom>now+120000)throw Error('AI_SETUP_NEW_CUTOFF_REQUIRED');
 // Use staged config during the technical probe. Customer processing remains
 // on the original config until a valid provider result is saved atomically.
 const staged={...config,conversationalAi:ai};
 const health=await probeOwnAi(staged,store,fetcher);
 store.tx(()=>{
  if(store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey))throw Error('AI_SETUP_ALREADY_CONFIGURED');
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(metaKey,store.seal({guard,env,fingerprint:hash,health,at:Date.now()}));
  store.audit('OWN_AI_INITIAL_SETUP',hash,{guard,provider:ai.provider,model:ai.model,project:ai.project,monthlyCallLimit:ai.monthlyCallLimit,enabledFrom:ai.enabledFrom,connectionVerifiedAt:health.connectionVerifiedAt});
 });
 config.conversationalAi=ai;
 return {company,guard,duplicate:false,configured:true,health,status:aiStatus(config)};
}
