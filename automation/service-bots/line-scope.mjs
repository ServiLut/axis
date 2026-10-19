// This temporary route is an explicit instruction, never an inference from a
// disconnected channel. Both company bindings and their history stay intact.
export const BLUE_ONLY_SCOPE_VERSION='authorized-fumigacion-blue-only-v1';
export const BLUE_ONLY_AUTHORIZATION_SOURCE='direct-user-20261009-red-block-24h';
export const DUAL_LINE_SCOPE_VERSION='authorized-fumigacion-dual-prospective-v1';
export const DUAL_LINE_AUTHORIZATION_SOURCE='direct-user-20261019-two-lines-new-messages';
export const FUMIGACION_BLUE='573126944997';
export const FUMIGACION_RED='573126938721';

export function assertOperationalLineScope(config){
  const scope=config.operationalLineScope;
  if(scope==null)return null;
  const lines=config.lines;
  const exactPhones=values=>Array.isArray(values)&&values.length===1;
  if(scope?.version===DUAL_LINE_SCOPE_VERSION){
    const canonical=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value;
    const phones=[FUMIGACION_BLUE,FUMIGACION_RED],starts=scope.lineStartsAt;
    if(config.company!=='fumigacion'||config.name!==undefined&&config.name!=='FUMIGACION'||scope.company!=='fumigacion'||scope.authorizationSource!==DUAL_LINE_AUTHORIZATION_SOURCE||
      !Array.isArray(scope.activeLines)||scope.activeLines.length!==2||new Set(scope.activeLines).size!==2||phones.some(phone=>!scope.activeLines.includes(phone))||
      !Array.isArray(scope.suspendedLines)||scope.suspendedLines.length!==0||!Array.isArray(lines)||lines.length!==2||
      !lines.some(line=>line.phone===FUMIGACION_BLUE&&line.instance==='cucaracha-azul')||!lines.some(line=>line.phone===FUMIGACION_RED&&line.instance==='cucaracha-roja')||
      !canonical(scope.authorizedAt)||!starts||typeof starts!=='object'||Array.isArray(starts)||Object.keys(starts).length!==2||phones.some(phone=>!canonical(starts[phone]))||
      starts[FUMIGACION_BLUE]!==scope.authorizedAt||Date.parse(starts[FUMIGACION_RED])<=Date.parse(scope.authorizedAt)||
      Number.isFinite(config.activatedAt)&&Date.parse(scope.authorizedAt)<config.activatedAt)throw Error('OPERATIONAL_LINE_SCOPE_REQUIRED');
    return scope;
  }
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    config.company!=='fumigacion'||(config.name!==undefined&&config.name!=='FUMIGACION')||
    scope.company!=='fumigacion'||scope.version!==BLUE_ONLY_SCOPE_VERSION||
    scope.authorizationSource!==BLUE_ONLY_AUTHORIZATION_SOURCE||
    !exactPhones(scope.activeLines)||scope.activeLines[0]!==FUMIGACION_BLUE||
    !exactPhones(scope.suspendedLines)||scope.suspendedLines[0]!==FUMIGACION_RED||
    !Array.isArray(lines)||lines.length!==2||
    new Set(lines.map(line=>line.phone)).size!==2||
    !lines.some(line=>line.phone===FUMIGACION_BLUE)||!lines.some(line=>line.phone===FUMIGACION_RED)||
    typeof scope.authorizedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(scope.authorizedAt)||
    !Number.isFinite(Date.parse(scope.authorizedAt))||
    (Number.isFinite(config.activatedAt)&&Date.parse(scope.authorizedAt)<config.activatedAt)||
    (scope.reportedBlockedDurationHours!==undefined&&scope.reportedBlockedDurationHours!==24)){
    throw Error('OPERATIONAL_LINE_SCOPE_REQUIRED');
  }
  return scope;
}

export function operationalLines(config){
  const scope=assertOperationalLineScope(config);
  return scope?config.lines.filter(line=>scope.activeLines.includes(line.phone)):config.lines;
}

export function operationalLineAllowed(config,phone){
  return operationalLines(config).some(line=>line.phone===phone);
}

export function operationalLineStartsAt(config,phone){
  const scope=assertOperationalLineScope(config);
  // A suspended own line retains the historical source date for review
  // classification. This is never a grant: callers still check allowed lines.
  if(scope?.version===BLUE_ONLY_SCOPE_VERSION&&config.lines.some(line=>line.phone===phone))return Date.parse(scope.authorizedAt);
  if(!operationalLineAllowed(config,phone))return Number.MAX_SAFE_INTEGER;
  if(!scope)return Number.isFinite(config.activatedAt)?config.activatedAt:0;
  return Date.parse(scope.version===DUAL_LINE_SCOPE_VERSION?scope.lineStartsAt[phone]:scope.authorizedAt);
}

export function operationalHistoryGuard(config){
  const scope=assertOperationalLineScope(config);
  return scope?.version===DUAL_LINE_SCOPE_VERSION?'authorized-fumigacion-dual-prospective-canonical-and-alternate-phone-v1':scope?'authorized-fumigacion-blue-only-canonical-and-alternate-phone-v1':'canonical-and-alternate-phone-v2';
}

export function operationalCoverage(config){
  const scope=assertOperationalLineScope(config);
  return {
    mode:scope?scope.version:'own-company-lines',
    activeLines:operationalLines(config).map(line=>line.phone),
    suspendedLines:scope?[...scope.suspendedLines]:[],
    fullCompanyCoverageComplete:!scope,
    suspendedLineCoverageComplete:scope?false:null,
    ...(scope?.version===DUAL_LINE_SCOPE_VERSION?{allOwnLinesOperational:true,lineStartsAt:{...scope.lineStartsAt},historyCoverageComplete:false}:{}),
    ...(scope?{authorizedAt:scope.authorizedAt,authorizationSource:scope.authorizationSource,
      ...(scope.reportedBlockedDurationHours===undefined?{}:{reportedBlockedDurationHours:scope.reportedBlockedDurationHours})}:{})
  };
}
