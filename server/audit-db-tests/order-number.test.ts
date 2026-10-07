import {afterAll,jest} from '@jest/globals'
jest.mock('../src/services/ReferralService',()=>({processOrderReferralRewards:jest.fn(async()=>undefined)}))
import prisma from '../src/config/database'
import {orderNumberContract} from '../audit-contracts/order-number'
orderNumberContract(prisma)
afterAll(async()=>{await prisma.$disconnect()})
