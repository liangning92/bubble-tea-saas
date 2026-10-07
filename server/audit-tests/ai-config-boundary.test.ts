import {expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{config:{findMany:jest.fn(),findUnique:jest.fn(),upsert:jest.fn(),delete:jest.fn()},$transaction:jest.fn()}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic'}}}))
import prisma from '../src/config/database'
import {configRouter} from '../src/routes/config'
const db=prisma as any
async function call(method:string,path:string,body:unknown={}){
 const route=(configRouter as any).stack.find((l:any)=>l.route?.path===path&&l.route.methods[method]).route
 const req:any={body,params:{storeId:'a',key:'ai.operations.policy'},user:{id:'u',storeId:'a',role:'admin'},headers:{}}
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(data:unknown){this.data=data;return this}}
 for(const layer of route.stack){let next=false;await layer.handle(req,res,()=>{next=true});if(!next)break}return res
}
test.each([['get','/:storeId/:key',{}],['delete','/:storeId/:key',{}],['post','/',{storeId:'a',key:'ai.operations.policy',value:{executionEnabled:true},category:'store'}],['post','/batch',{storeId:'a',configs:[{key:'ai.operations.policy',value:{executionEnabled:true},category:'store'}]}]])('generic config %s %s cannot bypass reserved policy API',async(method,path,body)=>{
 expect((await call(method as string,path as string,body)).statusCode).toBe(403)
 expect(db.config.upsert).not.toHaveBeenCalled();expect(db.config.delete).not.toHaveBeenCalled()
})
