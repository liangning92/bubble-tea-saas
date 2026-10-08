import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'
import { config as env } from '../config/env'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import socketManager from '../socket'
import { normalizeTvConfig, pickTvPrize } from '../utils/tvScreenConfig'
import { verifyTvDisplayToken } from '../utils/tvDisplayToken'

const router = Router()
const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const url = z.string().max(2048).refine(v => !v || /^https?:\/\//i.test(v) || /^\/uploads\//.test(v), 'Use an uploaded file or HTTP(S) URL')
const text = z.string().max(1000)
const schema = z.object({
  enabled: z.boolean(), storeName: text, welcomeText: text, carouselIntervalSeconds: z.number().int().min(2).max(300),
  layout: z.object({ columns: z.tuple([z.object({ width: z.number().min(10).max(90), content: z.literal('media') }), z.object({ width: z.number().min(10).max(90), content: z.literal('specials') })]) }).refine(v => (v.columns[0].width + v.columns[1].width) === 100, 'Column widths must total 100'),
  mediaFiles: z.array(z.object({ url, title: text.optional(), subtitle: text.optional() })).max(100),
  dailySpecials: z.array(z.object({ productId: z.string().optional(), autoPrice: z.boolean().optional(), applicableChannels: z.array(z.enum(['DINE_IN','TAKEAWAY','GOFOOD','GRAB','SHOPEE','POS'])).optional(), dayOfWeek: z.number().int().min(0).max(6), productName: text, originalPrice: z.number().int().min(0), specialPrice: z.number().int().min(0), tag: text, imageUrl: url, description: text })).max(7).refine(rows=>new Set(rows.map(r=>r.dayOfWeek)).size===rows.length,'Each weekday may have one offer'),
  lottery: z.object({ enabled: z.boolean(), triggerMinOrderAmount: z.number().int().min(0), title: text, subtitle: text, prizes: z.array(z.object({ id: text, name: text.min(1), code: text, color, weight: z.number().min(0).max(1000000) })).max(30) }).refine(v=>!v.enabled || v.prizes.some(p=>p.weight>0),'Enabled lottery needs a positive-weight prize'),
  ticker: z.object({ enabled: z.boolean(), text }),
})
const key = 'tv_screen_marketing_config'
async function readConfig(storeId: string) {
  const row = await prisma.config.findUnique({ where: { storeId_key: { storeId, key } } })
  try { return normalizeTvConfig(row ? JSON.parse(row.value) : undefined) } catch { return normalizeTvConfig(undefined) }
}
router.get('/config', (req, res, next) => {
  if (req.query.displayToken) {
    try {
      const storeId = verifyTvDisplayToken(String(req.query.displayToken))
      if (req.query.storeId && req.query.storeId !== storeId) return res.status(403).json({ code:403,message:'Display store mismatch' })
      ;(req as any).tvStoreId = storeId; next()
    } catch { res.status(401).json({ code:401,message:'Invalid display link; open a new link from marketing settings' }) }
  } else authenticate(req as AuthRequest, res, () => authorize('admin','manager','cashier')(req as AuthRequest,res,next))
}, async (req: AuthRequest, res) => {
  try {
    const storeId = (req as any).tvStoreId || req.user!.storeId
    const config = await readConfig(storeId)
    const displayToken = req.user && ['admin','manager'].includes(req.user.role) ? jwt.sign({ purpose:'tv-display',storeId },env.jwt.secret,{expiresIn:'30d'}) : undefined
    res.json({code:200,data:{...config,...(displayToken?{displayToken}:{})}})
  } catch { res.status(500).json({code:500,message:'Failed to load TV configuration'}) }
})
router.post('/config',authenticate,authorize('admin','manager'),async(req:AuthRequest,res)=>{
  const parsed=schema.safeParse(req.body)
  if(!parsed.success) return res.status(400).json({code:400,message:parsed.error.issues.map(i=>i.message).join('; ')})
  try {
    const storeId=req.user!.storeId
    for (const offer of parsed.data.dailySpecials) {
      if (!offer.autoPrice) continue
      if (!offer.productId || !await prisma.product.findFirst({where:{id:offer.productId,storeId,status:'active'}})) return res.status(400).json({code:400,message:'Automatic pricing requires an active product from this store'})
    }
    await prisma.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:JSON.stringify(parsed.data),category:'marketing'},update:{value:JSON.stringify(parsed.data)}})
    socketManager.emitTVConfigUpdate(storeId,parsed.data)
    res.json({code:200,data:parsed.data})
  } catch {res.status(500).json({code:500,message:'Failed to save TV configuration'})}
})
router.post('/trigger-lottery',authenticate,authorize('admin','manager','cashier'),async(req:AuthRequest,res)=>{
  try {
    const storeId=req.user!.storeId
    const cfg=await readConfig(storeId)
    if(!cfg.enabled || !cfg.lottery.enabled) return res.json({code:200,data:null,message:'TV lottery is disabled'})
    const testMode=req.body.testMode===true
    if(testMode && !['admin','manager'].includes(req.user!.role)) return res.status(403).json({code:403,message:'Only managers can test the display'})
    let orderId:string|undefined,orderNumber='TEST'
    if(!testMode){
      if(typeof req.body.orderId!=='string')return res.status(400).json({code:400,message:'A completed order ID is required'})
      const order=await prisma.order.findUnique({where:{id:req.body.orderId}})
      if(!order || order.storeId!==storeId || order.status!=='completed') return res.status(400).json({code:400,message:'Completed order not found in this store'})
      if(order.finalAmount<cfg.lottery.triggerMinOrderAmount) return res.json({code:200,data:null,message:'Order below lottery threshold'})
      orderId=order.id;orderNumber=order.pickupNumber||order.orderNumber
    }
    const chosen=pickTvPrize(cfg.lottery.prizes)
    if(!chosen) return res.status(400).json({code:400,message:'Configure a positive-weight prize first'})
    let data={orderId,orderNumber,prizeName:chosen.prize.name,prizeCode:chosen.prize.code,prizeIndex:chosen.index,testMode}
    if(orderId){
      const resultKey=`tv_lottery_order:${orderId}`
      try{await prisma.config.create({data:{storeId,key:resultKey,value:JSON.stringify(data),category:'marketing'}})}catch(error:any){
        if(error.code!=='P2002')throw error
        const prior=await prisma.config.findUnique({where:{storeId_key:{storeId,key:resultKey}}})
        return res.json({code:200,data:prior?JSON.parse(prior.value):null,replayed:true})
      }
    }
    socketManager.emitTVLotteryTrigger(storeId,data)
    res.json({code:200,data})
  }catch{res.status(500).json({code:500,message:'Failed to trigger TV lottery'})}
})
export {router as tvScreenRouter}
