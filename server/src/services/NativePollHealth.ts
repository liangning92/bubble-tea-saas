/** A slow model response is not proof of a broken connection. */
export function nativePollDelayed(job:{lastPollFault?:string;firstPollFaultAt?:string;pollFaultCount?:number},now=Date.now()){
 return job.lastPollFault==='NATIVE_RUN_DEADLINE'||!!job.firstPollFaultAt&&(job.pollFaultCount||0)>=2&&now-Date.parse(job.firstPollFaultAt)>=60000
}

/** Visible waiting feedback also applies while transport remains healthy.
 * This does not fail, cancel, resubmit or publish a connection-error message. */
export function nativeReplyDelayed(job:{createdAt:string;lastPollFault?:string;firstPollFaultAt?:string;pollFaultCount?:number},now=Date.now()){
 return nativePollDelayed(job,now)||now-Date.parse(job.createdAt)>=10000
}
