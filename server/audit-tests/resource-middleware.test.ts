import { expect,jest,test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-test-only'}}}))
import {requireResourceStore} from '../src/middlewares/resourceStore'
test.each([['manager','a',200,true],['manager','b',403,false],['admin','b',200,true],['manager',null,404,false]])('resource scope %s %s',async(role,storeId,expected,allowed)=>{
 const load=jest.fn(async()=>storeId?{storeId:String(storeId)}:null)
 const next=jest.fn();const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(){return this}}
 await requireResourceStore(load)({user:{role,storeId:'a'}} as any,res,next)
 expect(res.statusCode).toBe(expected);expect(next).toHaveBeenCalledTimes(allowed?1:0)
})
test('lookup failure is forwarded, never converted into authorization success',async()=>{
 const error=new Error('synthetic lookup failure');const next=jest.fn()
 await requireResourceStore(async()=>{throw error})({user:{role:'manager',storeId:'a'}} as any,{} as any,next)
 expect(next).toHaveBeenCalledWith(error)
})
