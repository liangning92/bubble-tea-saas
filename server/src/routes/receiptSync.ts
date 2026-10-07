import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { config } from '../config/env'
import { receiveReceipt, sendReceipts } from '../services/ReceiptSyncService'
const CLOUD_API='https://api.aicube.online'
export function receiptTicket(storeId:string,cloudToken:string){
 return jwt.sign({purpose:'pos-receipt-sync',storeId,cloudToken},config.jwt.secret,{expiresIn:'5m'})
}
export function createReceiptSyncRouter(db:PrismaClient,cloudApi=CLOUD_API){
 const router=Router()
 router.post('/receipts',authenticate,async(req:AuthRequest,res)=>{
  try{const data=await receiveReceipt(db,req.body,req.user!.storeId,req.user!.id);res.json({code:200,data})}
  catch(error){
   const message=error instanceof Error?error.message:''
   const status=message==='RECEIPT_STORE_MISMATCH'?403:message==='RECEIPT_SYNC_CONFLICT'||(error as {code?:string})?.code==='P2002'?409:400
   res.status(status).json({code:status,message:message.startsWith('RECEIPT_')||message==='INVALID_RECEIPT_EVIDENCE'?message:'INVALID_RECEIPT'})
  }
 })
 router.post('/receipts/send',authenticate,async(req:AuthRequest,res)=>{
  if(!config.databaseUrl.startsWith('file:'))return res.status(409).json({code:409,message:'LOCAL_SQLITE_REQUIRED'})
  const parsed=z.object({ticket:z.string().max(20000),cursor:z.string().max(128).optional()}).strict().safeParse(req.body)
  if(!parsed.success)return res.status(400).json({code:400,message:'INVALID_SYNC_REQUEST'})
  let ticket:JwtPayload
  try{
   const decoded=jwt.verify(parsed.data.ticket,config.jwt.secret)
   if(typeof decoded==='string'||decoded.purpose!=='pos-receipt-sync'||typeof decoded.cloudToken!=='string'||typeof decoded.storeId!=='string'||typeof decoded.exp!=='number')throw new Error('Invalid ticket')
   ticket=decoded
  }catch{return res.status(401).json({code:401,message:'REAUTHENTICATE_CLOUD_SYNC'})}
  if(!req.user!.storeId||ticket.storeId!==req.user!.storeId)return res.status(403).json({code:403,message:'RECEIPT_STORE_MISMATCH'})
  try{res.json({code:200,data:await sendReceipts(db,req.user!.storeId,ticket.cloudToken,cloudApi,parsed.data.cursor)})}
  catch{res.status(500).json({code:500,message:'RECEIPT_SEND_FAILED'})}
 })
 return router
}
