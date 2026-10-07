import {afterAll,beforeAll,expect} from '@jest/globals'
import prisma from '../src/config/database'
import {registerSearchCases} from '../audit-support/searchCases'
beforeAll(async()=>{
 const [row]=await prisma.$queryRawUnsafe<Array<{db:string;address:string|null}>>("SELECT current_database() AS db, inet_server_addr()::text AS address")
 expect(row.db).toBe('bubble_audit_test');expect(row.address).toBeNull()
})
afterAll(async()=>{await prisma.$disconnect()})
registerSearchCases(prisma,'postgresql')
