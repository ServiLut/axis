export const CONVERSATIONAL_AI_GUARD='own-fumigacion-context-approved-reply-and-budget-v1';

export function aiConfiguration(env,company){
 const provider=env.BOT_AI_PROVIDER||null;
 if(provider&&provider!=='openai')throw Error('AI_PROVIDER_UNSUPPORTED');
 if(provider&&company!=='fumigacion')throw Error('AI_FUMIGACION_SCOPE_REQUIRED');
 const limit=Number(env.BOT_AI_MONTHLY_CALL_LIMIT||0),enabledFrom=Date.parse(env.BOT_AI_ENABLED_FROM||'');
 const missing=provider?[
  !env.BOT_OPENAI_API_KEY&&'BOT_OPENAI_API_KEY',!env.BOT_AI_MODEL&&'BOT_AI_MODEL',
  env.BOT_AI_SCOPE!=='FUMIGACION'&&'BOT_AI_SCOPE',
  (!Number.isSafeInteger(limit)||limit<1||limit>100000)&&'BOT_AI_MONTHLY_CALL_LIMIT',
  !Number.isFinite(enabledFrom)&&'BOT_AI_ENABLED_FROM'
 ].filter(Boolean):[];
 if(env.BOT_AI_MODEL&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(env.BOT_AI_MODEL))throw Error('AI_MODEL_INVALID');
 if(env.BOT_OPENAI_PROJECT_ID&&!/^proj_[a-zA-Z0-9_-]{4,100}$/.test(env.BOT_OPENAI_PROJECT_ID))throw Error('AI_PROJECT_INVALID');
 return {provider,ready:provider==='openai'&&!missing.length,missing,model:env.BOT_AI_MODEL||null,
  key:provider?env.BOT_OPENAI_API_KEY||null:null,project:env.BOT_OPENAI_PROJECT_ID||null,monthlyCallLimit:limit,scope:env.BOT_AI_SCOPE||null,enabledFrom};
}

export function aiStatus(config){
 const ai=config.conversationalAi;
 return {provider:ai?.provider||null,configured:Boolean(ai?.ready),model:ai?.ready?ai.model:null,
  setupMissing:ai?.missing||[],guard:config.company==='fumigacion'?CONVERSATIONAL_AI_GUARD:null,
  monthlyCallLimit:ai?.ready?ai.monthlyCallLimit:null,enabledFrom:ai?.ready?new Date(ai.enabledFrom).toISOString():null,
  knowledgeMode:'approved-runtime-facts-and-same-case-only',trainedModel:false};
}
