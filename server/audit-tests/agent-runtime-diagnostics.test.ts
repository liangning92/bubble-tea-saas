import {test,expect} from '@jest/globals'
import {employeeExecutionDiagnostic} from '../src/services/teamAgentBridge/employeeRuntimeDiagnostics'
test('administrator run diagnostics expose only phase/counts/safe fault code',()=>{
 const raw={phase:'unknown',turn:2,inputs:[{authorization:'secret',messages:['private']}],responses:[{private:'reply'}],tools:[{args:'confidential'}],fault:{code:'EMPLOYEE_RUNTIME_UNCONFIRMED'},ticket:{credential:'private'}}
 expect(employeeExecutionDiagnostic(JSON.stringify(raw),'2026-10-29T05:00:00Z')).toEqual({phase:'unknown',turn:2,inputs:1,responses:1,tools:1,faultCode:'EMPLOYEE_RUNTIME_UNCONFIRMED',updatedAt:'2026-10-29T05:00:00.000Z'})
 expect(employeeExecutionDiagnostic(JSON.stringify({...raw,fault:{code:'Bearer secret'}}),'2026-10-29T05:00:00Z')?.faultCode).toBeNull()
 expect(employeeExecutionDiagnostic('{','2026-10-29T05:00:00Z')).toBeNull()
})
