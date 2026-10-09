// This temporary route is an explicit instruction, never an inference from a
// disconnected channel. Both company bindings and their history stay intact.
export const BLUE_ONLY_SCOPE_VERSION='authorized-fumigacion-blue-only-v1';
export const BLUE_ONLY_AUTHORIZATION_SOURCE='direct-user-20261009-red-block-24h';
export const FUMIGACION_BLUE='573126944997';
export const FUMIGACION_RED='573126938721';

export function assertOperationalLineScope(config){
  const scope=config.operationalLineScope;
  if(scope==null)return null;
  const lines=config.lines;
  const exactPhones=values=>Array.isArray(values)&&values.length===1;
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

export function operationalHistoryGuard(config){
  return assertOperationalLineScope(config)?'authorized-fumigacion-blue-only-canonical-and-alternate-phone-v1':'canonical-and-alternate-phone-v2';
}

export function operationalCoverage(config){
  const scope=assertOperationalLineScope(config);
  return {
    mode:scope?BLUE_ONLY_SCOPE_VERSION:'own-company-lines',
    activeLines:operationalLines(config).map(line=>line.phone),
    suspendedLines:scope?[...scope.suspendedLines]:[],
    fullCompanyCoverageComplete:!scope,
    suspendedLineCoverageComplete:scope?false:null,
    ...(scope?{authorizedAt:scope.authorizedAt,authorizationSource:scope.authorizationSource,
      ...(scope.reportedBlockedDurationHours===undefined?{}:{reportedBlockedDurationHours:scope.reportedBlockedDurationHours})}:{})
  };
}
