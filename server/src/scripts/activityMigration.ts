import prisma from '../config/database'
import { migrateActivities } from '../services/ActivityService'

// Explicit operator tool: preview is the default, before any terminal reads can migrate data.
async function main(){
 const args=process.argv.slice(2),storeIndex=args.indexOf('--store'),storeId=args[storeIndex+1]
 if(storeIndex<0||!storeId||args.some((arg,index)=>!['--store','--apply'].includes(arg)&&index!==storeIndex+1))throw Error('Usage: npm run activities:migrate -- --store STORE_ID [--apply]')
 if(!await prisma.store.findUnique({where:{id:storeId},select:{id:true}}))throw Error('Store not found')
 const result=await migrateActivities(storeId,!args.includes('--apply'))
 process.stdout.write(JSON.stringify({storeId,...result},null,2)+'\n')
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>prisma.$disconnect())
