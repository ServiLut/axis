import { createServer } from 'node:http';
import { configFromEnv,authorized,validateEvent } from './config.mjs';
import { Store } from './store.mjs';
import { Engine } from './engine.mjs';
import { Transport,drain } from './transport.mjs';
import { pathToFileURL } from 'node:url';
import { decodeWebhook } from './webhook.mjs';

export function createBotServer(config,store,transport,engine) {
  let draining=false;
  const run=async()=>{if(draining)return {busy:true};draining=true;try{return await drain(store,config,transport,engine);}finally{draining=false;}};
  const server=createServer(async(req,res)=>{
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store, private'});res.end(JSON.stringify(body));};
    const ingestion=['/event','/delivery','/webhook'].includes(req.url);
    if(!authorized(req.headers.authorization,ingestion?config.webhookHash:config.authHash))return reply(401,{error:'UNAUTHORIZED'});
    if(req.method!=='POST')return reply(405,{error:'POST_REQUIRED'});
    try {
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)return reply(413,{error:'PAYLOAD_TOO_LARGE'});}
      const body=JSON.parse(raw);
      if(req.url==='/status')return reply(200,{company:config.name,bot:config.bot,enabled:config.enabled,mode:'reception-with-human-review',fullyAutonomous:false,
        events:store.db.prepare('SELECT state,COUNT(*) n FROM events GROUP BY state').all(),outbox:store.db.prepare('SELECT state,COUNT(*) n FROM outbox GROUP BY state').all(),
        unanswered:store.db.prepare("SELECT COUNT(*) n FROM questions WHERE state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW')").get().n,
        knowledge:store.db.prepare('SELECT kind,COUNT(*) n FROM knowledge GROUP BY kind').all(),programConnected:Boolean(config.programContextUrl&&config.programToken),aiConfigured:Boolean(config.aiUrl&&config.aiToken)});
      if(req.url==='/channel-health'){
        const lines=[];for(const line of config.lines)lines.push(await transport.verifyLine(line.phone));return reply(200,{company:config.name,lines});
      }
      if(req.url==='/event'){
        const event=validateEvent(body,config);if(!event)return reply(202,{accepted:false,reason:'UNSUPPORTED_OR_STALE_OR_OUTSIDE_SCOPE'});
        await transport.verifyLine(event.line);return reply(202,{accepted:true,...store.enqueue(event)});
      }
      if(req.url==='/webhook'){
        const parsed=decodeWebhook(body,config);let accepted=0,duplicates=0,deliveryUpdates=0;
        const own=config.lines.find(l=>l.instance===body.instance);if(!own)return reply(400,{error:'INSTANCE_OUTSIDE_SCOPE'});
        await transport.verifyLine(own.phone);
        for(const value of parsed.events){const e=validateEvent(value,config);if(e){const r=store.enqueue(e);accepted++;if(r.duplicate)duplicates++;}}
        for(const d of parsed.deliveries)deliveryUpdates+=store.db.prepare("UPDATE outbox SET state=?,updated=? WHERE mid=? AND line=? AND state IN ('SENDING','ACCEPTED','DELIVERED')").run(d.state,Date.now(),d.mid,own.phone).changes;
        return reply(202,{accepted,duplicates,deliveryUpdates});
      }
      if(req.url==='/delivery'){
        const line=config.lines.find(l=>l.instance===body.instance&&l.phone===body.owner);
        if(!line||!['DELIVERED','READ'].includes(body.state)||typeof body.mid!=='string')return reply(400,{error:'DELIVERY_OUTSIDE_SCOPE'});
        await transport.verifyLine(line.phone);
        const n=store.db.prepare("UPDATE outbox SET state=?,updated=? WHERE mid=? AND line=? AND state IN ('SENDING','ACCEPTED','DELIVERED')").run(body.state,Date.now(),body.mid,line.phone).changes;
        return reply(200,{updated:n});
      }
      if(req.url==='/knowledge')return reply(200,store.importKnowledge(body));
      if(req.url==='/import-pending-questions')return reply(200,store.importPendingQuestions(body));
      if(req.url==='/drain')return reply(200,await run());
      return reply(404,{error:'NOT_FOUND'});
    }catch{return reply(503,{error:'REVIEW_REQUIRED'});}
  });
  const timer=setInterval(()=>run().catch(()=>{}),10000);timer.unref();server.on('close',()=>clearInterval(timer));return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const config=configFromEnv();const store=new Store(config.database,config.company,config.encryptionKey);
  const transport=new Transport(config),engine=new Engine(store,config);
  createBotServer(config,store,transport,engine).listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({company:config.name,bot:config.bot,enabled:config.enabled,port:config.port})));
}
