import { bestActivityPrice } from '../../../shared/utils/activities'
import { paymentProblem } from './paymentValidation'
import { db, type LocalOrder } from '../db/offline'
import { backendIdentity, currentBackendIdentity, readBackendAuth } from './backendIdentity'
import { readCheckoutGeneration, readCheckoutRecovery } from './checkoutIntent'
import { posOrderNumber } from './orderNumber'

const cacheKey = (backend: string, storeId: string, path: string) => `offline.snapshot:${encodeURIComponent(backend)}:${encodeURIComponent(storeId)}:${path}`
const allowed = ['/products', '/config', '/channels', '/shifts', '/pos-cash/shifts/current', '/marketing/activity-prices', '/marketing/activities/offline-snapshot']
export function snapshotPath(url: string): string | null {
  const path = url.split('?')[0]
  return allowed.includes(path) ? path : null
}
export function localIdentity(storeId: string): string {
  const auth = readBackendAuth()
  const backend = currentBackendIdentity()
  if (!storeId || !auth.apiUrl || backendIdentity(auth.apiUrl) !== backend || auth.user?.storeId !== storeId || !['cashier','manager','admin'].includes(auth.user.role || '')) throw new Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
  return backend
}
function primitiveFields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  return Object.fromEntries(keys.filter(key=>input[key] !== undefined && (input[key] === null || ['string','number','boolean'].includes(typeof input[key]))).map(key=>[key,input[key]]))
}
function cashierProduct(value: Record<string, unknown>): Record<string, unknown> {
  const specs = Array.isArray(value.specs) ? value.specs : []
  const addons = Array.isArray(value.addons) ? value.addons : []
  return {...primitiveFields(value,['id','storeId','code','name','description','image','categoryId','status','tags','sortOrder']),
    category:primitiveFields(value.category,['id','name']),
    specs:specs.map(spec=>primitiveFields(spec,['id','name','price','priceAdjustment','isDefault'])),
    addons:addons.map(link=>({...primitiveFields(link,['id','addonId']),addon:primitiveFields(link.addon,['id','name','price'])}))}
}
export async function saveSnapshot(path: string, data: unknown, backend: string, storeId: string, complete: boolean): Promise<void> {
  if (localIdentity(storeId) !== backend) throw new Error('CHECKOUT_BACKEND_CHANGED')
  if (!complete) return
  let snapshot = JSON.parse(JSON.stringify(data))
  if (path === '/products') snapshot = {...primitiveFields(snapshot,['code','timestamp']),data:{list:(snapshot.data?.list || []).map(cashierProduct)}}
  if (path === '/marketing/activity-prices') snapshot.data = (Array.isArray(snapshot.data) ? snapshot.data : []).map((rule: any) => ({...primitiveFields(rule,['id','productId','price','startTime','endTime','status']),daysOfWeek:Array.isArray(rule.daysOfWeek)?rule.daysOfWeek:[],channels:Array.isArray(rule.channels)?rule.channels:[]}))
  if (path === '/config') {
    if (!snapshot?.data?.paymentMethods) return
    const keys = ['channelSettings','displaySettings','hardwareSettings','paymentMethods','posLayout','posReceipt','quickAmounts','receiptSettings','shiftSettings','soundSettings','storeInfo','taxSettings','toolbarSettings']
    snapshot.data = Object.fromEntries(Object.entries(snapshot.data).filter(([key])=>keys.includes(key)))
    // Cached remote hardware test commands must never replay while offline.
    if (snapshot.data.hardwareSettings) Object.assign(snapshot.data.hardwareSettings,{testPrint:null,testCashDrawer:null,triggerPrinterDetect:null})
  }
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)))
  const version = Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
  if (localIdentity(storeId) !== backend) throw new Error('CHECKOUT_BACKEND_CHANGED')
  await db.config.put({key:cacheKey(backend,storeId,path),value:{data:snapshot,backend,storeId,version,complete:true},updatedAt:new Date()})
}
export async function readSnapshot(path: string, storeId: string): Promise<unknown> {
  const backend = localIdentity(storeId)
  const row = await db.config.get(cacheKey(backend,storeId,path))
  if (!row || row.value.complete !== true || row.value.backend !== backend || row.value.storeId !== storeId) throw new Error('OFFLINE_INITIALIZATION_REQUIRED')
  return row.value.data
}

/** Financial acceptance is local; cloud delivery status never erases a collected payment. */
export async function recordLocalSale(request: Record<string, any>, totals: Pick<LocalOrder,'subtotal'|'ppn'|'finalAmount'>, generation: string, manualQris = false, cashTender?: {receivedCash:number;changeGiven:number}): Promise<LocalOrder> {
  const backendUrl = localIdentity(request.storeId)
  const auth = readBackendAuth() as ReturnType<typeof readBackendAuth> & {user?:{id?:string;staff?:{id?:string}}}
  if (!auth.user?.id || auth.user.staff?.id !== request.staffId) throw new Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
  if (!['cash','qris'].includes(request.paymentMethod) || (request.paymentMethod === 'qris' && !manualQris) || request.pointsRedeemed || request.memberId || (request.discountAmount&&!request.activityOfflineToken)) throw new Error('OFFLINE_POLICY_UNRESOLVED')
  const localId = `LOCAL-${crypto.randomUUID()}`
  const occurredAt = new Date()
  const original = JSON.parse(JSON.stringify({...request,orderNumber:posOrderNumber(localId, occurredAt)}))
  return db.transaction('rw',db.config,db.orders,async()=> {
    if (localIdentity(request.storeId) !== backendUrl) throw new Error('CHECKOUT_BACKEND_CHANGED')
    if (await readCheckoutGeneration(request.storeId) !== generation) throw new Error('CHECKOUT_BASKET_STALE')
    const recovery = await readCheckoutRecovery(request.storeId)
    if (recovery.blocked || recovery.confirmed.length) throw new Error('CHECKOUT_REVIEW_REQUIRED')
    const products = await readSnapshot('/products',request.storeId) as {data?:{list?:Array<{id:string;specs?:Array<{id:string}>}>}}
    const configs = await readSnapshot('/config',request.storeId) as {data?:{paymentMethods?:Record<string,unknown>}}
    const shifts = await readSnapshot('/shifts',request.storeId) as {data?:Array<{key:string}>}
    const current = await readSnapshot('/pos-cash/shifts/current',request.storeId) as {data?:{hasOpenShift?:boolean;shift?:{id?:string;shift?:string}}}
    if (!products.data?.list?.length || !configs.data?.paymentMethods || !Array.isArray(shifts.data) || !current.data?.hasOpenShift || !current.data.shift?.id || !shifts.data.some(s=>s.key===current.data!.shift!.shift && s.key!=='off')) throw new Error('OFFLINE_INITIALIZATION_REQUIRED')
    if (configs.data.paymentMethods[request.paymentMethod] !== true) throw new Error('PAYMENT_METHOD_DISABLED')
    if (cashTender) {
      const policy = configs.data.paymentMethods as Record<string,any>
      if (cashTender.receivedCash-cashTender.changeGiven!==totals.finalAmount || paymentProblem({ready:true,enabled:true,method:request.paymentMethod,total:totals.finalAmount,paid:String(cashTender.receivedCash),minAmount:policy.minAmount || 0,maxCashAmount:policy.maxCashAmount || 0,changeEnabled:policy.changeEnabled !== false})) throw new Error('PAYMENT_TENDER_INVALID')
    }
    if (!original.items?.length || original.items.some((i:{productId:string;specId:string;quantity:number})=>!products.data!.list!.some(p=>p.id===i.productId&&p.specs?.some(s=>s.id===i.specId)) || !Number.isSafeInteger(i.quantity)||i.quantity<1)) throw new Error('OFFLINE_INITIALIZATION_REQUIRED')
    if(request.activityOfflineToken){const cached=await readSnapshot('/marketing/activities/offline-snapshot',request.storeId) as any;const snapshot=cached.data
      if(!snapshot||snapshot.token!==request.activityOfflineToken||new Date(request.activityOccurredAt).getTime()>Date.parse(snapshot.expiresAt))throw Error('ACTIVITY_OFFLINE_CACHE_EXPIRED')
      const price=bestActivityPrice(snapshot.activities,request.items,{now:new Date(request.activityOccurredAt),channel:request.activityChannelCode,paymentMethod:request.paymentMethod})
      const tax=request.taxEnabled===false?0:Math.round(price.finalAmount*snapshot.taxRate)
      if(price.discount!==request.discountAmount||price.subtotal!==totals.subtotal||tax!==totals.ppn||price.finalAmount+tax!==totals.finalAmount)throw Error('ACTIVITY_OFFLINE_PRICE_CHANGED')
    }
    const catalog = await db.config.get(cacheKey(backendUrl,request.storeId,'/products'))
    if (!catalog?.value.version) throw new Error('OFFLINE_INITIALIZATION_REQUIRED')
    original.shiftSessionId = current.data.shift.id
    const activityCache = await db.config.get(cacheKey(backendUrl, request.storeId, '/marketing/activity-prices'))
    const row: LocalOrder = {localId,backendUrl,cashTender,cacheEvidence:{activityRules:activityCache?.value?.data?.data,activityVersion:activityCache?.value?.version,activityFetchedAt:activityCache?.updatedAt,backendUrl,catalogVersion:catalog.value.version,catalogFetchedAt:catalog.updatedAt,quotedProducts:JSON.parse(JSON.stringify(products.data.list.filter(p=>original.items.some((i:{productId:string})=>i.productId===p.id)))),paymentConfig:configs.data,shiftConfig:current.data},checkoutRequest:original,storeId:original.storeId,staffId:original.staffId,shiftSessionId:original.shiftSessionId,items:original.items,...totals,totalAmount:totals.subtotal,discountAmount:original.discountAmount||0,paymentMethod:original.paymentMethod,taxEnabled:original.taxEnabled,pointsRedeemed:0,orderNumber:original.orderNumber,pickupNumber:original.pickupNumber,customerCount:original.customerCount||1,status:'pending',syncAttempts:0,createdAt:occurredAt,occurredAt,locallyAcceptedAt:occurredAt,
      ...(manualQris?{manualPayment:{kind:'qris_manual' as const,actorId:auth.user!.id!,at:occurredAt,evidence:'customer_success_photo' as const,bankConfirmed:false as const}}:{})}
    row.id = await db.orders.add(row) as number
    await db.config.put({key:`checkout.generation:${encodeURIComponent(row.storeId)}`,value:crypto.randomUUID(),updatedAt:occurredAt})
    return row
  })
}
