import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,configFromEnv,validateEvent} from '../automation/service-bots/config.mjs';
import {DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE,FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED,assertOperationalLineScope,operationalLines,operationalLineStartsAt,operationalCoverage,operationalHistoryGuard} from '../automation/service-bots/line-scope.mjs';
import {publicResponseWindow,publicOperationAllowed,publicEventAllowed,publicLineSqlFilter,publicOutboxAllowed} from '../automation/service-bots/public-response-window.mjs';

function fixture(){
 const now=Date.now(),activatedAt=now-86400000,blueScope=activatedAt+1000,bluePublic=now-7200000,redPublic=now-60000;
 const scope={version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,company:'fumigacion',activeLines:[BLUE,RED],suspendedLines:[],authorizedAt:new Date(blueScope).toISOString(),lineStartsAt:{[BLUE]:new Date(blueScope).toISOString(),[RED]:new Date(redPublic).toISOString()}};
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt,publicResponseStartsAt:bluePublic,operationalLineScope:scope,historyCheckRequired:true,lines:[{phone:BLUE,instance:'cucaracha-azul',apiKey:'a'.repeat(32)},{phone:RED,instance:'cucaracha-roja',apiKey:'b'.repeat(32)}]};
 return {c,now,blueScope,bluePublic,redPublic};
}

test('the new dual profile keeps the original blue source boundary and declares history coverage unknown',()=>{
 const {c,blueScope,redPublic,bluePublic}=fixture();assert.equal(assertOperationalLineScope(c),c.operationalLineScope);
 assert.deepEqual(operationalLines(c).map(line=>line.phone),[BLUE,RED]);assert.equal(operationalLineStartsAt(c,BLUE),blueScope);assert.equal(operationalLineStartsAt(c,RED),redPublic);
 assert.equal(publicResponseWindow(c).startsAt,bluePublic);assert.deepEqual(publicResponseWindow(c).lineStartsAt,{[BLUE]:bluePublic,[RED]:redPublic});
 const coverage=operationalCoverage(c);assert.equal(coverage.mode,DUAL_LINE_SCOPE_VERSION);assert.equal(coverage.allOwnLinesOperational,true);assert.equal(coverage.fullCompanyCoverageComplete,false);assert.equal(coverage.historyCoverageComplete,false);assert.deepEqual(coverage.suspendedLines,[]);
 assert.match(operationalHistoryGuard(c),/dual-prospective/);
});

for(const mutate of [
 c=>c.company='servicio-tecnico',c=>c.operationalLineScope.authorizationSource='old-user-permission',c=>c.operationalLineScope.activeLines=[BLUE,BLUE],c=>c.operationalLineScope.suspendedLines=[RED],
 c=>delete c.operationalLineScope.lineStartsAt[RED],c=>c.operationalLineScope.lineStartsAt[BLUE]=new Date(c.activatedAt).toISOString(),c=>c.lines[1].instance='cucaracha-azul',c=>c.operationalLineScope.lineStartsAt[RED]='2026-02-30T00:00:00.000Z'
])test('a broadened, ambiguous or malformed dual profile is rejected',()=>{
 const {c}=fixture();mutate(c);assert.throws(()=>assertOperationalLineScope(c),/OPERATIONAL_LINE_SCOPE_REQUIRED/);
});

test('native time and receive time both have to pass the cutoff of their actual line',()=>{
 const {c,now,bluePublic,redPublic}=fixture();
 assert.deepEqual(publicLineSqlFilter({...c,publicResponseStartsAt:null}),{sql:'0',params:[]});
 assert.equal(publicEventAllowed(c,{line:BLUE,at:bluePublic,received_at:now},now),true);
 assert.equal(publicEventAllowed(c,{line:RED,at:redPublic,received_at:redPublic},now),true);
 for(const row of [{line:RED,at:redPublic-1,received_at:now},{line:RED,at:now,received_at:redPublic-1},{line:BLUE,at:bluePublic-1,received_at:now},{line:'573000007300',at:now,received_at:now},{at:now,received_at:now}])assert.equal(publicEventAllowed(c,row,now),false);
 assert.equal(publicOperationAllowed(c,{line:RED,sourceAt:now,createdAt:now},now),true);assert.equal(publicOperationAllowed(c,{sourceAt:now,createdAt:now},now),false);
});

test('the per-line SQL filter excludes old red backlog before LIMIT without moving the blue cut',()=>{
 const {c,now,redPublic}=fixture(),s=new Store(':memory:','fumigacion',randomBytes(32));
 try{
  for(let i=0;i<35;i++)s.enqueue({id:'DUAL_SQL_OLD_RED_'+i,phone:'57300000'+String(1000+i),line:RED,at:redPublic-1000-i,kind:'text',fromMe:false,text:'Mensaje antiguo.'});
  s.enqueue({id:'DUAL_SQL_FRESH_BLUE',phone:'573000007380',line:BLUE,at:now,kind:'text',fromMe:false,text:'Hola'});
  const filter=publicLineSqlFilter(c,{lineColumn:'e.line',sourceAtColumn:'e.at',createdAtColumn:'e.received_at'});
  const rows=s.db.prepare("SELECT e.id FROM events e WHERE e.state='PENDING' AND "+filter.sql+' ORDER BY e.at,e.rowid LIMIT 1').all(...filter.params);assert.deepEqual(rows.map(row=>row.id),['DUAL_SQL_FRESH_BLUE']);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM events WHERE line=? AND state='PENDING'").get(RED).n,35);
  assert.throws(()=>publicLineSqlFilter(c,{lineColumn:'line OR 1=1'}),/SQL_COLUMNS/);
 }finally{s.close();}
});

test('a fresh outbox cannot replay an old red event even though it is newer than the blue public cut',()=>{
 const {c,redPublic}=fixture(),s=new Store(':memory:','fumigacion',randomBytes(32));
 try{
  const e={id:'DUAL_OLD_EVENT_NEW_OUTBOX',phone:'573000007381',line:RED,at:redPublic-1,kind:'text',fromMe:false,text:'Antigua solicitud.'};s.enqueue(e);s.queue(e.id+':reply',e.phone,e.line,'No se debe reenviar.',false,s.conversation(e.phone).revision,'fumigacion:'+e.id);
  const row=s.db.prepare('SELECT * FROM outbox').get(),before=s.db.prepare('SELECT * FROM outbox').get();assert.equal(publicOutboxAllowed(s,c,row),false);assert.deepEqual(s.db.prepare('SELECT * FROM outbox').get(),before);
 }finally{s.close();}
});

test('config persists existing keys, activation and blue public cut while validating a distinct prospective red start',()=>{
 const {c,now,redPublic,bluePublic}=fixture(),env={BOT_COMPANY:'fumigacion',BOT_LINES_JSON:JSON.stringify(c.lines),BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(c.operationalLineScope),BOT_ACTIVATED_AT:new Date(c.activatedAt).toISOString(),BOT_PUBLIC_RESPONSE_STARTS_AT:new Date(bluePublic).toISOString(),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'b'.repeat(64),BOT_DATA_KEY:'c'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example',BOT_ENABLED:'true',BOT_PRIOR_HISTORY_CHECK:'true'};
 const parsed=configFromEnv(env);assert.equal(parsed.activatedAt,c.activatedAt);assert.equal(parsed.publicResponseStartsAt,bluePublic);assert.deepEqual(parsed.lines,c.lines);
 const body={instance:'cucaracha-roja',owner:RED,event:{id:'DUAL_VALID_RED_SOURCE',phone:'573000007382',at:new Date(redPublic).toISOString(),kind:'text',fromMe:false,text:'Hola'}};
 assert.ok(validateEvent(body,parsed,now));assert.equal(validateEvent({...body,event:{...body.event,at:new Date(redPublic-1).toISOString()}},parsed,now),null);
 const absent={...env};delete absent.BOT_PUBLIC_RESPONSE_STARTS_AT;assert.throws(()=>configFromEnv(absent),/DUAL_PROSPECTIVE_CUTOFF/);
 assert.throws(()=>configFromEnv({...env,BOT_PUBLIC_RESPONSE_STARTS_AT:new Date(now).toISOString()}),/DUAL_PROSPECTIVE_CUTOFF/);
});
