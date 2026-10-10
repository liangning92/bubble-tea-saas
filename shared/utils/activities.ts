// Shared deterministic activity evaluation. Amounts are integer IDR; end times are exclusive.
export const ACTIVITY_TYPES = ['special_price','percent','nth_cup','buy_get','fixed','tiered','bundle','addon','upgrade','gift','member_price','birthday','welcome','coupon','points','stamps','lottery','referral','group'] as const
export type ActivityType = typeof ACTIVITY_TYPES[number]
export interface Activity {
  id: string; storeId: string; version: number; name: string; description: string; theme?: string; categoryId?: string
  type: ActivityType; status: 'draft'|'published'|'paused'|'ended'; priority: number
  startsAt?: string; endsAt?: string; timezone: string; weekdays: number[]; dailyStart?: string; dailyEnd?: string
  channels: string[]; paymentMethods: string[]; excludedProductIds?:string[]; productIds: string[]; specIds: string[]; memberOnly: boolean; memberLevels: string[]
  showOnTv: boolean; imageUrl?: string; limit?: number; used: number; conflict?: string; source?: string
  rule: { price?: number; percent?: number; amount?: number; minAmount?: number; maxDiscount?: number; nth?: number; buy?: number; get?: number
    components?: {productId:string;specId?:string;quantity:number}[]; tiers?: {minAmount:number;amount:number;percent?:number}[]
    addonNames?: string[]; rewardIds?: string[]; couponId?: string; couponTrigger?:'paid'|'claim'; multiplier?: number; points?: number; stampsRequired?: number
    participants?: number; inviterPoints?: number; inviteePoints?: number; perMemberLimit?: number
    prizes?: {id:string;name:string;code:string;color:string;weight:number;remaining?:number;rewardId?:string;couponId?:string}[] }
}
export interface QuoteItem { productId:string;specId:string;quantity:number;unitPrice:number;addons?:{name:string;price:number;qty?:number}[] }
export interface ActivityContext { channel:string;paymentMethod?:string;now?:Date;member?:{id:string;level:string;birthday?:string;firstOrder?:boolean};groupActivityIds?:string[];unavailableIds?:string[] }
export interface PriceCandidate { id:string;version:number;name:string;discount:number;priority:number;kind:'activity'|'coupon'|'points';pointsRedeemed?:number }
export function localActivityTime(now:Date,timezone:string) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',month:'2-digit',day:'2-digit',hourCycle:'h23'}).formatToParts(now)
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||''
  return {day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),minute:Number(get('hour'))*60+Number(get('minute')),birthday:`${get('month')}-${get('day')}`}
}
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5))
export function activityState(a:Activity,now=new Date()):string {
  if(a.conflict)return 'review'
  if(a.status!=='published')return a.status
  if(a.endsAt&&now.getTime()>=Date.parse(a.endsAt))return 'ended'
  if(a.startsAt&&now.getTime()<Date.parse(a.startsAt))return 'scheduled'
  return 'active'
}
export function activityEligible(a:Activity,ctx:ActivityContext,includeAudience=true):boolean {
  const now=ctx.now||new Date()
  if(activityState(a,now)!=='active'||(a.limit!==undefined&&a.used>=a.limit)||ctx.unavailableIds?.includes(a.id))return false
  const local=localActivityTime(now,a.timezone)
  let day=local.day
  if(a.dailyStart&&a.dailyEnd){const start=minutes(a.dailyStart),end=minutes(a.dailyEnd)
    if(start<end){if(local.minute<start||local.minute>=end)return false}
    else {if(local.minute>=end&&local.minute<start)return false;if(local.minute<end)day=(day+6)%7}
  }
  if(a.weekdays.length&&!a.weekdays.includes(day))return false
  if(ctx.channel&&a.channels.length&&!a.channels.includes(ctx.channel))return false
  if(includeAudience){
    if(a.rule.perMemberLimit&&!ctx.member)return false
    if(a.paymentMethods.length&&(!ctx.paymentMethod||!a.paymentMethods.includes(ctx.paymentMethod)))return false
    if((a.memberOnly||a.memberLevels.length||['member_price','birthday','welcome'].includes(a.type))&&!ctx.member)return false
    if(a.memberLevels.length&&!a.memberLevels.includes(ctx.member?.level||''))return false
    if(a.type==='birthday'&&ctx.member?.birthday?.slice(5,10)!==local.birthday)return false
    if(a.type==='welcome'&&!ctx.member?.firstOrder)return false
    if(a.type==='group'&&!ctx.groupActivityIds?.includes(a.id))return false
  }
  return true
}
export const matchesActivityItem=(a:Activity,i:QuoteItem)=>!a.excludedProductIds?.includes(i.productId)&&( !a.productIds.length||a.productIds.includes(i.productId))&&(!a.specIds.length||a.specIds.includes(i.specId))
export const itemAmount=(i:QuoteItem)=>i.quantity*(i.unitPrice+(i.addons||[]).reduce((s,x)=>s+x.price*(x.qty||1),0))
export function activityDiscount(a:Activity,items:QuoteItem[],ctx:ActivityContext):number {
  if(!activityEligible(a,ctx))return 0
  const matching=items.filter(i=>matchesActivityItem(a,i)),base=matching.reduce((s,i)=>s+i.unitPrice*i.quantity,0),r=a.rule
  if(base<(r.minAmount||0))return 0
  let discount=0
  if(['special_price','member_price','birthday','welcome'].includes(a.type)){
    discount=r.price!==undefined?matching.reduce((s,i)=>s+Math.max(0,i.unitPrice-r.price!)*i.quantity,0):r.percent!==undefined?Math.round(base*r.percent/100):Math.min(base,r.amount||0)
  } else if(a.type==='percent')discount=Math.round(base*(r.percent||0)/100)
  else if(a.type==='fixed')discount=r.amount||0
  else if(a.type==='nth_cup'||a.type==='buy_get'){
    const cups=matching.flatMap(i=>Array(i.quantity).fill(i.unitPrice) as number[]).sort((x,y)=>y-x)
    const size=a.type==='nth_cup'?(r.nth||2):(r.buy||1)+(r.get||1),free=a.type==='nth_cup'?1:r.get||1
    for(let start=0;start+size<=cups.length;start+=size)for(let n=size-free;n<size;n++)discount+=Math.round(cups[start+n]*(a.type==='nth_cup'?(r.percent??50):100)/100)
  } else if(a.type==='tiered'){
    const tier=(r.tiers||[]).filter(t=>base>=t.minAmount).sort((x,y)=>y.minAmount-x.minAmount)[0]
    if(tier)discount=tier.percent!==undefined?Math.round(base*tier.percent/100):tier.amount
  } else if(a.type==='bundle'||a.type==='group'){
    if(a.type==='group'&&matching.reduce((s,i)=>s+i.quantity,0)<(r.participants||2))return 0
    if(a.type==='group')discount=r.price!==undefined?matching.reduce((s,i)=>s+Math.max(0,i.unitPrice-r.price!)*i.quantity,0):Math.round(base*(r.percent||0)/100)
    else {
      const remaining=matching.map(i=>({...i}));let bundles=0,bundleBase=0
      while(bundles<items.reduce((s,i)=>s+i.quantity,0)){let sum=0;const allocation:number[]=[];let possible=true
        for(const c of r.components||[]){let needed=c.quantity
          for(let n=0;n<remaining.length&&needed;n++){const i=remaining[n];if(i.productId!==c.productId||(c.specId&&i.specId!==c.specId))continue
            const take=Math.min(needed,i.quantity-(allocation[n]||0));if(take>0){allocation[n]=(allocation[n]||0)+take;sum+=take*i.unitPrice;needed-=take}}
          if(needed){possible=false;break}}
        if(!possible||!allocation.some(Boolean))break
        remaining.forEach((i,n)=>i.quantity-=allocation[n]||0);bundleBase+=Math.max(0,sum-(r.price||0));bundles++
      }
      discount=bundleBase
    }
  } else if(a.type==='addon')discount=matching.reduce((s,i)=>s+i.quantity*(i.addons||[]).filter(x=>!r.addonNames?.length||r.addonNames.includes(x.name)).reduce((t,x)=>t+Math.max(0,x.price-(r.price||0))*(x.qty||1),0),0)
  else if(a.type==='upgrade')discount=matching.reduce((s,i)=>s+Math.min(i.unitPrice,r.amount||0)*i.quantity,0)
  const ceiling=a.type==='addon'?matching.reduce((s,i)=>s+itemAmount(i),0):base
  return Math.max(0,Math.min(ceiling,Math.round(discount),r.maxDiscount===undefined?Infinity:r.maxDiscount))
}
export function bestActivityPrice(activities:Activity[],items:QuoteItem[],ctx:ActivityContext,extras:PriceCandidate[]=[]) {
  const subtotal=items.reduce((s,i)=>s+itemAmount(i),0)
  const candidates:PriceCandidate[]=[...extras,...activities.map(a=>({id:a.id,version:a.version,name:a.name,priority:a.priority,kind:'activity' as const,discount:activityDiscount(a,items,ctx)}))]
  const best=candidates.filter(c=>c.discount>0).map(c=>({...c,discount:Math.min(subtotal,c.discount)})).sort((a,b)=>b.discount-a.discount||b.priority-a.priority||a.id.localeCompare(b.id))[0]
  return {subtotal,discount:best?.discount||0,finalAmount:subtotal-(best?.discount||0),applied:best||null}
}
export function activitySummary(a:Activity):string {
  const r=a.rule
  const money=(n:number|undefined)=>`Rp ${(n||0).toLocaleString('id-ID')}`
  const benefit=r.price!==undefined?money(r.price):r.percent!==undefined?`${r.percent}% OFF`:money(r.amount)
  const rules:Partial<Record<ActivityType,string>>={special_price:benefit,member_price:benefit,birthday:`Birthday · ${r.couponId?'Coupon':benefit}`,welcome:`First order · ${r.couponId?'Coupon':benefit}`,percent:`${r.percent}% OFF`,nth_cup:`Cup ${r.nth}: ${r.percent}% OFF`,buy_get:`Buy ${r.buy}, Get ${r.get}`,fixed:`Min ${money(r.minAmount)}, Save ${money(r.amount)}`,tiered:(r.tiers||[]).map(t=>`Min ${money(t.minAmount)} → ${t.percent!==undefined?t.percent+'% OFF':money(t.amount)}`).join(' / '),bundle:`Bundle ${money(r.price)}`,group:`Group ${r.participants} · ${benefit}`,addon:`Topping ${money(r.price)}`,upgrade:`Upgrade −${money(r.amount)}`,gift:`Min ${money(r.minAmount)} · Gift`,coupon:r.couponTrigger==='claim'?'Member coupon':'Purchase → Coupon',points:`Points ×${r.multiplier||1}${r.points?' +'+r.points:''}`,stamps:`${r.stampsRequired} stamps → Gift`,lottery:`Min ${money(r.minAmount)} · Lucky draw`,referral:'Invite a friend · First purchase reward'}
  return `${a.name} · ${rules[a.type]||a.description||a.type}`
}
