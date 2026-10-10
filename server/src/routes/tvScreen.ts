import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'
import { config as env } from '../config/env'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import socketManager from '../socket'
import { normalizeTvConfig, pickTvPrize } from '../utils/tvScreenConfig'
import { verifyTvDisplayToken } from '../utils/tvDisplayToken'
import { ACTIVITY_PREFIX, ensureMigrated, publicActivities, listActivities, records, putRecord, processActivityGrant, displayPrizes } from '../services/ActivityService'
import { activityEligible } from '../utils/activities'
const router=Router(),key='tv_screen_marketing_config'
const text=z.string().max(1000),url=z.string().max(2048).refine(v=>!v||/^https?:\/\//i.test(v)||/^\/uploads\//.test(v),'Use an uploaded file or HTTP(S) URL')
const schema=z.object({enabled:z.boolean(),storeName:text,welcomeText:text,carouselIntervalSeconds:z.number().int().min(2).max(300),layout:z.object({columns:z.tuple([z.object({width:z.number().min(10).max(90),content:z.literal('media')}),z.object({width:z.number().min(10).max(90),content:z.literal('specials')})])}).refine(v=>v.columns[0].width+v.columns[1].width===100,'Column widths must total 100'),mediaFiles:z.array(z.object({url,title:text.optional(),subtitle:text.optional()})).max(100),ticker:z.object({enabled:z.boolean(),text}),idleProductsEnabled:z.boolean().default(true),idleProductIds:z.array(z.string().min(1).max(100)).max(100).default([]),idleMusic:z.object({enabled:z.boolean(),volume:z.number().min(0).max(1),tracks:z.array(z.object({url:url.refine(v=>!!v,'Music URL is required'),title:text.optional()})).max(100)}).default({enabled:false,volume:0.4,tracks:[]}),soundEnabled:z.boolean().default(true)}).strict()
const access=(req:AuthRequest,res:any,next:any)=>{const token=req.get('X-TV-Display-Token')||req.query.displayToken
 if(token){try{const storeId=verifyTvDisplayToken(String(token));if(req.query.storeId&&req.query.storeId!==storeId)return res.status(403).json({code:403,message:'Display store mismatch'});(req as any).tvStoreId=storeId;next()}catch{res.status(401).json({code:401,message:'Invalid display link; open a new link from settings'})}}
 else authenticate(req,res,()=>authorize('admin','manager','cashier')(req,res,next))}
const store=(req:AuthRequest)=>(req as any).tvStoreId||req.user!.storeId
const run=(fn:(req:AuthRequest)=>Promise<any>)=>async(req:AuthRequest,res:any)=>{try{res.json({code:200,data:await fn(req)})}catch(e:any){res.status(e instanceof z.ZodError?400:409).json({code:409,message:e.message})}}
router.get('/config',access,run(async req=>{
 const storeId=store(req);await ensureMigrated(storeId)
 const row=await prisma.config.findUnique({where:{storeId_key:{storeId,key}}});const cfg=normalizeTvConfig(row?JSON.parse(row.value):undefined)
 const display=await publicActivities(storeId),activities=await listActivities(storeId),now=new Date()
 const lottery=activities.find(a=>a.type==='lottery'&&activityEligible(a,{now,channel:''},false))
 const dailySpecials=display.activities.filter(a=>a.type==='special_price').flatMap(a=>a.products.map(p=>({productId:p.id,dayOfWeek:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en',{timeZone:a.timezone,weekday:'short'}).format(now)),productName:p.name,originalPrice:p.specs[0]?.price||0,specialPrice:a.rule.price||0,tag:a.name,imageUrl:a.imageUrl||p.image||'',description:a.description})))
 const products=cfg.idleProductsEnabled?await prisma.product.findMany({where:{storeId,status:'active',image:{not:null},...(cfg.idleProductIds.length?{id:{in:cfg.idleProductIds}}:{})},select:{id:true,name:true,image:true,specs:{select:{price:true}}},orderBy:[{name:'asc'},{id:'asc'}]}):[]
 const idleProducts=products.filter(p=>!!p.image?.trim()).map(p=>({id:p.id,name:p.name,image:p.image!,...(p.specs.length?{price:Math.min(...p.specs.map(s=>s.price))}:{})}))
 const displayToken=req.user&&['admin','manager'].includes(req.user.role)?jwt.sign({purpose:'tv-display',storeId},env.jwt.secret,{expiresIn:'30d'}):undefined
 return {...cfg,idleProducts,dailySpecials,lottery:lottery?{enabled:true,triggerMinOrderAmount:lottery.rule.minAmount||0,title:lottery.name,subtitle:lottery.description,prizes:displayPrizes(lottery.rule.prizes)}: {...cfg.lottery,enabled:false,prizes:[]},activePromotions:display.activities,activityVersion:display.version,evaluatedAt:display.evaluatedAt,...(displayToken?{displayToken}:{})}
}))
router.post('/config',authenticate,authorize('admin','manager'),run(async req=>{await ensureMigrated(req.user!.storeId);const parsed=schema.parse(req.body);const existing=await prisma.config.findUnique({where:{storeId_key:{storeId:req.user!.storeId,key}}});const previous=normalizeTvConfig(existing?JSON.parse(existing.value):undefined);if(req.body.idleProductsEnabled===undefined)parsed.idleProductsEnabled=previous.idleProductsEnabled;if(req.body.idleProductIds===undefined)parsed.idleProductIds=previous.idleProductIds;if(req.body.idleMusic===undefined)parsed.idleMusic=previous.idleMusic;if(parsed.idleProductIds.length&&(await prisma.product.count({where:{storeId:req.user!.storeId,id:{in:[...new Set(parsed.idleProductIds)]}}}))!==new Set(parsed.idleProductIds).size)throw Error('TV_PRODUCTS_STORE_MISMATCH');const cfg={...parsed,dailySpecials:[],lottery:{enabled:false,triggerMinOrderAmount:0,title:'',subtitle:'',prizes:[]}}
 await putRecord(prisma,req.user!.storeId,key,cfg);socketManager.emitTVConfigUpdate(req.user!.storeId,{refresh:true});return parsed}))
router.get('/events',access,run(async req=>{
 const terminalId=z.string().uuid().parse(req.query.terminalId),storeId=store(req)
 const row=await prisma.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'terminal.'+terminalId}}});const terminal=row?JSON.parse(row.value):{id:terminalId,acknowledged:[]}
 const acknowledgements=new Set((await records<any>(prisma,storeId,'ack.'+terminalId+'.')).map(a=>a.eventId))
 const grants=await records<any>(prisma,storeId,'grant.')
 return grants.filter(g=>g.prize&&['ready','fulfilled'].includes(g.status)&&(g.eventExpiresAt||g.expiresAt)>new Date().toISOString()&&!terminal.acknowledged.includes(g.id)&&!acknowledgements.has(g.id)).map(g=>({eventId:g.id,orderNumber:g.orderNumber,prizeName:g.prize.name,prizeIndex:g.prizeIndex,prizes:displayPrizes(g.prizes)}))
}))
router.post('/heartbeat',access,run(async req=>{const input=z.object({terminalId:z.string().uuid(),version:z.number().int().min(0),acknowledged:z.array(z.string().max(200)).max(100).default([])}).parse(req.body);const storeId=store(req)
 return prisma.$transaction(async tx=>{
 const key=ACTIVITY_PREFIX+'terminal.'+input.terminalId;const row=await tx.config.findUnique({where:{storeId_key:{storeId,key}}});const previous=row?JSON.parse(row.value):{acknowledged:[]}
 const known=new Set((await records<any>(tx,storeId,'grant.')).map(g=>g.id))
 for(const eventId of input.acknowledged.filter(id=>known.has(id)))await putRecord(tx,storeId,ACTIVITY_PREFIX+'ack.'+input.terminalId+'.'+eventId,{eventId,acknowledgedAt:new Date().toISOString()})
 const value={id:input.terminalId,kind:'tv',lastSeen:new Date().toISOString(),version:input.version,acknowledged:[...new Set([...previous.acknowledged,...input.acknowledged.filter(id=>known.has(id))])].slice(-2000)}
 await putRecord(tx,storeId,key,value);return {lastSeen:value.lastSeen}
 })
}))
router.post('/trigger-lottery',authenticate,authorize('admin','manager','cashier'),run(async req=>{
 const storeId=req.user!.storeId;await ensureMigrated(storeId)
 if(req.body.testMode===true){if(!['admin','manager'].includes(req.user!.role))throw Error('Only managers can test the display')
 const a=(await listActivities(storeId)).find(a=>a.type==='lottery'&&activityEligible(a,{channel:''},false));const chosen=a&&pickTvPrize(a.rule.prizes!);if(!chosen)return null
 const event={eventId:'test:'+Date.now(),orderNumber:'TEST',prizeName:chosen.prize.name,prizeIndex:chosen.index,prizes:displayPrizes(a!.rule.prizes),testMode:true};socketManager.emitTVLotteryTrigger(storeId,event);return event}
 const order=await prisma.order.findFirst({where:{id:String(req.body.orderId),storeId,status:'completed'}});if(!order)throw Error('Completed order not found in this store')
 const grants=await records<any>(prisma,storeId,'grant.'+order.id+'.');for(const g of grants.filter(g=>g.plan.activity.type==='lottery'&&g.status==='pending'))await processActivityGrant(storeId,g.id)
 return (await records<any>(prisma,storeId,'grant.'+order.id+'.')).filter(g=>g.prize).map(g=>({eventId:g.id,orderNumber:g.orderNumber,prizeName:g.prize.name,prizeIndex:g.prizeIndex,prizes:displayPrizes(g.prizes)}))
}))
export {router as tvScreenRouter}
