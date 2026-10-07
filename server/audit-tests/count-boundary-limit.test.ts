import {expect,jest,test} from '@jest/globals'
jest.mock('../src/utils/inventoryLedger',()=>({assertLedgerInstalled:jest.fn(async()=>undefined)}))
import {captureCountBoundary} from '../src/utils/countObservation'
test('compact boundary reads one inventory cursor, never enumerates historical ledger IDs',async()=>{
 const tx:any={inventory:{findUniqueOrThrow:jest.fn(async()=>({ledgerSequence:9000000000000n,ledgerEpoch:4n}))},stockInLog:{findMany:jest.fn()},stockOutLog:{findMany:jest.fn()}}
 expect(await captureCountBoundary(tx,'i')).toEqual({inventoryId:'i',sequence:'9000000000000',epoch:'4'})
 expect(tx.stockInLog.findMany).not.toHaveBeenCalled();expect(tx.stockOutLog.findMany).not.toHaveBeenCalled()
})
