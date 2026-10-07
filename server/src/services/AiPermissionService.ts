import { z } from 'zod'
import prisma from '../config/database'
export const AI_POLICY_KEY = 'ai.operations.policy'
export const aiPolicySchema = z.object({
  executionEnabled: z.literal(false),
  read: z.object({ sales: z.boolean(), inventory: z.boolean() }).strict(),
  actions: z.object({ refund: z.enum(['deny','approval','automatic']), purchase: z.enum(['deny','approval','automatic']), price: z.enum(['deny','approval','automatic']) }).strict()
}).strict()
export type AiPolicy = z.infer<typeof aiPolicySchema>
export interface AiPolicyActor { id: string; role: string; storeId: string }
export function assertAiAdmin(actor: AiPolicyActor, storeId: string) {
  if (!actor?.id || actor.role !== 'admin' || !storeId || actor.storeId !== storeId) throw new Error('AI_POLICY_ACCESS_DENIED')
}
export function defaultAiPolicy(): AiPolicy { return { executionEnabled:false, read:{sales:false,inventory:false}, actions:{refund:'deny',purchase:'deny',price:'deny'} } }
export async function getAiPolicy(actor: AiPolicyActor, storeId: string) {
  assertAiAdmin(actor,storeId)
  const record=await prisma.config.findUnique({where:{storeId_key:{storeId,key:AI_POLICY_KEY}}})
  if (!record) return defaultAiPolicy()
  try { return aiPolicySchema.parse(JSON.parse(record.value)) } catch { return defaultAiPolicy() }
}
export async function saveAiPolicy(actor: AiPolicyActor, storeId: string, input: unknown) {
  assertAiAdmin(actor,storeId)
  const policy=aiPolicySchema.parse(input)
  return prisma.$transaction(async tx=>{
    const previous=await tx.config.findUnique({where:{storeId_key:{storeId,key:AI_POLICY_KEY}}})
    const record=await tx.config.upsert({where:{storeId_key:{storeId,key:AI_POLICY_KEY}},create:{storeId,key:AI_POLICY_KEY,category:'ai',value:JSON.stringify(policy)},update:{value:JSON.stringify(policy)}})
    await tx.financeAuditLog.create({data:{storeId,userId:actor.id,action:'update',entityType:'ai_permission_draft',entityId:record.id,description:'Update disabled AI permission draft',oldValue:previous?.value,newValue:record.value}})
    return policy
  })
}
/** Deliberately unconditional until a separately reviewed executor exists. */
export function rejectAiExecution(): never { throw new Error('AI_EXECUTION_NOT_AVAILABLE') }
