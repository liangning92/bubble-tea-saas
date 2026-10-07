export function varianceClassification(theoretical:number,actual:number|null,warning:number,critical:number,enabled=true){
 if(!Number.isFinite(theoretical)||actual===null||!Number.isFinite(actual))return {variance:null,variancePercent:null,varianceStatus:'unavailable' as const}
 const variance=actual-theoretical
 if(theoretical===0&&variance!==0)return {variance,variancePercent:null,varianceStatus:'unavailable' as const}
 const variancePercent=theoretical===0?0:Math.abs(variance)/Math.abs(theoretical)*100
 return {variance,variancePercent,varianceStatus:(!enabled?'normal':variancePercent>=critical?'critical':variancePercent>=warning?'warning':'normal') as 'normal'|'warning'|'critical'}
}
