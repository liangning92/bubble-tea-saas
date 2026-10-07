import {expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-test-only'}}}))
jest.mock('../src/services/InventoryService',()=>({}))
import {inventoryRouter} from '../src/routes/inventory'
test.each(['/batches','/consumption-analysis','/anomaly-summary','/alert-config'])('%s is not shadowed by inventory id route',path=>{
 const first=(inventoryRouter as any).stack.find((l:any)=>l.route?.methods.get && l.match(path))
 expect(first.route.path).toBe(path)
})
