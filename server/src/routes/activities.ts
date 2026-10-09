import { activityOfflineSnapshot } from '../services/ActivityOfflineService'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import prisma from '../config/database'
import { ACTIVITY_PREFIX, ensureMigrated, listActivities, saveActivity, quoteActivities, migrateActivities, publicActivities, records, putRecord, createActivityGroup, joinActivityGroup, fulfilActivityGrant, notifyActivities, claimActivityCoupon, linkActivityReferral } from '../services/ActivityService'
import { activityState } from '../utils/activities'

const router=Router()
router.use(authenticate,authorize('admin','manager','cashier'))
router.use(async(req:AuthRequest,res,next)=>{try{if(!req.user?.storeId)return res.status(403).json({code:403,message:'Store is required'});if(req.query.storeId&&req.query.storeId!==req.user.storeId)return res.status(403).json({code:403,message:'Store access denied'});if(!req.path.startsWith('/migration'))await ensureMigrated(req.user.storeId);next()}catch(error:any){res.status(409).json({code:409,message:error.message})}})
const run=(fn:(req:AuthRequest)=>Promise<any>)=>async(req:AuthRequest,res:any)=>{try{res.json({code:200,data:await fn(req)})}catch(error:any){res.status(error instanceof z.ZodError?400:409).json({code:error instanceof z.ZodError?400:409,message:error.message})}}
router.get('/',run(async req=>(await listActivities(req.user!.storeId)).map(a=>({...a,state:activityState(a)}))))
router.get('/offline-snapshot',run(req=>activityOfflineSnapshot(req.user!.storeId)))
router.get('/display',run(req=>publicActivities(req.user!.storeId)))
router.get('/resources',run(async req=>{const storeId=req.user!.storeId;const [products,rewards,coupons]=await Promise.all([prisma.product.findMany({where:{storeId,status:'active'},include:{specs:true,addons:{include:{addon:true}}}}),prisma.rewardCatalog.findMany({where:{storeId,isActive:true}}),prisma.coupon.findMany({where:{storeId,status:'active'}})]);return {products,rewards,coupons}}))
const quoteSchema=z.object({items:z.array(z.object({productId:z.string(),specId:z.string(),quantity:z.number().int().min(1).max(500),unitPrice:z.number().int().min(0),addons:z.array(z.object({name:z.string(),price:z.number().int().min(0),qty:z.number().int().min(1).max(100).optional()})).optional()})).min(1).max(100).refine(items=>items.reduce((sum,i)=>sum+i.quantity,0)<=5000,'Maximum 5000 cups'),channel:z.string().optional(),channelId:z.string().optional(),paymentMethod:z.string().optional(),memberId:z.string().optional(),couponId:z.string().optional(),pointsRequested:z.number().int().min(0).optional(),groupId:z.string().optional(),giftSelections:z.record(z.string()).optional(),taxEnabled:z.boolean().optional()})
router.post('/claim',run(req=>{const p=z.object({activityId:z.string(),memberId:z.string(),requestId:z.string().uuid()}).parse(req.body);return claimActivityCoupon(req.user!.storeId,p.activityId,p.memberId,p.requestId)}))
router.post('/referral',run(req=>{const p=z.object({memberId:z.string(),inviterCode:z.string().min(1).max(100)}).parse(req.body);return linkActivityReferral(req.user!.storeId,p.memberId,p.inviterCode)}))
router.post('/quote',run(req=>quoteActivities(req.user!.storeId,quoteSchema.parse(req.body) as any)))
router.post('/migration/preview',authorize('admin','manager'),run(req=>migrateActivities(req.user!.storeId,true)))
router.post('/migration/apply',authorize('admin','manager'),run(async req=>{const result=await migrateActivities(req.user!.storeId,false);notifyActivities(req.user!.storeId);return result}))
router.post('/',authorize('admin','manager'),run(req=>saveActivity(req.user!.storeId,req.body)))
router.put('/:id',authorize('admin','manager'),run(req=>{const {version,...data}=req.body;return saveActivity(req.user!.storeId,data,req.params.id,version)}))
router.delete('/:id',authorize('admin','manager'),run(async req=>{const a=(await listActivities(req.user!.storeId)).find(a=>a.id===req.params.id);if(!a)throw Error('ACTIVITY_NOT_FOUND');const {id,storeId,version,used,source,conflict,...data}=a;return saveActivity(storeId,{...data,status:'ended'},id,version)}))
router.get('/entitlements/list',run(async req=>{const grants=await records<any>(prisma,req.user!.storeId,'grant.');return grants.filter(g=>!req.query.orderId||g.orderId===req.query.orderId).map(({plan,memberId,inviterId,...g})=>({...g,name:plan.activity.name,type:plan.activity.type}))}))
router.post('/entitlements/:id/fulfil',run(req=>fulfilActivityGrant(req.user!.storeId,req.params.id)))
router.get('/groups/list',run(req=>records(prisma,req.user!.storeId,'group.')))
router.post('/groups',run(req=>{const input=z.object({activityId:z.string(),memberIds:z.array(z.string()).min(1).max(100)}).parse(req.body);return createActivityGroup(req.user!.storeId,input.activityId,input.memberIds)}))
router.post('/groups/:id/join',run(req=>joinActivityGroup(req.user!.storeId,req.params.id,z.object({memberId:z.string()}).parse(req.body).memberId)))
router.post('/heartbeat',run(async req=>{const input=z.object({terminalId:z.string().uuid(),version:z.number().int().min(0)}).parse(req.body);const value={id:input.terminalId,kind:'pos',version:input.version,lastSeen:new Date().toISOString()};await putRecord(prisma,req.user!.storeId,ACTIVITY_PREFIX+'terminal.'+input.terminalId,value);return value}))
router.get('/terminals/list',authorize('admin','manager'),run(async req=>(await records<any>(prisma,req.user!.storeId,'terminal.')).map(t=>({...t,online:Date.now()-Date.parse(t.lastSeen)<45000}))))
export {router as activitiesRouter}
