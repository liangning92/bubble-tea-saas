import prisma from '../config/database'
export async function changeMemberBalance(id:string,storeId:string,amount:number,type:'topup'|'deduct',operatorId:string,note?:string,requestId?:string) {
  if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('INVALID_BALANCE_AMOUNT')
  if(!requestId || !/^[0-9a-f-]{36}$/i.test(requestId))throw new Error('BALANCE_REQUEST_ID_REQUIRED')
  return prisma.$transaction(async tx=>{
    const locked=await tx.member.updateMany({where:{id,storeId},data:{balance:{increment:0}}})
    if(locked.count!==1)throw new Error('MEMBER_NOT_FOUND_OR_INSUFFICIENT_BALANCE')
    const key=`member.balance.${id}.${requestId}`
    const prior=await tx.config.findUnique({where:{storeId_key:{storeId,key}}})
    if(prior){const receipt=JSON.parse(prior.value);if(receipt.amount!==amount||receipt.type!==type||receipt.operatorId!==operatorId)throw new Error('BALANCE_IDEMPOTENCY_CONFLICT');return {member:{balance:receipt.log.balanceAfter},log:receipt.log}}
    const changed=await tx.member.updateMany({where:{id,storeId,...(type==='deduct'?{balance:{gte:amount}}:{})},data:{balance:{increment:type==='topup'?amount:-amount}}})
    if(changed.count!==1)throw new Error('MEMBER_NOT_FOUND_OR_INSUFFICIENT_BALANCE')
    const member=await tx.member.findUniqueOrThrow({where:{id}})
    const delta=type==='topup'?amount:-amount
    const log=await tx.memberBalanceLog.create({data:{memberId:id,type,amount:delta,balanceBefore:member.balance-delta,balanceAfter:member.balance,operatorId,note:note||type}})
    await tx.config.create({data:{storeId,key,category:'member_balance',value:JSON.stringify({amount,type,operatorId,log})}})
    return {member,log}
  })
}
