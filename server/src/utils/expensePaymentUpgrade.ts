import { PrismaClient } from '@prisma/client'
import { mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
export const expensePaymentAdditions=[['Expense','paymentSource',"TEXT NOT NULL DEFAULT 'unknown'"],['Expense','cashSessionId','TEXT'],['Expense','cashOccurredAt','DATETIME']] as const
export async function upgradeExpensePayments(db:PrismaClient,url:string){
 if(url.startsWith('file:')){
  const columns=await db.$queryRawUnsafe<{name:string}[]>('PRAGMA table_info("Expense")')
  if(expensePaymentAdditions.some(([,name])=>!columns.some(c=>c.name===name))){
   const files=await db.$queryRawUnsafe<{name:string;file:string}[]>('PRAGMA database_list'),file=files.find(f=>f.name==='main')?.file
   if(!file)throw Error('EXPENSE_PAYMENT_REQUIRES_FILE')
   const folder=path.join(path.dirname(file),'upgrade-backups');await mkdir(folder,{recursive:true,mode:0o700})
   const backup=path.join(folder,`${path.basename(file)}.expense-payment.${randomUUID()}.db`)
   await db.$executeRawUnsafe('VACUUM INTO ?',backup)
   const check=new PrismaClient({datasources:{db:{url:'file:'+backup}}})
   try{const rows=await check.$queryRawUnsafe<{integrity_check:string}[]>('PRAGMA integrity_check');if(rows.length!==1||rows[0].integrity_check!=='ok')throw Error('EXPENSE_PAYMENT_BACKUP_INVALID')}finally{await check.$disconnect()}
   await db.$transaction(async tx=>{
    const current=await tx.$queryRawUnsafe<{name:string}[]>('PRAGMA table_info("Expense")')
    for(const [table,name,type] of expensePaymentAdditions)if(!current.some(c=>c.name===name))await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${type}`)
   })
  }
 }
 await db.expense.findFirst({select:{paymentSource:true,cashSessionId:true,cashOccurredAt:true}})
}
