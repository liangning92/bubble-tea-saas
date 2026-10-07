import {beforeEach,afterEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic'}}}))
jest.mock('../src/config/database',()=>({__esModule:true,default:{channel:{findMany:jest.fn(),createMany:jest.fn()}}}))
import {channelRouter as router} from '../src/routes/channel'
import prisma from '../src/config/database'
const db=prisma as any
const defaults=['DINE_IN','GOFOOD','GRAB','SHOPEE'].map(code=>({code,storeId:'synthetic'}))
async function read(){
 const route=(router as any).stack.find((l:any)=>l.route?.path==='/'&&l.route.methods.get).route
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(data:unknown){this.data=data;return this}}
 await route.stack.at(-1).handle({user:{storeId:'synthetic'},query:{}},res)
 return res
}
beforeEach(()=>{jest.resetAllMocks();jest.spyOn(console,'error').mockImplementation(()=>{})})
afterEach(()=>jest.restoreAllMocks())
test('concurrent default creation loser returns committed channels without overwrite',async()=>{
 db.channel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(defaults).mockResolvedValueOnce(defaults)
 db.channel.createMany.mockRejectedValue({code:'P2002'})
 const result=await read();expect(result.statusCode).toBe(200);expect(result.data.data.list).toEqual(defaults);expect(db.channel.createMany).toHaveBeenCalledTimes(1)
 expect(db.channel.findMany).toHaveBeenNthCalledWith(2,{where:{storeId:'synthetic'}})
})
test('unrelated database failure remains a failure',async()=>{
 db.channel.findMany.mockResolvedValueOnce([]);db.channel.createMany.mockRejectedValue({code:'P1001'})
 expect((await read()).statusCode).toBe(500);expect(db.channel.findMany).toHaveBeenCalledTimes(1)
})
test('unique conflict with incomplete defaults is not mistaken for successful bootstrap',async()=>{
 db.channel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(defaults.slice(0,1));db.channel.createMany.mockRejectedValue({code:'P2002'})
 expect((await read()).statusCode).toBe(500)
})
