import {expect,test} from '@jest/globals'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve(__dirname,'../..')
test('desktop SQLite datamodel stays aligned with server order and evidence fields',()=>{
 const pg=readFileSync(resolve(root,'server/prisma/schema.prisma'),'utf8')
 const sqlite=readFileSync(resolve(root,'server/prisma/schema.sqlite.prisma'),'utf8')
 expect(sqlite.replace('provider = "sqlite"','provider = "postgresql"')).toBe(pg)
})
test('Windows CI and local desktop packaging generate SQLite client; cloud keeps its default',()=>{
 const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'))
 expect(pkg.scripts['db:generate:sqlite']).toContain('--schema prisma/schema.sqlite.prisma')
 expect(pkg.scripts['electron:build']).toContain('npm run db:generate:sqlite &&')
 expect(pkg.scripts['db:generate']).toBe('cd server && npx prisma generate')
 const workflow=readFileSync(resolve(root,'.github/workflows/build-windows.yml'),'utf8')
 expect(workflow).toContain('node scripts/prepare-desktop-template.cjs')
 expect(workflow).toContain("Copy-Item (Join-Path $target 'schema.prisma') 'server/prisma/schema.prisma'")
})
