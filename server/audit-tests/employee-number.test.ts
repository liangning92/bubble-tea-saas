import {beforeEach,expect,jest,test} from '@jest/globals'
import {allocateEmployeeNumber,formatEmployeeNumber,EMPLOYEE_NUMBER_PATTERN} from '../src/services/EmployeeNumberService'
beforeEach(() => { process.env.DATABASE_URL = 'file:synthetic-test.db' })
function mock(numbers:string[],saved='0') { return {store:{findFirst:jest.fn(async()=>({id:'store'}))},config:{upsert:jest.fn(async()=>({value:saved})),update:jest.fn(async()=>({}))},staff:{findMany:jest.fn(async()=>numbers.map(employeeNumber=>({employeeNumber})))}} }
test('fixed format and invalid capacity fail closed',()=>{expect(formatEmployeeNumber(1)).toBe('EMP001');expect(formatEmployeeNumber(999)).toBe('EMP999');expect(EMPLOYEE_NUMBER_PATTERN.test('EMP000')).toBe(false);for(const n of [0,1000,-1,1.5,NaN])expect(()=>formatEmployeeNumber(n)).toThrow()})
test('ignores old timestamp formats and preserves existing sequential numbers',async()=>{const tx=mock(['EMP001','EMP004','EMP179180216226890d2f596']);expect(await allocateEmployeeNumber(tx as any)).toBe('EMP005');expect(tx.config.update).toHaveBeenCalledWith(expect.objectContaining({data:{value:'5'}}))})
test('does not reuse deleted high numbers',async()=>{expect(await allocateEmployeeNumber(mock(['EMP001'],'10') as any)).toBe('EMP011')})
test('rejects malformed sequence metadata',async()=>{await expect(allocateEmployeeNumber(mock([],'corrupt') as any)).rejects.toThrow('EMPLOYEE_NUMBER_COUNTER_INVALID')})
test('rejects capacity instead of changing number format',async()=>{await expect(allocateEmployeeNumber(mock(['EMP999']) as any)).rejects.toThrow('EMPLOYEE_NUMBER_CAPACITY_EXCEEDED')})

test('PostgreSQL uses the same sequence as the database guard',async()=>{process.env.DATABASE_URL='postgresql://synthetic';const tx={$queryRaw:jest.fn(async()=>[{value:9}])};expect(await allocateEmployeeNumber(tx as any)).toBe('EMP009');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)})
