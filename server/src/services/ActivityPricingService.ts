import prisma from '../config/database'
import { ActivityPriceRule } from '../utils/activityPricing'
const list = (value:string|null):any[] => {try {const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed:[]}catch{return []}}
export async function getActivityPriceRules(storeId:string):Promise<ActivityPriceRule[]> {
  const [specials,tv] = await Promise.all([prisma.timedSpecial.findMany({where:{storeId,status:'active'}}),prisma.config.findUnique({where:{storeId_key:{storeId,key:'tv_screen_marketing_config'}}})])
  const rules:ActivityPriceRule[] = specials.map(s=>({id:s.id,productId:s.productId,price:s.specialPrice,daysOfWeek:list(s.daysOfWeek),channels:list(s.applicableChannels),startTime:s.startTime.toISOString(),endTime:s.endTime.toISOString(),status:s.status}))
  let config:any;try{config=JSON.parse(tv?.value||'{}')}catch{config={}}
  if(Array.isArray(config.dailySpecials))config.dailySpecials.forEach((s:any,index:number)=>{if(s.autoPrice===true && s.productId)rules.push({id:`daily:${index}`,productId:s.productId,price:s.specialPrice,daysOfWeek:[s.dayOfWeek],channels:s.applicableChannels?.length?s.applicableChannels:['DINE_IN','TAKEAWAY'],status:'active'})})
  return rules
}
