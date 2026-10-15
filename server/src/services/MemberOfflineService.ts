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
  const orders=await tx.order.findMany({where:{storeId,createdAt:{gte:new Date(issuedAt.getTime()-POS_OFFLINE_TTL_MS)}},select:{memberId:true,orderNumber:true}})
  return {issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString(),next:members.length===200?members[members.length-1].id:null,members:members.map(m=>{
   const member={id:m.id,storeId:m.storeId,name:m.name,phone:m.phone,level:m.level,points:m.points,balance:m.balance,totalSpent:m.totalSpent,birthday:m.birthday,status:m.status,updatedAt:m.updatedAt}
   const coupons=m.coupons.filter(c=>c.status==='unused'&&c.coupon.status==='active'&&c.coupon.storeId===storeId)
   const payload={purpose:'pos-offline-member',storeId,member,rule,coupons,issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString()}
   return {...payload,includedOrders:orders.map(o=>o.orderNumber),token:jwt.sign(payload,config.jwt.secret,{audience:'pos-offline-member',expiresIn:`${POS_OFFLINE_DAYS}d`})}
  })}
 },{isolationLevel:process.env.DATABASE_URL?.startsWith('file:')?'Serializable':'RepeatableRead'})
}
export function verifyOfflineMember(token:string,storeId:string,memberId:string,occurredAt:string){
 const at=Date.parse(occurredAt)
 const evidence=jwt.verify(token,config.jwt.secret,{audience:'pos-offline-member',clockTimestamp:Math.floor(at/1000)}) as any
 if(evidence.purpose!=='pos-offline-member'||evidence.storeId!==storeId||evidence.member?.id!==memberId||!Number.isFinite(at)||at<Date.parse(evidence.issuedAt)||at>Date.parse(evidence.expiresAt)||at>Date.now()+60000)throw Error('OFFLINE_MEMBER_AUTHORIZATION_INVALID')
 return evidence
}
