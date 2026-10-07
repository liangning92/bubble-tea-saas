import {afterAll,jest} from '@jest/globals'
jest.mock('../src/services/ReferralService',()=>({processOrderReferralRewards:jest.fn(async()=>undefined)}))
import prisma from '../src/config/database'
import {inventoryUnitContract} from '../audit-contracts/inventory-units'
inventoryUnitContract(prisma)
afterAll(async()=>{await prisma.$disconnect()})
