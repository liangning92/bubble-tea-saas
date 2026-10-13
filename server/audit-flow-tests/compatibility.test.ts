import {beforeAll,afterAll} from '@jest/globals'
import prisma from '../src/config/database'
import {inventoryUnitContract} from '../audit-contracts/inventory-units'
import {inventoryCostReview} from '../audit-contracts/inventory-cost-review'
import {inventoryCountContract} from '../audit-contracts/inventory-count'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {pgLedgerDDL,assertLedgerInstalled} from '../src/utils/inventoryLedger'
beforeAll(async()=>{
 if(process.env.DATABASE_URL!.startsWith('file:'))await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!)
 else{try{await assertLedgerInstalled(prisma,false)}catch{for(const sql of pgLedgerDDL)await prisma.$executeRawUnsafe(sql)}}
})
inventoryUnitContract(prisma);inventoryCostReview(prisma);inventoryCountContract(prisma)
afterAll(()=>prisma.$disconnect())
