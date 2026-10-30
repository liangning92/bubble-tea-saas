/** A slow model response is not proof of a broken connection. */
export function nativePollDelayed(job:{lastPollFault?:string;firstPollFaultAt?:string;pollFaultCount?:number},now=Date.now()){
 return job.lastPollFault==='NATIVE_RUN_DEADLINE'||!!job.firstPollFaultAt&&(job.pollFaultCount||0)>=2&&now-Date.parse(job.firstPollFaultAt)>=60000
}
