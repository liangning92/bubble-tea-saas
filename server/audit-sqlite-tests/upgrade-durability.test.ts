import {afterEach,expect,jest,test} from '@jest/globals'
import {PrismaClient} from '@prisma/client'
const fs:typeof import('fs/promises')=require('fs/promises')
import path from 'path'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
const root=process.env.AUDIT_SQLITE_ROOT!
afterEach(()=>jest.restoreAllMocks())
test('backup fsync uses nontruncating writable descriptor and preserves actual snapshot bytes/data',async()=>{
 const file=path.join(root,'durability.db');await fs.copyFile(path.join(root,'before-migration.db'),file)
 const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});const realOpen=fs.open
 let flushed=false
 const spy=jest.spyOn(fs,'open').mockImplementation(async(...args:Parameters<typeof fs.open>)=>{
  expect(args[1]).toBe('r+')
  const before=await fs.readFile(args[0]);expect(before.length).toBeGreaterThan(0)
  const handle=await realOpen(...args);const realSync=handle.sync.bind(handle)
  handle.sync=async()=>{await realSync();expect(await fs.readFile(args[0])).toEqual(before);flushed=true}
  return handle
 })
 try{const result=await upgradeLocalSqlite(db,`file:${file}`);expect(flushed).toBe(true);expect(spy).toHaveBeenCalledTimes(1)
  const backup=new PrismaClient({datasources:{db:{url:`file:${result.backupPath}`}}})
  try{const rows=await backup.$queryRawUnsafe<Array<{id:string}>>("SELECT id FROM \"Order\" WHERE id='legacy-order'");expect(rows[0].id).toBe('legacy-order');expect(await backup.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name='LocalSchemaMigration'")).toEqual([])}finally{await backup.$disconnect()}
 }finally{await db.$disconnect()}
})
test('backup flush failure blocks DDL and preserves original database',async()=>{
 const file=path.join(root,'flush-failed.db');await fs.copyFile(path.join(root,'before-migration.db'),file)
 const before=await fs.readFile(file);const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});const realOpen=fs.open
 jest.spyOn(fs,'open').mockImplementation(async(...args:Parameters<typeof fs.open>)=>{const handle=await realOpen(...args);handle.sync=async()=>{throw new Error('SYNTHETIC_FLUSH_FAILED')};return handle})
 try{await expect(upgradeLocalSqlite(db,`file:${file}`)).rejects.toThrow('SYNTHETIC_FLUSH_FAILED');expect(await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name='LocalSchemaMigration'")).toEqual([])}finally{await db.$disconnect()}
 expect(await fs.readFile(file)).toEqual(before)
})
