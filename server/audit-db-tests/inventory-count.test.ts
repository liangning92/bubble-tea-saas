import {afterAll} from '@jest/globals'
import prisma from '../src/config/database'
import {inventoryCountContract} from '../audit-contracts/inventory-count'
inventoryCountContract(prisma)
afterAll(async()=>{await prisma.$disconnect()})
import {countBoundaryContract} from '../audit-contracts/count-boundary'
countBoundaryContract(prisma)
import {ledgerWatermarkContract} from '../audit-contracts/ledger-watermark'
ledgerWatermarkContract(prisma)
