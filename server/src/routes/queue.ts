import {Router} from 'express'
import {randomUUID} from 'crypto'
import {z} from 'zod'
import prisma from '../config/database'
import {authenticate,authorize,AuthRequest} from '../middlewares/auth'
import {formatDate,startOfDay,endOfDay} from '../utils/dateUtils'
const router=Router()
const key=()=>`queue.${formatDate(new Date())}`
type Ticket={id:string;requestId:string;ticketNumber:number;status:'waiting'|'called'|'served'|'cancelled';createdAt:string;calledAt?:string;orderId?:string;orderNumber?:string;orderCount?:number}
type Queue={nextNumber:number;tickets:Ticket[]}
async function read(tx:any,storeId:string,recordKey=key()):Promise<Queue>{const row=await tx.config.findUnique({where:{storeId_key:{storeId,key:recordKey}}});return row?JSON.parse(row.value):{nextNumber:1,tickets:[]}}
router.use(authenticate,authorize('admin','manager','cashier'))
router.get('/',async(req:AuthRequest,res,next)=>{try{res.json({code:200,data:await mutate(req.user!.storeId,()=>{})})}catch(e){next(e)}})
async function mutate(storeId:string,action:(q:Queue)=>void){
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const now=new Date(),recordKey=`queue.${formatDate(now)}`,q=await read(tx,storeId,recordKey)
  const orders=await tx.order.findMany({where:{storeId,createdAt:{gte:startOfDay(now),lte:endOfDay(now)},status:{in:['paid','completed','ready']},requestFingerprint:{not:null}},select:{id:true,orderNumber:true,createdAt:true,items:{select:{quantity:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}],take:5000})
  for(const order of orders){if(q.tickets.some(t=>t.orderId===order.id))continue;if(q.tickets.length>=5000)break;q.tickets.push({id:randomUUID(),requestId:`order:${order.id}`,orderId:order.id,orderNumber:order.orderNumber,orderCount:order.items.reduce((sum,i)=>sum+i.quantity,0),ticketNumber:q.nextNumber++,status:'waiting',createdAt:order.createdAt.toISOString()})}
  action(q);const value=JSON.stringify(q)
  await tx.config.upsert({where:{storeId_key:{storeId,key:recordKey}},create:{storeId,key:recordKey,value,category:'queue'},update:{value}})
  return q
 })
}
router.post('/',async(req:AuthRequest,res,next)=>{try{
 const {requestId}=z.object({requestId:z.string().uuid()}).parse(req.body)
 const data=await mutate(req.user!.storeId,q=>{if(q.tickets.some(t=>t.requestId===requestId))return;if(q.tickets.length>=5000)throw Error('QUEUE_DAILY_LIMIT');q.tickets.push({id:randomUUID(),requestId,ticketNumber:q.nextNumber++,status:'waiting',createdAt:new Date().toISOString()})})
 res.status(201).json({code:201,data})
}catch(e){next(e)}})
router.post('/call-next',async(req:AuthRequest,res,next)=>{try{const data=await mutate(req.user!.storeId,q=>{const t=q.tickets.find(t=>t.status==='waiting');if(t){t.status='called';t.calledAt=new Date().toISOString()}});res.json({code:200,data})}catch(e){next(e)}})
router.put('/:id/status',async(req:AuthRequest,res,next)=>{try{
 const {status}=z.object({status:z.enum(['served','cancelled'])}).parse(req.body)
 const data=await mutate(req.user!.storeId,q=>{const t=q.tickets.find(t=>t.id===req.params.id);if(!t)throw Error('QUEUE_TICKET_NOT_FOUND');if(t.status===status)return;if(t.status!=='called'&&!(t.status==='waiting'&&status==='cancelled'))throw Error('QUEUE_STATUS_CONFLICT');t.status=status})
 res.json({code:200,data})
}catch(e){next(e)}})
export {router as queueRouter}
