import prisma from '../config/database'
import { ActivityPriceRule } from '../utils/activityPricing'
import { ACTIVITY_PREFIX, ensureMigrated } from './ActivityService'
// Compatibility only. Unified POS quotes whole orders rather than stacking per-product reductions.
export async function getActivityPriceRules(storeId:string):Promise<ActivityPriceRule[]> {
 const migrated=await prisma.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'migration'}}})
 if(migrated)return []
 await ensureMigrated(storeId)
 return []
}
