import { PrismaClient, Prisma } from '@prisma/client'
type DB = Pick<PrismaClient, 'config'> | Pick<Prisma.TransactionClient, 'config'>
type StaffIdentity = { id:string;storeId:string;userId?:string;user?:{role:string} }
const key=(id:string)=>`staff.identity.${id}`
// Login permission and employment participation are separate concerns.
export async function isPayrollEmployee(db:DB, staff:StaffIdentity):Promise<boolean> {
 const user=staff.user || (staff.userId && (db as any).user ? await (db as any).user.findUnique({where:{id:staff.userId},select:{role:true}}):null)
 if(user?.role!=='admin')return true
 const row=await db.config.findUnique({where:{storeId_key:{storeId:staff.storeId,key:key(staff.id)}}})
 return row ? JSON.parse(row.value)?.payrollEmployee===true : false
}
export async function saveStaffIdentity(db:DB,staff:StaffIdentity,payrollEmployee:boolean){
 await db.config.upsert({where:{storeId_key:{storeId:staff.storeId,key:key(staff.id)}},create:{storeId:staff.storeId,key:key(staff.id),category:'staff',value:JSON.stringify({payrollEmployee})},update:{value:JSON.stringify({payrollEmployee})}})
}
