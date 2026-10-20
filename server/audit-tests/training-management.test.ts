import { beforeEach, expect, jest, test } from '@jest/globals'
import { randomUUID } from 'crypto'
// Catalogue history fixture has no staff. Publication notification recipients
// are exercised separately against disposable PostgreSQL.
jest.mock('../src/config/database',()=>({__esModule:true,default:{config:{},staff:{findMany:async()=>[]},$transaction:jest.fn()}}))
jest.mock('../src/services/TrainingVideoStore',()=>({validateVideoReferences:jest.fn(async()=>{})}))
jest.mock('../src/services/TrainingDocumentStore',()=>({validateDocumentReferences:jest.fn(async()=>{})}))
import prisma from '../src/config/database'
import seed from '../src/data/training-library.json'
import { validateLibrary, editTrainingLibrary, readTrainingLibrary, writeTrainingLibrary } from '../src/services/TrainingLibraryStore'
const admin={id:'admin',storeId:'store-a',role:'admin'},staff={...admin,id:'staff',role:'staff'},db=prisma as any
const rows=new Map<string,any>()
beforeEach(()=>{
 rows.clear()
 db.config.findUnique=async({where}:any)=>rows.get(where.storeId_key.storeId+':'+where.storeId_key.key)||null
 db.config.create=async({data}:any)=>{const row={...data,id:randomUUID()};rows.set(data.storeId+':'+data.key,row);return row}
 db.config.updateMany=async({where,data}:any)=>{const row=[...rows.values()].find(row=>row.id===where.id&&row.storeId===where.storeId&&row.value===where.value);if(!row)return {count:0};Object.assign(row,data);return {count:1}}
 db.$transaction=async(fn:any)=>fn(db)
})
test('legacy saved catalogues receive standards; an explicit empty standards list remains empty',()=>{
 const {checklists,...legacy}=seed
 expect(validateLibrary(legacy).checklists).toEqual(checklists)
 expect(validateLibrary({...legacy,checklists:[]}).checklists).toEqual([])
 expect(()=>validateLibrary({...seed,checklists:[checklists[0],checklists[0]]})).toThrow('TRAINING_CONTENT_INVALID')
})
test('draft changes and deletion publish to the same store only, with history and conflict protection',async()=>{
 const value=structuredClone(seed);value.modules[0].title.zh='定制课程';value.checklists[0].items[0].zh='定制开店标准'
 const saveId=randomUUID();await writeTrainingLibrary(admin,'save',{requestId:saveId,expectedGeneration:null,catalogue:value})
 expect((await readTrainingLibrary(staff)).modules[0].title.zh).not.toBe('定制课程')
 const publishId=randomUUID();await writeTrainingLibrary(admin,'publish',{requestId:publishId,expectedGeneration:saveId})
 expect((await readTrainingLibrary(staff)).checklists[0].items[0].zh).toBe('定制开店标准')
 expect((await readTrainingLibrary({...staff,storeId:'store-b'})).modules[0].title.zh).not.toBe('定制课程')
 await expect(writeTrainingLibrary(admin,'save',{requestId:randomUUID(),expectedGeneration:saveId,catalogue:value})).rejects.toThrow('TRAINING_VERSION_CONFLICT')
 await expect(editTrainingLibrary(staff)).rejects.toThrow('TRAINING_EDIT_FORBIDDEN')
 await expect(writeTrainingLibrary(staff,'save',{requestId:randomUUID(),expectedGeneration:publishId,catalogue:value})).rejects.toThrow('TRAINING_EDIT_FORBIDDEN')
 const empty={version:1,modules:[],checklists:[]};const emptyId=randomUUID();await writeTrainingLibrary(admin,'save',{requestId:emptyId,expectedGeneration:publishId,catalogue:empty})
 await writeTrainingLibrary(admin,'publish',{requestId:randomUUID(),expectedGeneration:emptyId})
 expect((await readTrainingLibrary(staff)).modules).toEqual([]);expect((await readTrainingLibrary(staff)).checklists).toEqual([])
 expect(rows.get('store-a:training.library.revision:'+saveId)).toBeTruthy()
})
