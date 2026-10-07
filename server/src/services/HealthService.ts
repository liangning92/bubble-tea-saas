import prisma from '../config/database'
import {createConnection} from 'net'
async function redisReady(raw:string):Promise<boolean>{
 const url=new URL(raw)
 return new Promise(resolve=>{
  const socket=createConnection({host:url.hostname,port:Number(url.port||6379)});let finished=false,reply=''
  const finish=(ok:boolean)=>{if(finished)return;finished=true;socket.destroy();resolve(ok)}
  const timer=setTimeout(()=>finish(false),1500);timer.unref()
  socket.on('connect',()=>{
   const command=(parts:string[])=>`*${parts.length}\r\n`+parts.map(s=>`$${Buffer.byteLength(s)}\r\n${s}\r\n`).join('')
   if(url.password)socket.write(command(url.username?['AUTH',decodeURIComponent(url.username),decodeURIComponent(url.password)]:['AUTH',decodeURIComponent(url.password)]))
   socket.write(command(['PING']))
  })
  socket.on('data',data=>{reply+=data.toString();if(reply.includes('-'))finish(false);if(reply.includes('+PONG\r\n'))finish(true)})
  socket.on('error',()=>finish(false));socket.on('close',()=>{clearTimeout(timer);finish(false)})
 })
}
export async function serviceHealth(){
 const db = await Promise.race([prisma.$queryRaw`SELECT 1`.then(()=>true,()=>false),new Promise<boolean>(resolve=>{const timer=setTimeout(()=>resolve(false),2000);timer.unref()})])
 const redis = process.env.REDIS_URL ? await redisReady(process.env.REDIS_URL).catch(()=>false) : null
 return {status:db&&redis!==false?'ok':'degraded',dependencies:{database:db?'ok':'unavailable',redis:redis===null?'not_configured':redis?'ok':'unavailable'},timestamp:new Date().toISOString(),service:'bubble-tea-api',version:process.env.APP_VERSION||'development',sourceSha:process.env.APP_SOURCE_SHA||null,capabilities:{orderReceipt:1,refundItems:2,inventoryCount:3,delivery:'pending'}}
}
