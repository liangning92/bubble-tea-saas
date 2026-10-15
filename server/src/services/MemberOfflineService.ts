import jwt from 'jsonwebtoken'
import prisma from '../config/database'
import { config } from '../config/env'
import { POS_OFFLINE_TTL_MS,POS_OFFLINE_DAYS } from '../utils/offlinePolicy'
import { getOrCreatePointsRule } from './PointsRuleService'
/** Single POS policy: local receipts are authoritative; reconciliation never overwrites an external edit. */
export async function memberOfflineSnapshot(storeId:string,after?:string){
 const rule=await getOrCreatePointsRule(storeId),issuedAt=new Date(),expiresAt=new Date(issuedAt.getTime()+POS_OFFLINE_TTL_MS)
 return prisma.$transaction(async tx=>{
  const members=await tx.member.findMany({where:{storeId,status:'active',...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:200,include:{coupons:{include:{coupon:true}}}})
  const orders=await tx.order.findMany({where:{storeId,OR:[{createdAt:{gte:new Date(issuedAt.getTime()-POS_OFFLINE_TTL_MS)}},{updatedAt:{gte:new Date(issuedAt.getTime()-POS_OFFLINE_TTL_MS)}}]},select:{memberId:true,orderNumber:true}})
  const operations=await tx.config.findMany({where:{storeId,key:{startsWith:'pos.offline.operation:'},createdAt:{gte:new Date(issuedAt.getTime()-POS_OFFLINE_TTL_MS)}},select:{key:true}})
  const includedOfflineOperationIds=operations.map(o=>o.key.slice('pos.offline.operation:'.length))
  const registration={purpose:'pos-offline-member-registration',storeId,rule,welcomePoints:100,issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString()}
  return {includedOfflineOperationIds,includedOrders:orders.map(o=>o.orderNumber),registration:{...registration,token:jwt.sign(registration,config.jwt.secret,{audience:'pos-offline-member',expiresIn:`${POS_OFFLINE_DAYS}d`})},issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString(),next:members.length===200?members[members.length-1].id:null,members:members.map(m=>{
   const member={id:m.id,storeId:m.storeId,name:m.name,phone:m.phone,level:m.level,points:m.points,balance:m.balance,totalSpent:m.totalSpent,birthday:m.birthday,referralCode:m.referralCode,status:m.status,updatedAt:m.updatedAt}
   const coupons=m.coupons.filter(c=>c.status==='unused'&&c.coupon.status==='active'&&c.coupon.storeId===storeId)
   const payload={purpose:'pos-offline-member',storeId,member,rule,coupons,issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString()}
   return {...payload,token:jwt.sign(payload,config.jwt.secret,{audience:'pos-offline-member',expiresIn:`${POS_OFFLINE_DAYS}d`})}
  })}
 },{isolationLevel:process.env.DATABASE_URL?.startsWith('file:')?'Serializable':'RepeatableRead'})
}
export async function verifyOfflineMember(token:string,storeId:string,memberId:string,occurredAt:string,db:any=prisma){
 const at=Date.parse(occurredAt)
 const evidence=jwt.verify(token,config.jwt.secret,{audience:'pos-offline-member',clockTimestamp:Math.floor(at/1000)}) as any
 if(!['pos-offline-member','pos-offline-member-registration'].includes(evidence.purpose)||evidence.storeId!==storeId||(evidence.purpose==='pos-offline-member'&&evidence.member?.id!==memberId)||!Number.isFinite(at)||at<Date.parse(evidence.issuedAt)||at>Date.parse(evidence.expiresAt)||at>Date.now()+60000)throw Error('OFFLINE_MEMBER_AUTHORIZATION_INVALID')
 if(evidence.purpose==='pos-offline-member-registration'){
  if(!memberId.startsWith('POSMEMBER-'))throw Error('OFFLINE_MEMBER_AUTHORIZATION_INVALID')
  const receipt=await db.config.findUnique({where:{storeId_key:{storeId,key:'pos.offline.operation:'+memberId.slice(10)}}})
  const saved=receipt?JSON.parse(receipt.value):null
  if(saved?.kind!=='member'||saved.result?.id!==memberId||Date.parse(saved.occurredAt)>at)throw Error('OFFLINE_MEMBER_REGISTRATION_PENDING')
  evidence.member=saved.result;evidence.coupons=[]
 }
 return evidence
}
export function verifyMemberRegistration(token:string,storeId:string,occurredAt:string){
 const at=Date.parse(occurredAt),policy=jwt.verify(token,config.jwt.secret,{audience:'pos-offline-member',clockTimestamp:Math.floor(at/1000)}) as any
 if(policy.purpose!=='pos-offline-member-registration'||policy.storeId!==storeId||policy.welcomePoints!==100||!Number.isFinite(at)||at<Date.parse(policy.issuedAt)||at>Date.parse(policy.expiresAt))throw Error('OFFLINE_MEMBER_AUTHORIZATION_INVALID')
 return policy
}
